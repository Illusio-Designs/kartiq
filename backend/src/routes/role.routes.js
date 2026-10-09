const { Router } = require('express');
const prisma = require('../utils/prisma');
const {
  authenticate, requireTenant, requirePermission, invalidateUserCache,
} = require('../middleware/auth.middleware');

const router = Router();
router.use(authenticate, requireTenant);

router.get('/', requirePermission('roles.read'), async (req, res) => {
  const roles = await prisma.tenantRole.findMany({
    where: { tenantId: req.tenant.id },
    include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });
  res.json(roles);
});

router.post('/', requirePermission('roles.create'), async (req, res) => {
  try {
    const { code, name, description, permissionCodes = [] } = req.body;
    const role = await prisma.tenantRole.create({
      data: { tenantId: req.tenant.id, code, name, description, isSystem: false },
    });
    if (permissionCodes.length) {
      const perms = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
      await prisma.rolePermission.createMany({
        data: perms.map(p => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
    res.status(201).json(role);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/:id', requirePermission('roles.update'), async (req, res) => {
  // Without an explicit tenant-ownership check the bare findOrUpdate would
  // happily mutate a role belonging to a different tenant if its id was
  // guessed/leaked. Match the pattern in the delete handler below.
  const existing = await prisma.tenantRole.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, description, permissionCodes } = req.body;
  const role = await prisma.tenantRole.update({
    where: { id: req.params.id },
    data: { name, description },
  });
  if (Array.isArray(permissionCodes)) {
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const perms = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
    await prisma.rolePermission.createMany({
      data: perms.map(p => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
  invalidateUserCache(req.user.id);
  res.json(role);
});

router.delete('/:id', requirePermission('roles.delete'), async (req, res) => {
  const role = await prisma.tenantRole.findUnique({ where: { id: req.params.id } });
  if (!role || role.tenantId !== req.tenant.id) return res.status(404).json({ error: 'Not found' });
  if (role.isSystem) return res.status(400).json({ error: 'Cannot delete system role' });
  await prisma.tenantRole.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Assert (userId, roleId) is a same-tenant pair before mutating user_roles.
// Without this check, a tenant admin can craft an /assign call to grant
// roles from one tenant to users in another, leaking permissions across
// tenants.
async function assertSameTenantPair(req, userId, roleId) {
  const [u, r] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, tenantId: req.tenant.id }, select: { id: true } }),
    prisma.tenantRole.findFirst({ where: { id: roleId, tenantId: req.tenant.id }, select: { id: true } }),
  ]);
  return !!(u && r);
}

// Assign role to user
router.post('/assign', requirePermission('users.update'), async (req, res) => {
  const { userId, roleId } = req.body;
  if (!userId || !roleId) return res.status(400).json({ error: 'userId and roleId are required' });
  if (!await assertSameTenantPair(req, userId, roleId)) {
    return res.status(404).json({ error: 'User or role not found' });
  }
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    update: {},
    create: { userId, roleId },
  });
  invalidateUserCache(userId);
  res.json({ ok: true });
});

router.post('/unassign', requirePermission('users.update'), async (req, res) => {
  const { userId, roleId } = req.body;
  if (!userId || !roleId) return res.status(400).json({ error: 'userId and roleId are required' });
  if (!await assertSameTenantPair(req, userId, roleId)) {
    return res.status(404).json({ error: 'User or role not found' });
  }
  await prisma.userRole.deleteMany({ where: { userId, roleId } });
  invalidateUserCache(userId);
  res.json({ ok: true });
});

module.exports = router;
