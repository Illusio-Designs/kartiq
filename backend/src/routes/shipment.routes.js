const { Router } = require('express');
const { z } = require('zod');
const {
  authenticate, requireTenant, requirePermission,
} = require('../middleware/auth.middleware');
const prisma = require('../utils/prisma');

const router = Router();
router.use(authenticate, requireTenant);

const SHIPMENT_STATUSES = ['PENDING', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED'];

const createSchema = z.object({
  orderId:        z.string().min(1),
  trackingNumber: z.string().max(100).optional(),
  courierName:    z.string().min(1).max(100),
  weight:         z.number().positive().optional(),
  charges:        z.number().min(0).optional(),
  trackingUrl:    z.string().url().optional(),
  status:         z.enum(SHIPMENT_STATUSES).optional(),
});

const statusSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES),
});

router.get('/', requirePermission('shipments.read'), async (req, res) => {
  try {
    const { status, trackingNumber, page = '1', limit = '20' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = { tenantId: req.tenant.id };
    if (status) where.status = String(status);
    if (trackingNumber) where.trackingNumber = String(trackingNumber);
    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' } }),
      prisma.shipment.count({ where }),
    ]);
    res.json({ shipments, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requirePermission('shipments.read'), async (req, res) => {
  const s = await prisma.shipment.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
  });
  if (!s) return res.status(404).json({ error: 'Shipment not found' });
  res.json(s);
});

router.post('/', requirePermission('shipments.create'), async (req, res) => {
  try {
    const data = createSchema.parse(req.body);
    // Look up order to get its orderNumber
    const order = await prisma.order.findFirst({
      where: { id: data.orderId, tenantId: req.tenant.id },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const { orderId, ...rest } = data;
    const s = await prisma.shipment.create({
      data: { ...rest, orderNumber: order.orderNumber, tenantId: req.tenant.id },
    });
    res.status(201).json(s);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/status', requirePermission('shipments.update'), async (req, res) => {
  try {
    const { status } = statusSchema.parse(req.body);
    const existing = await prisma.shipment.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
    });
    if (!existing) return res.status(404).json({ error: 'Shipment not found' });
    const s = await prisma.shipment.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json(s);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requirePermission('shipments.delete'), async (req, res) => {
  const existing = await prisma.shipment.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
  });
  if (!existing) return res.status(404).json({ error: 'Shipment not found' });
  await prisma.shipment.delete({ where: { id: req.params.id } });
  res.json({ message: 'Shipment deleted' });
});

module.exports = router;
