const prisma = require('../utils/prisma');
const { getAdapter } = require('./channel.service');

// ── Configuration ────────────────────────────────────────────────────────────
// Hours to wait after delivery before triggering the channel's review API.
// Amazon's Solicitations API only allows a review request 5–30 days after
// delivery, so the default is 120h (5 days) — a shorter value is rejected by
// Amazon as "no solicitation available". Configurable via env var.
const REVIEW_DELAY_HOURS = parseInt(process.env.REVIEW_REQUEST_DELAY_HOURS || '120', 10);

// Amazon's Orders API never reports a "Delivered" status — it tops out at
// Shipped — so FBA orders would otherwise never become review-eligible. We
// treat an Amazon order shipped at least this many days ago as eligible; the
// Solicitations API itself enforces the real 5–30 day window, so an early
// attempt is simply skipped by Amazon rather than sent twice.
const AMAZON_SHIPPED_REVIEW_DAYS = parseInt(process.env.AMAZON_SHIPPED_REVIEW_DAYS || '7', 10);

function isAmazonChannel(channel) {
  return String(channel?.type || '').toUpperCase().includes('AMAZON');
}

// An order is eligible for a review request when it's delivered, or (for
// Amazon, which has no delivered event) shipped long enough ago.
function isReviewEligible(order) {
  if (order.reviewRequestedAt) return false;
  if (!order.channelOrderId) return false;
  if (order.status === 'DELIVERED') return true;
  if (order.status === 'SHIPPED' && isAmazonChannel(order.channel)) {
    const shipped = order.shippedAt ? new Date(order.shippedAt) : (order.orderedAt ? new Date(order.orderedAt) : null);
    if (shipped && Date.now() - shipped.getTime() >= AMAZON_SHIPPED_REVIEW_DAYS * 24 * 60 * 60 * 1000) return true;
  }
  return false;
}

// Adapters that implement requestReview() — all others are skipped gracefully.
function adapterSupportsReview(adapter) {
  return adapter && typeof adapter.requestReview === 'function';
}

// ── Trigger review request for a single order ───────────────────────────────
async function requestReviewForOrder(orderId, { tenantId } = {}) {
  const where = { id: orderId };
  if (tenantId) where.tenantId = tenantId;
  const order = await prisma.order.findFirst({
    where,
    include: { channel: true },
  });
  if (!order) throw new Error('Order not found');
  if (order.reviewRequestedAt) {
    return { alreadyRequested: true, requestedAt: order.reviewRequestedAt };
  }
  if (!order.channelOrderId) throw new Error('Order has no channelOrderId');
  if (!isReviewEligible(order)) {
    throw new Error(
      order.status === 'SHIPPED'
        ? 'Order was shipped too recently — Amazon allows a review request 5–30 days after delivery.'
        : 'Order is not delivered yet'
    );
  }

  const adapter = getAdapter(order.channel);
  if (!adapterSupportsReview(adapter)) {
    throw new Error(`${order.channel.type}: channel does not support review requests`);
  }

  try {
    const result = await adapter.requestReview(order.channelOrderId, order);
    await prisma.order.update({
      where: { id: order.id },
      data: { reviewRequestedAt: new Date(), reviewRequestError: null },
    });
    return { success: true, result };
  } catch (err) {
    await prisma.order.update({
      where: { id: order.id },
      data: { reviewRequestError: err.message },
    });
    throw err;
  }
}

// ── Batch processor — run from a cron / scheduled job ───────────────────────
// Finds all DELIVERED orders where:
//   - delivered > N hours ago
//   - reviewRequestedAt IS NULL
//   - channel's adapter supports requestReview()
async function processReviewQueue({ delayHours = REVIEW_DELAY_HOURS, limit = 100, tenantId = null } = {}) {
  const cutoff = new Date(Date.now() - delayHours * 60 * 60 * 1000);
  const shippedCutoff = new Date(Date.now() - AMAZON_SHIPPED_REVIEW_DAYS * 24 * 60 * 60 * 1000);

  // Two eligibility buckets (the shim's OR support is limited, so query each):
  //   A. Delivered orders past the delay window.
  //   B. Amazon orders shipped long enough ago (no "Delivered" event exists).
  const base = { reviewRequestedAt: null, channelOrderId: { not: null } };
  if (tenantId) base.tenantId = tenantId;

  const [delivered, shipped] = await Promise.all([
    prisma.order.findMany({
      where: { ...base, status: 'DELIVERED', deliveredAt: { lte: cutoff } },
      include: { channel: true }, take: limit, orderBy: { deliveredAt: 'asc' },
    }),
    prisma.order.findMany({
      where: { ...base, status: 'SHIPPED', shippedAt: { lte: shippedCutoff } },
      include: { channel: true }, take: limit, orderBy: { shippedAt: 'asc' },
    }),
  ]);

  // Merge, keep only genuinely eligible ones (Amazon-only for the shipped set),
  // dedupe by id, and cap at `limit`.
  const seen = new Set();
  const orders = [...delivered, ...shipped]
    .filter((o) => { if (seen.has(o.id)) return false; seen.add(o.id); return isReviewEligible(o); })
    .slice(0, limit);

  const results = { processed: 0, skipped: 0, failed: 0, errors: [] };

  for (const order of orders) {
    let adapter;
    try {
      adapter = getAdapter(order.channel);
    } catch (err) {
      results.skipped++;
      continue;
    }

    if (!adapterSupportsReview(adapter)) {
      results.skipped++;
      continue;
    }

    try {
      await adapter.requestReview(order.channelOrderId, order);
      await prisma.order.update({
        where: { id: order.id },
        data: { reviewRequestedAt: new Date(), reviewRequestError: null },
      });
      results.processed++;
    } catch (err) {
      results.failed++;
      results.errors.push(`${order.orderNumber}: ${err.message}`);
      await prisma.order.update({
        where: { id: order.id },
        data: { reviewRequestError: err.message },
      }).catch(() => {});
    }
  }

  return { ...results, cutoff, totalEligible: orders.length };
}

module.exports = {
  requestReviewForOrder,
  processReviewQueue,
  isReviewEligible,
  REVIEW_DELAY_HOURS,
  AMAZON_SHIPPED_REVIEW_DAYS,
};
