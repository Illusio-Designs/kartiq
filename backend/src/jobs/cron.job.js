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
const { pruneExpiredVideos } = require('../services/vms.service');
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
    take: 500, // cap unbounded cross-tenant scan (repo rule: bounded queries)
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

// ── 1b. Fast, near-real-time order sync ─────────────────────────────────────
// Runs on a tight cadence (default every 1 min) and fetches ONLY what changed
// since the previous fast pass — new orders and updates to existing ones — NOT
// the whole history and NOT a fixed window re-pulled every minute. It keeps a
// per-channel in-memory cursor (the time of the last successful fast pass) and
// asks Amazon for orders LastUpdatedAfter that cursor, minus a small safety
// overlap for clock skew. First run (or after a restart) falls back to a short
// window. It does NOT touch lastSyncAt/syncError — the full 5-min sync owns
// that. Disable with CRON_FAST_ORDER_SYNC_MIN=0.
const _fastCursor = new Map(); // channelId -> Date of last successful fast pass
async function syncRecentOrders() {
  const firstWindowMs = Number(process.env.FAST_ORDER_WINDOW_MIN || 15) * 60 * 1000;
  const overlapMs = 2 * 60 * 1000; // re-scan the last ~2 min so nothing slips the boundary
  const channels = await prisma.channel.findMany({
    where: { isActive: true },
    include: { tenant: { select: { status: true } } },
    take: 500, // cap unbounded cross-tenant scan (repo rule: bounded queries)
  });

  const results = { channelsProcessed: 0, ordersImported: 0, errors: [] };
  for (const ch of channels) {
    if (ch.tenant?.status === 'SUSPENDED' || ch.tenant?.status === 'CANCELLED') continue;
    let adapter;
    try { adapter = getAdapter(ch); } catch { continue; }
    if (typeof adapter.fetchOrders !== 'function') continue;

    const startedAt = new Date();
    const last = _fastCursor.get(ch.id);
    // Only new + recently-changed orders since the last pass (with overlap);
    // on the very first pass, a short catch-up window.
    const since = last ? new Date(last.getTime() - overlapMs) : new Date(Date.now() - firstWindowMs);

    try {
      const raw = await adapter.fetchOrders({ since });
      if (Array.isArray(raw) && raw.length) {
        const res = await importOrders(ch.id, raw, { tenantId: ch.tenantId });
        results.ordersImported += res.imported;
      }
      _fastCursor.set(ch.id, startedAt); // advance the cursor only on success
      results.channelsProcessed++;
    } catch (err) {
      // Don't advance the cursor — the next pass retries from the same point.
      results.errors.push(`${ch.name} (${ch.type}): ${err.message}`);
    }
  }
  return results;
}

// ── 2. Push current inventory levels to every active channel ────────────────
async function pushInventoryToAll() {
  const channels = await prisma.channel.findMany({
    where: { isActive: true },
    include: { tenant: { select: { status: true } } },
    take: 500, // cap unbounded cross-tenant scan (repo rule: bounded queries)
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

// Valid order-status enum values (mirrors the DB enum). A raw courier status
// string must never be written into this column — map it first.
const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];

// Map a free-form courier status string (e.g. "In Transit", "Out for Delivery",
// "RTO Initiated") onto a valid order-status enum value. Returns null for
// unknown strings so the caller skips the write rather than corrupting the enum.
function mapCourierStatus(raw) {
  if (raw == null) return null;
  const upper = String(raw).toUpperCase();
  if (ORDER_STATUSES.includes(upper)) return upper; // adapter already gave an enum value
  const s = upper.toLowerCase();
  if (s.includes('rto') || s.includes('return')) return 'RETURNED';
  if (s.includes('cancel')) return 'CANCELLED';
  if (s.includes('out for delivery')) return 'SHIPPED'; // check before 'deliver'
  if (s.includes('deliver')) return 'DELIVERED';
  if (s.includes('transit') || s.includes('shipped') || s.includes('dispatch')) return 'SHIPPED';
  return null;
}

// ── 3. Poll tracking status for shipments that are in transit ───────────────
async function pollShipmentStatus() {
  const results = { shipmentsChecked: 0, statusChanges: 0, delivered: 0, errors: [] };

  // Find orders that were shipped but not yet delivered, with an AWB.
  // Oldest-updated first so a large backlog can't starve stale shipments.
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ['SHIPPED', 'PROCESSING'] },
      awb: { not: null },
      channelId: { not: null },
    },
    include: { channel: true },
    orderBy: { updatedAt: 'asc' },
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

      // Adapters return { currentStatus }; keep legacy fallbacks. Always map
      // the raw courier string to a valid enum before writing.
      const rawStatus = status.currentStatus || status.status || status.orderStatus;
      const newOrderStatus = mapCourierStatus(rawStatus);
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
    await safe('pruneExpiredVideos', () => pruneExpiredVideos({})),
    // Wallet auto-topup is intentionally disabled (see the commented import
    // above) — no runAutopayJob call here. Referencing the undefined symbol
    // threw a ReferenceError that aborted the entire cron run.
  );

  console.log('[cron] done in', Date.now() - t0, 'ms', out);
  return out;
}

// In-process scheduler — kicks off intervals when the backend boots.
//
// Leader election is OPT-IN and fail-safe: in a multi-instance deployment the
// schedulers run ONLY on the node explicitly marked leader (CRON_LEADER=true),
// so N replicas don't each duplicate every job. Any other CRON_LEADER value
// (e.g. 'false') means "not leader" and skips. When CRON_LEADER is unset we
// assume a single instance (dev / one-box prod) and run — unless CRON_ENABLED
// is set to 'false' to force the schedulers off. This keeps local dev working
// out of the box while preventing accidental N-instance duplication in a fleet.
let _started = false;
const _intervals = [];

// Per-job re-entrancy guard: if a job's previous tick is still running when the
// next interval fires, skip this tick rather than piling on a second copy.
const _inFlight = new Set();
function guarded(name, fn) {
  return async () => {
    if (_inFlight.has(name)) {
      console.log(`[cron] ${name} still running — skipping this tick`);
      return;
    }
    _inFlight.add(name);
    try { await fn(); }
    catch (e) { console.error(`[cron] ${name}:`, e.message); }
    finally { _inFlight.delete(name); }
  };
}

// Parse a minutes env var, falling back to `def` when missing or non-numeric
// (a NaN interval makes setInterval busy-loop). `allowZero` lets a job opt out.
function parseMinutes(raw, def, allowZero = false) {
  const n = Number(raw);
  if (Number.isFinite(n) && (n > 0 || (allowZero && n === 0))) return n;
  return def;
}

function start() {
  if (_started) return;
  if (process.env.DISABLE_CRON === 'true') {
    logger.info('[cron] DISABLED via DISABLE_CRON=true');
    return;
  }
  const leader = process.env.CRON_LEADER;
  const isLeader = leader === 'true';
  const singleInstance = (leader === undefined || leader === '') && process.env.CRON_ENABLED !== 'false';
  if (!isLeader && !singleInstance) {
    console.log(`[cron] skipped (not leader; CRON_LEADER=${leader ?? 'unset'}, CRON_ENABLED=${process.env.CRON_ENABLED ?? 'unset'})`);
    return;
  }
  _started = true;

  const minutes = (n) => n * 60 * 1000;
  const orderSyncInterval = parseMinutes(process.env.CRON_ORDER_SYNC_MIN, 5);
  const fastOrderInterval = parseMinutes(process.env.CRON_FAST_ORDER_SYNC_MIN ?? 1, 1, true); // 0 disables
  const inventoryInterval = parseMinutes(process.env.CRON_INVENTORY_MIN, 15);
  const trackingInterval  = parseMinutes(process.env.CRON_TRACKING_MIN, 10);
  const reviewInterval    = parseMinutes(process.env.CRON_REVIEW_MIN, 60);
  const videoPruneInterval = parseMinutes(process.env.CRON_VIDEO_PRUNE_MIN, 360); // every 6h

  logger.info({ detail: {
    orderSyncMin: orderSyncInterval,
    fastOrderSyncMin: fastOrderInterval,
    inventoryMin: inventoryInterval,
    trackingMin: trackingInterval,
    reviewMin: reviewInterval,
    videoPruneMin: videoPruneInterval,
  } }, '[cron] scheduling:');

  _intervals.push(
    setInterval(guarded('syncChannelOrders', syncChannelOrders), minutes(orderSyncInterval)),
    setInterval(guarded('pushInventoryToAll', pushInventoryToAll), minutes(inventoryInterval)),
    setInterval(guarded('pollShipmentStatus', pollShipmentStatus), minutes(trackingInterval)),
    setInterval(guarded('processReviewQueue', () => processReviewQueue({})), minutes(reviewInterval)),
    setInterval(guarded('pruneExpiredVideos', () => pruneExpiredVideos({})), minutes(videoPruneInterval)),
    // No wallet-autopay setInterval — wallet is manual top-up only.
  );

  // Fast, near-real-time order pass — only new + changed orders each minute.
  if (fastOrderInterval > 0) {
    _intervals.push(
      setInterval(guarded('syncRecentOrders', syncRecentOrders), minutes(fastOrderInterval)),
    );
  }
}

function stop() {
  for (const id of _intervals) clearInterval(id);
  _intervals.length = 0;
  _started = false;
}

if (require.main === module) {
  // Run migrations first (npm run cron:run) so migration-only columns exist even
  // if the server never bootstrapped this DB.
  const { initDb } = require('../bootstrap/initDb');
  initDb()
    .then(() => runAllJobs())
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
