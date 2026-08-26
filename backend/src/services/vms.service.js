// vms.service — Video Management (packing/dispatch videos) + retention.
//
// Sellers attach a short packing or dispatch clip to an order. It's proof of
// what left the warehouse — the evidence you produce when a buyer opens an
// "item not as described" / "empty box" claim, an RTO dispute, or a chargeback.
//
// Retention: video is heavy, so we don't keep it forever — but we must keep it
// long enough to survive the dispute window. The rule here:
//
//   • While an order is NOT delivered, videos are kept (deleteAfter = null).
//   • When an order is delivered, each video is stamped
//       deleteAfter = deliveredAt + RETENTION_DAYS   (default 30).
//   • A background job prunes ACTIVE videos whose deleteAfter has passed —
//       UNLESS the order still has an open return/dispute, in which case it's
//       held until that clears.
//
// Why 30 days and not 10: marketplace return windows commonly run 7–30 days and
// A-to-z / chargeback disputes can land well after delivery — deleting at day 10
// would routinely destroy the evidence while a claim is still possible. 30 days
// covers the typical return window; open disputes extend it automatically.
// Override with VMS_RETENTION_DAYS.

const db = require('../utils/db');
const { deleteObject } = require('./storage.service');

const RETENTION_DAYS = Math.max(1, Number(process.env.VMS_RETENTION_DAYS) || 30);
const DAY_MS = 86400000;

const VIDEO_TYPES = ['PACKING', 'DISPATCH', 'UNBOXING'];

// Statuses that mean "a return/dispute is in flight" — while an order sits in
// one of these we never prune its videos, even past the retention date.
const DISPUTE_STATES = new Set(['RETURNED', 'REFUNDED', 'DISPUTED']);

// When an order becomes delivered, set the retention clock on its videos that
// don't already have one. Idempotent. `deliveredAt` falls back to now.
async function stampRetentionOnDelivery(order) {
  if (!order || String(order.status).toUpperCase() !== 'DELIVERED') return 0;
  const base = order.deliveredAt ? new Date(order.deliveredAt) : new Date();
  const deleteAfter = new Date(base.getTime() + RETENTION_DAYS * DAY_MS);
  const updated = await db('order_videos')
    .where({ orderId: order.id, status: 'ACTIVE' })
    .whereNull('deleteAfter')
    .update({ deleteAfter, updatedAt: new Date() });
  return updated;
}

// True if the order still has an open return/dispute (so its videos must be
// kept). Checks the order's own status plus any channel_returns row that isn't
// resolved/closed.
async function hasOpenDispute(order) {
  if (!order) return false;
  if (DISPUTE_STATES.has(String(order.status || '').toUpperCase())) return true;
  if (!order.orderNumber) return false;
  const openReturn = await db('channel_returns')
    .where({ tenantId: order.tenantId })
    .where(function () {
      this.where('orderId', order.orderNumber).orWhere('orderId', order.id);
    })
    .whereRaw("COALESCE(UPPER(`status`), '') NOT IN ('COMPLETED','CLOSED','RESOLVED','REFUNDED')")
    .first();
  return !!openReturn;
}

// Prune ACTIVE videos whose retention has expired, skipping any whose order
// still has an open return/dispute. Deletes the object (best-effort) and marks
// the row DELETED (kept as a tombstone for audit, bytes gone). Returns a small
// summary for the cron logs.
async function pruneExpiredVideos({ limit = 200 } = {}) {
  const now = new Date();
  const due = await db('order_videos')
    .where({ status: 'ACTIVE' })
    .whereNotNull('deleteAfter')
    .where('deleteAfter', '<', now)
    .limit(Math.min(1000, Number(limit) || 200));

  let deleted = 0;
  let held = 0;
  for (const v of due) {
    const order = await db('orders').where({ id: v.orderId }).first();
    if (order && await hasOpenDispute(order)) { held += 1; continue; }
    await deleteObject(v.storageKey);
    await db('order_videos').where({ id: v.id }).update({
      status: 'DELETED',
      deletedAt: now,
      updatedAt: now,
    });
    deleted += 1;
  }
  return { scanned: due.length, deleted, held, retentionDays: RETENTION_DAYS };
}

module.exports = {
  RETENTION_DAYS,
  VIDEO_TYPES,
  stampRetentionOnDelivery,
  hasOpenDispute,
  pruneExpiredVideos,
};
