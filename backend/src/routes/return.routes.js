const { Router } = require('express');
const { z } = require('zod');
const {
  authenticate, requireTenant, requirePermission, requireFeature,
} = require('../middleware/auth.middleware');
const prisma = require('../utils/prisma');
const db = require('../utils/db');
const { applyOrderStock } = require('../services/stock.service');

const router = Router();
router.use(authenticate, requireTenant);
// Returns is available on every paid tier (Starter = 'basic', Growth+ =
// 'enhanced'). requireFeature passes on any truthy flag; the tier only changes
// *behaviour* (see enhancedTier below), not access.
router.use(requireFeature('returns'));

// Is this tenant on an enhanced returns tier? Basic = manual tracking only;
// enhanced/customized unlock auto-restock on receipt and refund auto-fill.
const enhancedTier = (req) => {
  const t = req.plan?.features?.returns;
  return t && t !== 'basic';
};

// Allowed status transitions for the RMA lifecycle.
const NEXT = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['RECEIVED', 'REJECTED'],
  RECEIVED: ['REFUNDED'],
  REFUNDED: [],
  REJECTED: [],
};

const createSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().min(1).max(2000),
  refundAmt: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});

const statusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED']),
  refundAmt: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});

// ── List ─────────────────────────────────────────────────────────────
router.get('/', requirePermission('returns.read'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const skip = (page - 1) * limit;
  const where = { tenantId: req.tenant.id };
  if (req.query.status && NEXT[req.query.status] !== undefined) where.status = req.query.status;

  const [returns, total] = await Promise.all([
    prisma.return.findMany({
      where,
      include: { order: { include: { customer: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.return.count({ where }),
  ]);
  res.json({ returns, total, page, limit, tier: enhancedTier(req) ? 'enhanced' : 'basic' });
});

router.get('/:id', requirePermission('returns.read'), async (req, res) => {
  const ret = await prisma.return.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
    include: {
      order: { include: { customer: true, items: { include: { variant: { include: { product: true } } } } } },
    },
  });
  if (!ret) return res.status(404).json({ error: 'Return not found' });
  res.json(ret);
});

// ── Create RMA ───────────────────────────────────────────────────────
router.post('/', requirePermission('returns.create'), async (req, res) => {
  try {
    const data = createSchema.parse(req.body);
    const order = await prisma.order.findFirst({ where: { id: data.orderId, tenantId: req.tenant.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const ret = await prisma.return.create({
      data: {
        tenantId: req.tenant.id,
        orderId: data.orderId,
        reason: data.reason,
        status: 'REQUESTED',
        refundAmt: data.refundAmt ?? null,
        notes: data.notes || null,
      },
      include: { order: { include: { customer: true } } },
    });
    res.status(201).json(ret);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

// Restock a returned SELF-fulfilled order back into inventory. Reuses the proven,
// idempotent order stock state machine (applyOrderStock keys off stockStatus, so
// this only ever adds stock back once). FBA/channel orders are skipped there.
async function restockReturnedOrder(tenantId, orderId) {
  const order = await db('orders').where({ id: orderId, tenantId }).first();
  if (!order || order.fulfillmentType !== 'SELF' || !order.warehouseId) return;
  const items = await db('order_items').where({ orderId, tenantId }).select('variantId', 'qty');
  if (!items.length) return;
  // Flip the order to RETURNED so the stock machine brings deducted stock back.
  order.status = 'RETURNED';
  await prisma.order.update({ where: { id: order.id }, data: { status: 'RETURNED' } }).catch(() => {});
  await applyOrderStock(order, items);
}

// ── Status transition ────────────────────────────────────────────────
router.patch('/:id/status', requirePermission('returns.update'), async (req, res) => {
  try {
    const body = statusSchema.parse(req.body);
    const existing = await prisma.return.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } });
    if (!existing) return res.status(404).json({ error: 'Return not found' });

    const allowed = NEXT[existing.status] || [];
    if (!allowed.includes(body.status)) {
      return res.status(400).json({ error: `Cannot move a ${existing.status} return to ${body.status}` });
    }

    const patch = { status: body.status };
    if (body.notes !== undefined) patch.notes = body.notes || null;

    // Enhanced tier: restock the goods when the return is physically received.
    if (body.status === 'RECEIVED' && enhancedTier(req)) {
      await restockReturnedOrder(req.tenant.id, existing.orderId);
    }

    // Refund: record the amount. Enhanced tier auto-fills from the order total
    // when the caller doesn't pass one; basic requires an explicit amount.
    if (body.status === 'REFUNDED') {
      if (body.refundAmt !== undefined) {
        patch.refundAmt = body.refundAmt;
      } else if (existing.refundAmt == null && enhancedTier(req)) {
        const order = await prisma.order.findFirst({ where: { id: existing.orderId, tenantId: req.tenant.id } });
        patch.refundAmt = order ? Number(order.total || 0) : 0;
      }
    }

    const ret = await prisma.return.update({
      where: { id: req.params.id },
      data: patch,
      include: { order: { include: { customer: true } } },
    });
    res.json(ret);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

// ── Delete (only open / rejected) ────────────────────────────────────
router.delete('/:id', requirePermission('returns.update'), async (req, res) => {
  const existing = await prisma.return.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } });
  if (!existing) return res.status(404).json({ error: 'Return not found' });
  if (!['REQUESTED', 'REJECTED'].includes(existing.status)) {
    return res.status(400).json({ error: 'Only requested or rejected returns can be deleted' });
  }
  await prisma.return.delete({ where: { id: req.params.id } });
  res.json({ message: 'Return deleted' });
});

module.exports = router;
