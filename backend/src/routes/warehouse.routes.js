const { Router } = require('express');
const { z } = require('zod');
const {
  authenticate, requireTenant, requirePermission, enforceLimit,
} = require('../middleware/auth.middleware');
const prisma = require('../utils/prisma');
const { ensureFbaFacility } = require('../services/channel.service');

const router = Router();
router.use(authenticate, requireTenant);

const addressSchema = z.object({
  line1: z.string().max(200).optional(),
  line2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
}).optional();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50).optional(),
  address: addressSchema,
  routingPriority: z.number().int().min(0).max(1000).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(200).optional(),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

router.get('/', requirePermission('warehouses.read'), async (req, res) => {
  const wh = await prisma.warehouse.findMany({
    where: { tenantId: req.tenant.id, isActive: true },
    orderBy: { name: 'asc' },
  });
  res.json(wh);
});

router.get('/:id', requirePermission('warehouses.read'), async (req, res) => {
  const wh = await prisma.warehouse.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
    include: { inventoryItems: { include: { variant: { include: { product: true } } } } },
  });
  if (!wh) { res.status(404).json({ error: 'Warehouse not found' }); return; }
  res.json(wh);
});

router.post('/',
  requirePermission('warehouses.create'),
  enforceLimit('warehouses'),
  async (req, res) => {
    try {
      const data = createSchema.parse(req.body);
      const code = data.code || `WH-${Date.now().toString(36).toUpperCase()}`;
      const wh = await prisma.warehouse.create({
        data: { ...data, code, address: data.address || {}, tenantId: req.tenant.id },
      });
      res.status(201).json(wh);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      if (err.code === 'P2002') return res.status(409).json({ error: 'Warehouse code already exists' });
      res.status(500).json({ error: err.message });
    }
  });

// Ensure the virtual "Amazon FBA" facility exists (idempotent). FBA warehouses
// can't be listed from Amazon — this represents Amazon's pooled network as one
// read-only facility that FBA stock and orders attach to.
router.post('/amazon/fba', requirePermission('warehouses.create'), async (req, res) => {
  try {
    const wh = await ensureFbaFacility(req.tenant.id);
    res.json(wh);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requirePermission('warehouses.update'), async (req, res) => {
  try {
    const data = updateSchema.parse(req.body);
    const existing = await prisma.warehouse.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
    });
    if (!existing) return res.status(404).json({ error: 'Warehouse not found' });
    if (existing.isVirtual) return res.status(403).json({ error: 'This is an Amazon-managed facility and cannot be edited.' });
    const wh = await prisma.warehouse.update({ where: { id: req.params.id }, data });
    res.json(wh);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requirePermission('warehouses.delete'), async (req, res) => {
  const existing = await prisma.warehouse.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
  });
  if (!existing) return res.status(404).json({ error: 'Warehouse not found' });
  if (existing.isVirtual) return res.status(403).json({ error: 'This is an Amazon-managed facility and cannot be deleted.' });
  await prisma.warehouse.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ message: 'Warehouse deactivated' });
});

module.exports = router;
