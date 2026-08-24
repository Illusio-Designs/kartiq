// Unified cron runner for Kartriq operational jobs.
//
// Runs periodically to keep channels in sync with Kartriq. Each job is
// idempotent and logs its own results.
//
// Jobs:
//   1. syncChannelOrders   — pull new orders from every connected channel
//   2. pushInventoryToAll  — push stock levels to every connected channel
//   3. pollShipmentStatus  — update tracking status for in-transit shipments
//   4. processReviewQueue  — request reviews for delivered orders (delay N hours)
//
// Triggers:
//   - In-process (when backend boots): require('./jobs/cron.job').start()
//   - Cron: `node src/jobs/cron.job.js` (one-shot, exits after running all jobs)
//   - HTTP: `POST /api/v1/admin/cron/run` (protected, platform admin only)

const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const {
  getAdapter,
  importOrders,
  pushInventoryToChannel,
} = require('../services/channel.service');
const { processReviewQueue } = require('../services/review.service');
// Wallet auto-topup is intentionally disabled — wallet is for ad-hoc PAYG
// overage funding, not a recurring autopay surface. Saved cards still drive
// subscription renewal (see billing.job.js → autoRenewSubscription).
// Keeping the import commented for archaeology; the file itself remains a
// no-op shim so any external invoker doesn't crash.
// const { runAutopayJob } = require('./autopay.job');

// ── 1. Pull new orders from every active channel that supports it ───────────
async function syncChannelOrders() {
  const channels = await prisma.channel.findMany({
    where: { isActive: true },
    include: { tenant: { select: { status: true } } },
  });

  const results = { channelsProcessed: 0, ordersImported: 0, errors: [] };
  for (const ch of channels) {
    if (ch.tenant?.status === 'SUSPENDED' || ch.tenant?.status === 'CANCELLED') continue;

    let adapter;
    try {
      adapter = getAdapter(ch);
    } catch {
      continue; // adapter not implemented yet
    }
    if (typeof adapter.fetchOrders !== 'function') continue;

    try {
      const since = ch.lastSyncAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
      const raw = await adapter.fetchOrders({ since });
      if (Array.isArray(raw) && raw.length) {
        const res = await importOrders(ch.id, raw, { tenantId: ch.tenantId });
        results.ordersImported += res.imported;
      }
      await prisma.channel.update({
        where: { id: ch.id },
        data: { lastSyncAt: new Date(), syncError: null },
      });
      results.channelsProcessed++;
    } catch (err) {
      results.errors.push(`${ch.name} (${ch.type}): ${err.message}`);
      await prisma.channel.update({
        where: { id: ch.id },
        data: { syncError: err.message },
      }).catch((dbErr) => {
        logger.error({ err: dbErr.message }, `[cron] failed to record syncError for ${ch.id}:`);
      });
    }
  }
  return results;
}

// ── 2. Push current inventory levels to every active channel ────────────────
async function pushInventoryToAll() {
  const channels = await prisma.channel.findMany({
    where: { isActive: true },
    include: { tenant: { select: { status: true } } },
  });

  const results = { channelsProcessed: 0, skusUpdated: 0, errors: [] };
  for (const ch of channels) {
    if (ch.tenant?.status === 'SUSPENDED' || ch.tenant?.status === 'CANCELLED') continue;
    let adapter;
    try { adapter = getAdapter(ch); } catch { continue; }
    // Adapter must expose at least one of these to push inventory
    if (typeof adapter.updateInventoryLevel !== 'function' && typeof adapter.pushInventory !== 'function') {
      continue;
    }

    try {
      const res = await pushInventoryToChannel(ch, { tenantId: ch.tenantId });
      results.channelsProcessed++;
      results.skusUpdated += res?.updated || 0;
    } catch (err) {
      results.errors.push(`${ch.name}: ${err.message}`);
    }
  }
  return results;
}

// ── 3. Poll tracking status for shipments that are in transit ───────────────
async function pollShipmentStatus() {
  const results = { shipmentsChecked: 0, statusChanges: 0, delivered: 0, errors: [] };

  // Find orders that were shipped but not yet delivered, with an AWB
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ['SHIPPED', 'PROCESSING'] },
      awb: { not: null },
      channelId: { not: null },
    },
    include: { channel: true },
    take: 200,
  });

  for (const order of orders) {
    let adapter;
    try { adapter = getAdapter(order.channel); } catch { continue; }
    if (typeof adapter.trackShipment !== 'function') continue;

    try {
      const status = await adapter.trackShipment(order.awb);
      if (!status) continue;
      results.shipmentsChecked++;

      const newOrderStatus = status.status || status.orderStatus;
      if (newOrderStatus && newOrderStatus !== order.status) {
        const update = { status: newOrderStatus };
        if (newOrderStatus === 'DELIVERED') {
          update.deliveredAt = new Date();
          results.delivered++;
        }
        await prisma.order.update({ where: { id: order.id }, data: update });
        results.statusChanges++;
      }
    } catch (err) {
      results.errors.push(`Order ${order.orderNumber}: ${err.message}`);
    }
  }
  return results;
}

// ── Entry points ────────────────────────────────────────────────────────────

async function runAllJobs() {
  logger.info('[cron] starting…');
  const t0 = Date.now();

  const safe = async (name, fn) => {
    try { return { [name]: await fn() }; }
    catch (err) { logger.error({ err: err.message }, `[cron] ${name} failed:`); return { [name]: { error: err.message } }; }
  };

  const out = Object.assign(
    {},
    await safe('syncChannelOrders', syncChannelOrders),
    await safe('pushInventoryToAll', pushInventoryToAll),
    await safe('pollShipmentStatus', pollShipmentStatus),
    await safe('processReviewQueue', () => processReviewQueue({})),
    // Wallet auto-topup is intentionally disabled (see the commented import
    // above) — no runAutopayJob call here. Referencing the undefined symbol
    // threw a ReferenceError that aborted the entire cron run.
  );

  console.log('[cron] done in', Date.now() - t0, 'ms', out);
  return out;
}

// In-process scheduler — kicks off intervals when the backend boots.
// Guarded so multi-instance deployments don't double-run (set CRON_LEADER=true on one node).
let _started = false;
const _intervals = [];
function start() {
  if (_started) return;
  if (process.env.DISABLE_CRON === 'true') {
    logger.info('[cron] DISABLED via DISABLE_CRON=true');
    return;
  }
  if (process.env.CRON_LEADER === 'false') {
    console.log('[cron] skipped (CRON_LEADER=false)');
    return;
  }
  _started = true;

  const minutes = (n) => n * 60 * 1000;
  const orderSyncInterval = Number(process.env.CRON_ORDER_SYNC_MIN || 5);
  const inventoryInterval = Number(process.env.CRON_INVENTORY_MIN || 15);
  const trackingInterval  = Number(process.env.CRON_TRACKING_MIN || 10);
  const reviewInterval    = Number(process.env.CRON_REVIEW_MIN || 60);

  logger.info({ detail: {
    orderSyncMin: orderSyncInterval,
    inventoryMin: inventoryInterval,
    trackingMin: trackingInterval,
    reviewMin: reviewInterval,
  } }, '[cron] scheduling:');

  _intervals.push(
    setInterval(() => syncChannelOrders().catch((e) => console.error('[cron] syncChannelOrders:', e.message)), minutes(orderSyncInterval)),
    setInterval(() => pushInventoryToAll().catch((e) => console.error('[cron] pushInventoryToAll:', e.message)), minutes(inventoryInterval)),
    setInterval(() => pollShipmentStatus().catch((e) => console.error('[cron] pollShipmentStatus:', e.message)), minutes(trackingInterval)),
    setInterval(() => processReviewQueue({}).catch((e) => console.error('[cron] processReviewQueue:', e.message)), minutes(reviewInterval)),
    // No wallet-autopay setInterval — wallet is manual top-up only.
  );
}

function stop() {
  for (const id of _intervals) clearInterval(id);
  _intervals.length = 0;
  _started = false;
}

if (require.main === module) {
  runAllJobs()
    .catch((e) => { logger.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

module.exports = {
  start,
  stop,
  runAllJobs,
  syncChannelOrders,
  pushInventoryToAll,
  pollShipmentStatus,
};
