const { Router } = require('express');
const { z } = require('zod');
const {
  authenticate, requireTenant, requirePermission, requireFeature,
} = require('../middleware/auth.middleware');
const prisma = require('../utils/prisma');

const router = Router();
router.use(authenticate, requireTenant);

// Vendors gate on `purchaseManagement`, not `vendorManagement`. A purchase order
// requires a vendor, and purchaseManagement is available from the Growth tier up
// (a superset of the plans that carry vendorManagement), so tying vendor access
// to it keeps POs usable on every plan that has purchasing. The richer
// `vendorManagement` flag is reserved for advanced vendor ops later.
router.use(requireFeature('purchaseManagement'));

const addressSchema = z.object({
  line1: z.string().max(200).optional(),
  line2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
}).optional();

const bankSchema = z.object({
  accountName: z.string().max(200).optional(),
  accountNumber: z.string().max(60).optional(),
  ifsc: z.string().max(30).optional(),
  bankName: z.string().max(120).optional(),
}).optional();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  gstin: z.string().max(30).optional(),
  address: addressSchema,
  bankDetails: bankSchema,
  paymentTerms: z.string().max(100).optional(),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// List — active vendors only (soft-deleted disappear), like warehouses.
router.get('/', requirePermission('vendors.read'), async (req, res) => {
  const vendors = await prisma.vendor.findMany({
    where: { tenantId: req.tenant.id, isActive: true },
    orderBy: { name: 'asc' },
  });
  res.json(vendors);
});

router.get('/:id', requirePermission('vendors.read'), async (req, res) => {
  const vendor = await prisma.vendor.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
    include: { purchaseOrders: true },
  });
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
  res.json(vendor);
});

router.post('/', requirePermission('vendors.create'), async (req, res) => {
  try {
    const data = createSchema.parse(req.body);
    if (data.email === '') delete data.email;
    const vendor = await prisma.vendor.create({
      data: {
        ...data,
        address: data.address || {},
        bankDetails: data.bankDetails || {},
        tenantId: req.tenant.id,
      },
    });
    res.status(201).json(vendor);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requirePermission('vendors.update'), async (req, res) => {
  try {
    const data = updateSchema.parse(req.body);
    if (data.email === '') delete data.email;
    const existing = await prisma.vendor.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
    });
    if (!existing) return res.status(404).json({ error: 'Vendor not found' });
    const vendor = await prisma.vendor.update({ where: { id: req.params.id }, data });
    res.json(vendor);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

// Soft delete — matches the vendor/warehouse convention (isActive=false), so
// existing purchase orders keep their vendor reference.
router.delete('/:id', requirePermission('vendors.delete'), async (req, res) => {
  const existing = await prisma.vendor.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
  });
  if (!existing) return res.status(404).json({ error: 'Vendor not found' });
  await prisma.vendor.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ message: 'Vendor deactivated' });
});

module.exports = router;
