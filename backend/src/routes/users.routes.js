const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const {
  authenticate, requireTenant, requirePermission, enforceLimit, invalidateUserCache,
} = require('../middleware/auth.middleware');
const { audit } = require('../services/audit.service');
const { sendUserInvite } = require('../services/email.service');

const router = Router();
router.use(authenticate, requireTenant);

// Mint a 7-day "invite" JWT scoped to a single user. Used for magic-link
// signup so an admin can invite teammates without setting a password for them.
function mintInviteToken(userId, tenantId) {
  return jwt.sign(
    { id: userId, tenantId, purpose: 'invite' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function inviteUrl(token) {
  const base = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${base}/accept-invite?token=${encodeURIComponent(token)}`;
}

// Keep only roleIds that actually belong to this tenant. Without this a
// tenant admin could attach a role from another tenant (leaking its
// permissions) by passing a guessed/leaked roleId. Mirrors the
// assertSameTenantPair guard in role.routes.js.
async function filterTenantRoleIds(req, roleIds) {
  const ids = (Array.isArray(roleIds) ? roleIds : []).filter(Boolean);
  if (!ids.length) return [];
  const owned = await prisma.tenantRole.findMany({
    where: { id: { in: ids }, tenantId: req.tenant.id },
    select: { id: true },
  });
  return owned.map((r) => r.id);
}

// List users in the tenant + any platform admins (who can impersonate the tenant).
// Platform admins are surfaced so tenant admins know who has cross-tenant access.
router.get('/', requirePermission('users.read'), async (req, res) => {
  const tenantUsers = await prisma.user.findMany({
    where: { tenantId: req.tenant.id },
    select: {
      id: true, name: true, email: true, phone: true, role: true, isActive: true,
      isPlatformAdmin: true, createdAt: true,
      // Selected so we can derive `pendingInvite` below; stripped before
      // sending. NEVER include the hash in the JSON response.
      password: true,
      roles: { include: { role: { select: { id: true, code: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const platformAdmins = await prisma.user.findMany({
    where: { isPlatformAdmin: true },
    select: {
      id: true, name: true, email: true, phone: true, role: true, isActive: true,
      isPlatformAdmin: true, createdAt: true,
      // Selected so we can derive `pendingInvite` below; stripped before
      // sending. NEVER include the hash in the JSON response.
      password: true,
      roles: { include: { role: { select: { id: true, code: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  // De-dup: a platform admin who is ALSO a tenant member shouldn't appear twice
  const tenantIds = new Set(tenantUsers.map((u) => u.id));
  const combined = [...tenantUsers, ...platformAdmins.filter((u) => !tenantIds.has(u.id))];

  // Derive pendingInvite from password presence + scrub the hash so it never
  // leaves the server. A pending invite = invited via magic-link, hasn't yet
  // set a password (and is therefore inactive). Deactivated users have a
  // password but isActive=false, so they don't get the flag.
  const sanitized = combined.map((u) => {
    const { password, ...rest } = u;
    return { ...rest, pendingInvite: !password && !u.isActive && !u.isPlatformAdmin };
  });
  res.json(sanitized);
});

// Invite / create a user.
//
// Two modes:
//   1. With `password` in the body  → user is created active with the given
//      password. Same as before; useful when the admin wants to hand-set
//      credentials.
//   2. Without password             → user is created INACTIVE with no
//      password, and a 7-day magic-link invite is emailed. The recipient
//      sets their own password via /accept-invite?token=... and the account
//      is activated on first use. This is the recommended path.
router.post('/',
  requirePermission('users.create'),
  enforceLimit('users'),
  async (req, res) => {
    try {
      const { name, email, password, roleIds = [] } = req.body;
      if (!email) return res.status(400).json({ error: 'email is required' });

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ error: 'Email already in use' });

      const isInvite = !password;
      const user = await prisma.user.create({
        data: {
          name: name || email.split('@')[0],
          email,
          password: password ? await bcrypt.hash(password, 12) : null,
          tenantId: req.tenant.id,
          role: 'STAFF',
          emailVerified: false,
          // Invited users stay inactive until they redeem the magic link.
          isActive: !isInvite,
          provider: 'LOCAL',
        },
        select: { id: true, name: true, email: true, createdAt: true, isActive: true },
      });
      const safeRoleIds = await filterTenantRoleIds(req, roleIds);
      if (safeRoleIds.length) {
        await prisma.userRole.createMany({
          data: safeRoleIds.map((rid) => ({ userId: user.id, roleId: rid })),
          skipDuplicates: true,
        });
      }
      audit({
        req,
        action: isInvite ? 'users.invite' : 'users.create',
        resource: 'user',
        resourceId: user.id,
        metadata: { invited: isInvite },
      });

      // Send the invite email (best-effort; SMTP outages must not break the
      // create). For password-set users we still send a welcome ping pointing
      // them to the login page.
      try {
        const businessName = req.tenant?.businessName || 'your team';
        const url = isInvite
          ? inviteUrl(mintInviteToken(user.id, req.tenant.id))
          : `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?email=${encodeURIComponent(email)}`;
        await sendUserInvite({
          to: email,
          inviterName: req.user?.name || req.user?.email || 'A teammate',
          businessName,
          inviteUrl: url,
        });
      } catch (mailErr) {
        console.warn('[users.create] invite email failed:', mailErr.message);
      }

      res.status(201).json({ ...user, invited: isInvite });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Resend the magic-link invite. Only valid while the user has no password
// (still in pending state). Returns the URL in dev so admins can copy it
// even when SMTP isn't configured; in production we never echo the URL.
router.post('/:id/resend-invite', requirePermission('users.create'), async (req, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.password) return res.status(400).json({ error: 'User has already accepted the invite' });

    const token = mintInviteToken(user.id, req.tenant.id);
    const url = inviteUrl(token);
    try {
      await sendUserInvite({
        to: user.email,
        inviterName: req.user?.name || req.user?.email || 'A teammate',
        businessName: req.tenant?.businessName || 'your team',
        inviteUrl: url,
      });
    } catch (mailErr) {
      console.warn('[users.resend-invite] email failed:', mailErr.message);
    }
    audit({ req, action: 'users.invite.resend', resource: 'user', resourceId: user.id });
    res.json({
      ok: true,
      // Surface the URL only in non-production so admins can paste it manually
      // when SMTP isn't wired yet. In prod, force them to use the email path.
      ...(process.env.NODE_ENV !== 'production' ? { devInviteUrl: url } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user (name, active, roles)
router.put('/:id', requirePermission('users.update'), async (req, res) => {
  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
  });
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const { name, isActive, roleIds } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(isActive !== undefined && { isActive }),
    },
  });
  if (Array.isArray(roleIds)) {
    const safeRoleIds = await filterTenantRoleIds(req, roleIds);
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    if (safeRoleIds.length) {
      await prisma.userRole.createMany({
        data: safeRoleIds.map((rid) => ({ userId: user.id, roleId: rid })),
        skipDuplicates: true,
      });
    }
  }
  invalidateUserCache(user.id);
  audit({ req, action: 'users.update', resource: 'user', resourceId: user.id });
  res.json({ id: user.id, name: user.name, email: user.email, isActive: user.isActive });
});

// Deactivate
router.delete('/:id', requirePermission('users.delete'), async (req, res) => {
  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
  });
  if (!existing) return res.status(404).json({ error: 'User not found' });
  if (existing.id === req.user.id) return res.status(400).json({ error: "You can't delete yourself" });

  await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
  invalidateUserCache(req.params.id);
  audit({ req, action: 'users.delete', resource: 'user', resourceId: req.params.id });
  res.json({ message: 'User deactivated' });
});

// List all permissions available for role assignment
router.get('/_permissions/catalog', requirePermission('roles.read'), async (_req, res) => {
  const perms = await prisma.permission.findMany({
    orderBy: [{ module: 'asc' }, { code: 'asc' }],
  });
  res.json(perms);
});

module.exports = router;
