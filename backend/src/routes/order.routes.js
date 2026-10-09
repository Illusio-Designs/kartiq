const { Router } = require('express');
const { randomUUID } = require('crypto');
const { getOrders, getOrder, getOrderStats, createOrder, updateOrderStatus, cancelOrder } = require('../controllers/order.controller');
const {
  authenticate, requireTenant, requirePermission, requireFeature,
} = require('../middleware/auth.middleware');
const { requestReviewForOrder, processReviewQueue, REVIEW_DELAY_HOURS } = require('../services/review.service');
const { buildBulkLabelsPdf } = require('../services/amazonShipping.service');
const shipment = require('../services/shipping/shipment.service');
const { buildPackingSlip, buildBulkPackingSlips } = require('../services/packingSlip.service');
const { rankWarehouses, pickBestWarehouse } = require('../services/routing.service');
const { scoreAndPersist } = require('../services/rto.service');
const { VIDEO_TYPES, RETENTION_DAYS, stampRetentionOnDelivery } = require('../services/vms.service');
const { putObject, deleteObject } = require('../services/storage.service');
const db = require('../utils/db');
const prisma = require('../utils/prisma');

const router = Router();
router.use(authenticate, requireTenant);

// ═════════════════════════════════════════════════════════════════════════════
// REVIEW REQUESTS — MUST be declared before /:id routes to avoid conflicts
// ═════════════════════════════════════════════════════════════════════════════

// ── Bulk packing slips — MUST be declared before /:id routes ─────────────────
// body: { ids: string[] } (max 100). Returns ONE printable HTML document with a
// slip per page, plus which orders were skipped and why (FBA, cancelled, not
// found). JSON (not raw HTML) so the UI can report the skips.
router.post('/packing-slips', requirePermission('orders.read'), async (req, res) => {
  try {
    const r = await buildBulkPackingSlips(req.body?.ids, req.tenant.id);
    if (r.error) return res.status(r.status).json({ error: r.error, skipped: r.skipped || [] });
    res.json({ html: r.html, printed: r.printed, skipped: r.skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Bulk "Confirm & get label" — MUST be declared before /:id routes ─────────
// body: { ids: string[] } (max 50). Books the Amazon courier for each order,
// one by one (Amazon or the seller's own courier), and returns each order's own outcome.
router.post('/book-shipping', requirePermission('shipments.create'), async (req, res) => {
  try {
    const r = await shipment.confirmBulk(req.body?.ids, req.tenant.id);
    if (r.error) return res.status(r.status).json({ error: r.error });
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Bulk shipping labels — MUST be declared before /:id routes ───────────────
// body: { ids: string[] } (max 100). Returns ONE merged PDF (base64) with a
// label per page, plus which orders were skipped and why.
router.post('/labels', requirePermission('shipments.read'), async (req, res) => {
  try {
    const r = await buildBulkLabelsPdf(req.body?.ids, req.tenant.id);
    if (r.error) return res.status(r.status).json({ error: r.error, skipped: r.skipped || [] });
    res.json({ pdf: r.pdf, printed: r.printed, pages: r.pages, skipped: r.skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// ── Packing slip (goes inside the parcel; no prices) ─────────────────────────
// Self-fulfilled orders only. Returns a print-ready HTML page.
router.get('/:id/packing-slip', requirePermission('orders.read'), async (req, res) => {
  try {
    const r = await buildPackingSlip(req.params.id, req.tenant.id);
    if (r.error) return res.status(r.status).json({ error: r.error });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(r.html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Confirm → label → shipment status ────────────────────────────────────────
// Confirm: books the courier (Amazon or the seller's own courier partner) and saves the label.
router.post('/:id/book-shipping', requirePermission('shipments.create'), async (req, res) => {
  const result = await shipment.confirmOrder(req.params.id, { tenantId: req.tenant.id });
  if (result.error) return res.status(400).json(result);
  if (result.notFound) return res.status(404).json(result);
  if (!result.booked) return res.status(409).json(result);
  res.json(result);
});

// Download / print the label (fetched from the courier the first time, then kept).
router.get('/:id/label', requirePermission('shipments.read'), async (req, res) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (req.query.format === 'meta') { // cheap: never fetches the file from the courier
      const l = await require('../services/amazonShipping.service').getActiveLabel(order.id, req.tenant.id);
      if (!l) return res.status(404).json({ error: 'No label for this order yet' });
      return res.json({
        id: l.id, trackingNumber: l.trackingNumber, carrier: l.carrier, serviceName: l.serviceName, cost: l.cost, currency: l.currency,
        mime: l.mime, createdAt: l.createdAt, available: !!(l.content || l.url || l.carrier === 'Amazon Easy Ship'),
      });
    }
    const f = await shipment.getLabelFile(order.id, req.tenant.id);
    if (f.error) return res.status(f.status || 404).json({ error: f.error });
    const l = f.label;
    if (req.query.format === 'json') {
      return res.json({ id: l.id, trackingNumber: l.trackingNumber, carrier: l.carrier, serviceName: l.serviceName, cost: l.cost, currency: l.currency, mime: f.mime, contentBase64: f.buffer.toString('base64'), createdAt: l.createdAt });
    }
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `inline; filename="label-${order.orderNumber || order.id}"`);
    res.send(f.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel the booking (only until the courier picks the parcel up).
router.delete('/:id/label', requirePermission('shipments.create'), async (req, res) => {
  try {
    const r = await shipment.cancelBooking(req.params.id, req.tenant.id);
    if (!r.cancelled) return res.status(r.status || 400).json(r);
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ask the courier for the latest status now (it also updates by itself every ~10 minutes).
router.post('/:id/shipment/refresh', requirePermission('shipments.read'), async (req, res) => {
  try {
    const r = await shipment.refreshShipment(req.params.id, { tenantId: req.tenant.id });
    if (r.error && !r.status) return res.status(404).json(r);
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Timeline: Booked → Pickup scheduled → … with times.
router.get('/:id/shipment', requirePermission('shipments.read'), async (req, res) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const events = await shipment.getHistory(order.id, req.tenant.id);
    res.json({
      status: order.shipmentStatus || null, statusAt: order.shipmentStatusAt || null, provider: order.shipmentProvider || null,
      trackingNumber: order.trackingNumber || null, courierName: order.courierName || null, error: order.shippingError || null,
      canCancel: !!order.shipmentStatus && shipment.CANCELLABLE.includes(order.shipmentStatus), events,
    });
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

// ── Video Management (VMS) — packing/dispatch videos on an order ─────────────
// Plan-gated: requireFeature('vms'). Kartriq stores the video URL + metadata,
// not the bytes (the client uploads to object storage and posts us the URL).
// Retention is handled by vms.service — clips are pruned RETENTION_DAYS after
// the order is delivered, unless a return/dispute is still open.

// List the videos on an order (newest first).
router.get('/:id/videos', requirePermission('orders.read'), requireFeature('vms'), async (req, res) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const videos = await db('order_videos')
      .where({ orderId: order.id, tenantId: req.tenant.id, status: 'ACTIVE' })
      .orderBy('createdAt', 'desc');
    res.json({ videos, total: videos.length, retentionDays: RETENTION_DAYS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Attach a video to an order. Body: { url, type?, storageKey?, thumbnailUrl?,
// sizeBytes?, durationSec?, capturedAt? }. If the order is already delivered,
// the retention clock is stamped immediately.
router.post('/:id/videos', requirePermission('orders.update'), requireFeature('vms'), async (req, res) => {
  try {
    const { url, type, storageKey, thumbnailUrl, sizeBytes, durationSec, capturedAt } = req.body || {};
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'A video url is required' });
    const vtype = VIDEO_TYPES.includes(String(type || '').toUpperCase()) ? String(type).toUpperCase() : 'PACKING';

    const order = await prisma.order.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const now = new Date();
    // Delivered already? Stamp retention now so it can't linger unbounded.
    let deleteAfter = null;
    if (String(order.status).toUpperCase() === 'DELIVERED') {
      const base = order.deliveredAt ? new Date(order.deliveredAt) : now;
      deleteAfter = new Date(base.getTime() + RETENTION_DAYS * 86400000);
    }

    const row = {
      id: randomUUID(),
      tenantId: req.tenant.id,
      orderId: order.id,
      orderNumber: order.orderNumber || null,
      type: vtype,
      url,
      storageKey: storageKey || null,
      thumbnailUrl: thumbnailUrl || null,
      sizeBytes: Number.isFinite(Number(sizeBytes)) ? Math.round(Number(sizeBytes)) : null,
      durationSec: Number.isFinite(Number(durationSec)) ? Math.round(Number(durationSec)) : null,
      status: 'ACTIVE',
      capturedAt: capturedAt ? new Date(capturedAt) : now,
      deleteAfter,
      uploadedById: req.user?.id || null,
      createdAt: now,
      updatedAt: now,
    };
    await db('order_videos').insert(row);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload a video's bytes directly (dev-friendly path). Body: { dataUrl, type?,
// durationSec?, capturedAt? } where dataUrl is a base64 data URI. The bytes go
// to object storage; only the resulting URL + metadata are stored on the row.
// A dedicated large-body parser is mounted for this path in index.js.
const MAX_VIDEO_BYTES = 60 * 1024 * 1024; // 60 MB
router.post('/:id/videos/upload', requirePermission('orders.update'), requireFeature('vms'), async (req, res) => {
  try {
    const { dataUrl, type, durationSec, capturedAt } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') return res.status(400).json({ error: 'A video file (dataUrl) is required' });
    const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
    if (!m) return res.status(400).json({ error: 'Invalid video data' });
    const mime = m[1];
    if (!/^video\//i.test(mime)) return res.status(400).json({ error: 'File must be a video' });
    const buffer = Buffer.from(m[2], 'base64');
    if (!buffer.length) return res.status(400).json({ error: 'Empty video file' });
    if (buffer.length > MAX_VIDEO_BYTES) return res.status(413).json({ error: 'Video is too large (max 60 MB). Keep packing clips short.' });

    const vtype = VIDEO_TYPES.includes(String(type || '').toUpperCase()) ? String(type).toUpperCase() : 'PACKING';
    const order = await prisma.order.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const stored = await putObject({ buffer, mime });

    const now = new Date();
    let deleteAfter = null;
    if (String(order.status).toUpperCase() === 'DELIVERED') {
      const base = order.deliveredAt ? new Date(order.deliveredAt) : now;
      deleteAfter = new Date(base.getTime() + RETENTION_DAYS * 86400000);
    }

    const row = {
      id: randomUUID(),
      tenantId: req.tenant.id,
      orderId: order.id,
      orderNumber: order.orderNumber || null,
      type: vtype,
      url: stored.url,
      storageKey: stored.storageKey,
      thumbnailUrl: null,
      sizeBytes: stored.sizeBytes,
      durationSec: Number.isFinite(Number(durationSec)) ? Math.round(Number(durationSec)) : null,
      status: 'ACTIVE',
      capturedAt: capturedAt ? new Date(capturedAt) : now,
      deleteAfter,
      uploadedById: req.user?.id || null,
      createdAt: now,
      updatedAt: now,
    };
    await db('order_videos').insert(row);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a video now (manual removal). Best-effort removes the stored object,
// then hard-deletes the row.
router.delete('/:id/videos/:videoId', requirePermission('orders.update'), requireFeature('vms'), async (req, res) => {
  try {
    const video = await db('order_videos')
      .where({ id: req.params.videoId, orderId: req.params.id, tenantId: req.tenant.id })
      .first();
    if (!video) return res.status(404).json({ error: 'Video not found' });
    await deleteObject(video.storageKey);
    await db('order_videos').where({ id: video.id }).del();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Standard CRUD ────────────────────────────────────────────────────────────

router.get('/',              requirePermission('orders.read'),    getOrders);
router.get('/stats',         requirePermission('orders.read'),    getOrderStats);
router.get('/:id',           requirePermission('orders.read'),    getOrder);
router.post('/',             requirePermission('orders.create'),  createOrder);
router.patch('/:id/status',  requirePermission('orders.update'),  updateOrderStatus);
router.patch('/:id/cancel',  requirePermission('orders.cancel'),  cancelOrder);

module.exports = router;
