const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { register, login, googleAuth, getMe, onboardBusiness } = require('../controllers/auth.controller');
const { authenticate, invalidateUserCache, requirePermission } = require('../middleware/auth.middleware');
const prisma = require('../utils/prisma');
const db = require('../utils/db');
const { generateSecret, verifyTOTP, otpauthUrl } = require('../utils/totp');
const { audit } = require('../services/audit.service');
const { sendPasswordReset } = require('../services/email.service');
const { issueSessionToken, revokeSession, revokeAllForUser } = require('../services/session.service');

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/onboard', onboardBusiness);
router.get('/me', authenticate, getMe);

// Self-service profile update (name + phone only)
router.patch('/me', authenticate, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const data = {};
    if (name != null) data.name = String(name).trim().slice(0, 191);
    if (phone != null) data.phone = String(phone).trim().slice(0, 30);
    if (!Object.keys(data).length) return res.json({ ok: true });
    const updated = await prisma.user.update({ where: { id: req.user.id }, data });
    res.json({ id: updated.id, name: updated.name, email: updated.email, phone: updated.phone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Self-service password change
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.password) {
      return res.status(400).json({ error: 'No password set — sign in with Google instead' });
    }
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout — invalidates the server-side permission cache and revokes THIS
// device's session (so its token stops validating), leaving any other device
// class (e.g. the mobile app) signed in. The client should also drop its copy.
router.post('/logout', authenticate, async (req, res) => {
  invalidateUserCache(req.user.id);
  if (req.sessionId) await revokeSession(req.sessionId);
  res.json({ ok: true });
});

// ───── Password reset (request + complete) ────────────────────────────────
//
// Request a reset email. Always returns 200 so the response cannot be used
// to enumerate which emails are registered. Uses a short-lived (60 min) JWT
// signed with JWT_SECRET as the reset token — no DB row needed.
router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.json({ ok: true });
    const user = await prisma.user.findUnique({ where: { email } });
    // OAuth-only users have no password to reset; silently skip.
    if (user && user.password && user.isActive) {
      const token = jwt.sign({ id: user.id, purpose: 'reset' }, process.env.JWT_SECRET, { expiresIn: '60m' });
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?reset=${encodeURIComponent(token)}`;
      try {
        await sendPasswordReset({ to: user.email, name: user.name || 'there', resetUrl });
      } catch (mailErr) {
        console.warn('[auth/forgot-password] email failed:', mailErr.message);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Magic-link team-invite acceptance. Public — the JWT in `token` is the
// proof of who invited you. Marks the account active, sets the password,
// then issues a real session JWT so the user lands inside the app already
// logged in.
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, password, name } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invite link is invalid or has expired. Ask your admin to resend it.' });
    }
    if (payload.purpose !== 'invite') return res.status(401).json({ error: 'Wrong token type' });

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return res.status(404).json({ error: 'Invite no longer valid (user removed)' });
    if (user.password) {
      // Already accepted — refuse silently so the same link can't be used to
      // overwrite an existing password.
      return res.status(409).json({ error: 'This invite has already been accepted. Use Sign in instead.' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        isActive: true,
        emailVerified: true,
        ...(name ? { name: String(name).trim().slice(0, 191) } : {}),
      },
    });
    audit({ req, action: 'auth.invite.accept', resource: 'user', resourceId: user.id });

    const session = await issueSessionToken(updated, req);

    res.json({
      token: session,
      user: {
        id: updated.id, email: updated.email, name: updated.name, role: updated.role,
        tenantId: updated.tenantId, isPlatformAdmin: !!updated.isPlatformAdmin,
        mfaEnabled: !!updated.mfaEnabled,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/invite/:token — preview-only endpoint so the accept-invite page
// can show "You've been invited to <Acme> by <Inviter>" before the user types
// their password. Returns minimal info so a leaked token can't enumerate too
// much PII.
router.get('/invite/:token', async (req, res) => {
  try {
    let payload;
    try {
      payload = jwt.verify(req.params.token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invite link is invalid or has expired' });
    }
    if (payload.purpose !== 'invite') return res.status(401).json({ error: 'Wrong token type' });
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.password) return res.status(409).json({ error: 'This invite has already been accepted' });
    const tenant = user.tenantId
      ? await prisma.tenant.findUnique({ where: { id: user.tenantId } })
      : null;
    res.json({
      email: user.email,
      name: user.name,
      tenantName: tenant?.businessName || tenant?.name || null,
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'token and newPassword (>=6 chars) required' });
    }
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Reset link is invalid or expired' });
    }
    if (payload.purpose !== 'reset') return res.status(401).json({ error: 'Wrong token type' });
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'Account not found' });
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
    // A password reset signs out every device (web + mobile) — anyone holding
    // an old session must sign in again with the new password.
    await revokeAllForUser(user.id);
    audit({ req, action: 'auth.password.reset', resource: 'user', resourceId: user.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───── 2FA / TOTP ─────────────────────────────────────────────────────────
//
// Flow:
//   1. POST /2fa/setup      → generate secret, return QR data to scan
//   2. POST /2fa/verify     → user submits first 6-digit code, we flip
//                             mfaEnabled=true and persist the secret
//   3. POST /2fa/disable    → password + TOTP, clears the secret
//   4. POST /2fa/login      → exchanges the short-lived mfaToken from
//                             /login for a full session JWT once the user
//                             submits a valid TOTP code

router.post('/2fa/setup', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Always rotate the secret on setup — never expose an existing one
    const secret = generateSecret();
    // Stash provisional secret; it isn't activated until /2fa/verify succeeds.
    await db('users').where({ id: user.id }).update({ totpSecret: secret });
    const url = otpauthUrl({ secret, account: user.email, issuer: 'Kartriq' });
    res.json({
      secret,
      otpauthUrl: url,
      qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/2fa/verify', authenticate, async (req, res) => {
  try {
    const { token } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.totpSecret) return res.status(400).json({ error: 'Run /2fa/setup first' });
    if (!verifyTOTP(user.totpSecret, token)) {
      return res.status(400).json({ error: 'Invalid code' });
    }
    await db('users').where({ id: user.id }).update({ mfaEnabled: 1 });
    audit({ req, action: 'auth.2fa.enable', resource: 'user', resourceId: user.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/2fa/disable', authenticate, async (req, res) => {
  try {
    const { password, token } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.password) return res.status(400).json({ error: 'OAuth-only accounts have no password to confirm with' });
    const ok = await bcrypt.compare(password || '', user.password);
    if (!ok) return res.status(400).json({ error: 'Password is incorrect' });
    if (!user.totpSecret || !verifyTOTP(user.totpSecret, token)) {
      return res.status(400).json({ error: 'Invalid 2FA code' });
    }
    await db('users').where({ id: user.id }).update({ mfaEnabled: 0, totpSecret: null });
    audit({ req, action: 'auth.2fa.disable', resource: 'user', resourceId: user.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/2fa/login', async (req, res) => {
  try {
    const { mfaToken, token } = req.body || {};
    if (!mfaToken || !token) return res.status(400).json({ error: 'mfaToken and token required' });
    let payload;
    try {
      payload = jwt.verify(mfaToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired MFA token' });
    }
    if (!payload.mfaPending) return res.status(401).json({ error: 'Not an MFA challenge token' });
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.isActive || !user.mfaEnabled || !user.totpSecret) {
      return res.status(401).json({ error: 'MFA not configured for this account' });
    }
    if (!verifyTOTP(user.totpSecret, token)) {
      return res.status(401).json({ error: 'Invalid code' });
    }
    const session = await issueSessionToken(user, req);
    res.json({
      token: session,
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role,
        tenantId: user.tenantId, isPlatformAdmin: !!user.isPlatformAdmin,
        mfaEnabled: !!user.mfaEnabled,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───── DPDP / GDPR — data export & account deletion ────────────────────────

// Bundles every tenant-scoped row into a JSON document the user can download.
// Gated on `billing.manage` so a STAFF user can't pull the entire tenant's
// data dump (which would include every customer, every order, etc).
//
// Sensitive fields are redacted before serialisation:
//   • users.password / users.totpSecret / users.providerId  → null
//   • channels.credentials (AES-256-GCM blob)                → "[redacted]"
// The export is meant to satisfy DPDP/GDPR data-portability requests, not
// to be a credential dump.
const SENSITIVE_USER_FIELDS = ['password', 'totpSecret', 'providerId'];

router.get('/me/export', authenticate, requirePermission('billing.manage'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'No tenant on this account' });

    // Tables keyed directly by tenantId. Order roughly matches dependency
    // direction so the resulting JSON reads top-down (account → catalog →
    // operations → financial).
    const TENANT_TABLES = [
      'users', 'tenant_roles', 'user_roles', 'role_permissions',
      'subscriptions', 'usage_meters', 'billing_invoices',
      'tenant_wallets', 'wallet_transactions', 'tenant_payment_methods',
      'brands', 'categories', 'products', 'product_variants',
      'warehouses', 'inventory_items', 'stock_movements',
      'channels', 'channel_listings', 'channel_requests',
      'vendors', 'purchase_orders', 'purchase_order_items',
      'customers', 'orders', 'order_items', 'returns', 'shipments',
      'invoices', 'payments',
      'support_tickets',
      'audit_logs',
      'leads', // not tenant-scoped today; included for completeness if it ever is
    ];

    const bundle = {
      exportedAt: new Date().toISOString(),
      tenantId,
      exportedBy: { userId: req.user.id, email: req.user.email },
      // Field-level redactions applied in this dump (so the recipient knows
      // why some columns look empty in the JSON).
      redacted: {
        users: SENSITIVE_USER_FIELDS,
        channels: ['credentials'],
      },
    };

    // Tenant row (keyed by id, not tenantId)
    try {
      bundle.tenants = await db('tenants').where({ id: tenantId });
    } catch (e) {
      bundle.tenants = { error: e.message };
    }

    for (const table of TENANT_TABLES) {
      try {
        let rows = await db(table).where({ tenantId });

        // Sensitive-field redaction
        if (table === 'users') {
          rows = rows.map((r) => {
            const out = { ...r };
            for (const f of SENSITIVE_USER_FIELDS) out[f] = null;
            return out;
          });
        } else if (table === 'channels') {
          rows = rows.map((r) => ({ ...r, credentials: '[redacted]' }));
        }

        bundle[table] = rows;
      } catch (e) {
        // Table may not exist on every install (different migration history).
        // We surface the error rather than silently dropping so the caller
        // can tell "no rows" apart from "schema doesn't have this".
        bundle[table] = { error: e.message };
      }
    }

    // ticket_messages is keyed by ticketId, so join via the tenant's tickets.
    try {
      const ticketIds = (bundle.support_tickets || []).map((t) => t.id);
      bundle.ticket_messages = ticketIds.length
        ? await db('ticket_messages').whereIn('ticketId', ticketIds)
        : [];
    } catch (e) {
      bundle.ticket_messages = { error: e.message };
    }

    audit({ req, action: 'tenant.export', resource: 'tenant', resourceId: tenantId });
    res.setHeader('Content-Disposition', `attachment; filename="kartriq-export-${tenantId}.json"`);
    res.json(bundle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Soft-delete the calling user. If they own the tenant, the tenant is
// also soft-deleted. PII is intentionally KEPT for 30 days so an admin
// can restore the account on user request (POST /admin/tenants/:id/restore).
// After 30 days the daily cron (billing.job.js → purgeStaleSoftDeletes)
// scrubs name/email/phone for DPDP compliance — at that point the
// account is unrecoverable.
//
// Requires password confirmation; OAuth-only users must supply
// confirmEmail matching their email instead.
router.post('/me/delete', authenticate, async (req, res) => {
  try {
    const { password, confirmEmail } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.password) {
      if (!password || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ error: 'Password is incorrect' });
      }
    } else {
      if (!confirmEmail || confirmEmail.toLowerCase() !== String(user.email).toLowerCase()) {
        return res.status(400).json({ error: 'Type your email exactly to confirm deletion' });
      }
    }

    const now = new Date();
    // Disable login at once but KEEP PII so an admin can restore inside the
    // 30-day window. The daily purge cron deletes PII once that window closes.
    await db('users').where({ id: user.id }).update({
      isActive: 0,
      deletedAt: now,
    });

    // If this user owns the tenant, soft-delete the tenant too.
    if (user.tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
      if (tenant && tenant.ownerEmail === user.email) {
        await db('tenants').where({ id: user.tenantId }).update({
          status: 'DELETED',
          deletedAt: now,
        });
      }
    }

    audit({
      req,
      action: 'auth.account.delete',
      resource: 'user',
      resourceId: user.id,
      metadata: { email: user.email },
    });
    invalidateUserCache(user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
