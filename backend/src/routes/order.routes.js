const { Router } = require('express');
const { getOrders, getOrder, createOrder, updateOrderStatus, cancelOrder } = require('../controllers/order.controller');
const {
  authenticate, requireTenant, requirePermission, enforceLimit,
} = require('../middleware/auth.middleware');
const { requestReviewForOrder, processReviewQueue, REVIEW_DELAY_HOURS } = require('../services/review.service');
const { rankWarehouses, pickBestWarehouse } = require('../services/routing.service');
const { scoreAndPersist } = require('../services/rto.service');
const prisma = require('../utils/prisma');

const router = Router();
router.use(authenticate, requireTenant);

// ═════════════════════════════════════════════════════════════════════════════
// REVIEW REQUESTS — MUST be declared before /:id routes to avoid conflicts
// ═════════════════════════════════════════════════════════════════════════════

router.post('/process-review-queue', requirePermission('orders.update'), async (req, res) => {
  try {
    const result = await processReviewQueue({
      delayHours: req.body?.delayHours,
      limit: req.body?.limit,
      tenantId: req.tenant.id,
    });
    res.json({ defaultDelayHours: REVIEW_DELAY_HOURS, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/request-review', requirePermission('orders.update'), async (req, res) => {
  try {
    const result = await requestReviewForOrder(req.params.id, { tenantId: req.tenant.id });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Warehouse routing endpoints ─────────────────────────────────────────────
// Suggest best warehouse for an order (no DB write)
router.get('/:id/routing', requirePermission('orders.read'), async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
      include: { items: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const ranked = await rankWarehouses({
      tenantId: req.tenant.id,
      items: order.items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
      shippingAddress: order.shippingAddress,
    });
    res.json({
      currentWarehouseId: order.warehouseId,
      suggestions: ranked.slice(0, 5).map((r) => ({
        warehouseId: r.warehouse.id,
        warehouseName: r.warehouse.name,
        stockScore: r.stockScore,
        pincodeMatch: !!r.pincodeMatch,
        cityMatch: !!r.cityMatch,
        priority: r.priority,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Enrich an order with missing data (CHANNEL-sourced orders often have gaps) ─
router.patch('/:id/enrich', requirePermission('orders.update'), async (req, res) => {
  try {
    const { customer, shippingAddress, billingAddress, items } = req.body || {};
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
      include: { customer: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Update embedded shipping/billing address if provided
    const orderUpdate = { enrichedAt: new Date(), enrichedById: req.user.id };
    if (shippingAddress) orderUpdate.shippingAddress = { ...order.shippingAddress, ...shippingAddress };
    if (billingAddress)  orderUpdate.billingAddress  = billingAddress;

    // Update customer record if customer-level fields were passed
    if (customer && order.customerId) {
      await prisma.customer.update({
        where: { id: order.customerId },
        data: {
          ...(customer.name  !== undefined && { name:  customer.name }),
          ...(customer.email !== undefined && { email: customer.email }),
          ...(customer.phone !== undefined && { phone: customer.phone }),
        },
      });
    }

    // Re-assess completeness after enrichment
    const { assessCompleteness } = require('../services/fulfillment.service');
    const refreshed = await prisma.order.findFirst({
      where: { id: order.id },
      include: { customer: true, items: true },
    });
    const recheck = assessCompleteness(
      {
        customer: refreshed.customer,
        shippingAddress: orderUpdate.shippingAddress || refreshed.shippingAddress,
        items: refreshed.items,
        channelOrderId: refreshed.channelOrderId,
      },
      { fulfillmentType: refreshed.fulfillmentType }
    );
    orderUpdate.dataCompleteness = recheck.level;
    orderUpdate.missingFields = recheck.missing;

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: orderUpdate,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Override fulfillment type (e.g. switch a BOTH-mode channel order) ──────
router.patch('/:id/fulfillment', requirePermission('orders.update'), async (req, res) => {
  try {
    const { fulfillmentType, channelFulfillmentCenter } = req.body || {};
    if (!['SELF', 'CHANNEL', 'DROPSHIP'].includes(fulfillmentType)) {
      return res.status(400).json({ error: 'fulfillmentType must be SELF, CHANNEL, or DROPSHIP' });
    }
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Switching to SELF after CHANNEL means we now need a warehouse
    const update = { fulfillmentType };
    if (channelFulfillmentCenter !== undefined) update.channelFulfillmentCenter = channelFulfillmentCenter;

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: update,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RTO (Return to Origin) risk scoring + approval ─────────────────────────
// Tenants review flagged orders and decide: approve (ship it) or reject (cancel).
router.post('/:id/rto/score', requirePermission('orders.read'), async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const result = await scoreAndPersist(order.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/approve', requirePermission('orders.update'), async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.needsApproval) {
      return res.status(400).json({ error: 'Order does not need approval' });
    }
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        needsApproval: false,
        approvedAt: new Date(),
        approvedById: req.user.id,
        status: 'CONFIRMED',
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reject', requirePermission('orders.cancel'), async (req, res) => {
  try {
    const { reason } = req.body || {};
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        needsApproval: false,
        rejectedAt: new Date(),
        rejectionReason: reason || 'Rejected by tenant (RTO risk)',
        status: 'CANCELLED',
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Assign (or re-assign) a warehouse to an order — manual override
router.patch('/:id/warehouse', requirePermission('orders.update'), async (req, res) => {
  try {
    const { warehouseId, auto } = req.body;
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
      include: { items: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    let targetId = warehouseId;
    let reason = 'manual assignment';
    if (auto) {
      const best = await pickBestWarehouse({
        tenantId: req.tenant.id,
        items: order.items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
        shippingAddress: order.shippingAddress,
      });
      if (!best) return res.status(400).json({ error: 'No eligible warehouse' });
      targetId = best.warehouseId;
      reason = `auto \u00B7 ${best.reason}`;
    } else {
      // Manual assignment: verify the warehouse belongs to this tenant before
      // writing it, so a leaked/guessed id can't attach a foreign warehouse.
      if (!targetId) return res.status(400).json({ error: 'warehouseId is required' });
      const warehouse = await prisma.warehouse.findFirst({
        where: { id: targetId, tenantId: req.tenant.id },
      });
      if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });
    }
    if (!targetId) return res.status(400).json({ error: 'warehouseId is required' });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { warehouseId: targetId },
    });
    res.json({ order: updated, reason });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Standard CRUD ────────────────────────────────────────────────────────────

router.get('/',              requirePermission('orders.read'),    getOrders);
router.get('/:id',           requirePermission('orders.read'),    getOrder);
router.post('/',             requirePermission('orders.create'),  enforceLimit('orders'), createOrder);
router.patch('/:id/status',  requirePermission('orders.update'),  updateOrderStatus);
router.patch('/:id/cancel',  requirePermission('orders.cancel'),  cancelOrder);

module.exports = router;
