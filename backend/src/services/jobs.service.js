// Background job queue — durable, retry-aware, no Redis required.
//
// Why not BullMQ?
//   The platform's typical deployment target is a single Node process on a
//   shared host (cPanel / small VPS) without Redis. Running another service
//   purely for job queueing is overkill at this scale. We get the same
//   retry / dead-letter semantics with a `job_queue` MySQL table that we
//   already own.
//
// What you get:
//   - enqueue(type, payload, opts) — returns the job id
//   - register(type, handlerFn)    — wires a handler at boot
//   - startWorker()                — runs the polling loop in-process
//   - retry(id) / discard(id)      — admin actions on dead-letter rows
//   - stats()                      — counts by status (for /admin/jobs)
//
// Failure model:
//   On throw the job is rescheduled with exponential back-off
//   (30s · 1m · 5m · 15m · 60m). After `maxAttempts` it transitions to
//   status='dead' and stays there until an admin retries or discards.
//
// Concurrency:
//   Workers claim a row by UPDATE…WHERE status='pending' (atomic). If the
//   rowcount is 0 someone else got it; we just look for the next one.
//   This works on every MySQL/MariaDB version we support — no need for
//   SELECT … FOR UPDATE SKIP LOCKED (MySQL 8+ / MariaDB 10.6+).

const os = require('os');
const { v4: uuid } = require('uuid');
const db = require('../utils/db');
const logger = require('./settings.service'); // not used, but proves require works
// Use a real logger
const log = require('../utils/logger');

// In-memory handler registry. Populated at boot via register().
const handlers = new Map();
let workerStop = null;

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const BACKOFF_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
// Stale "running" rows older than this get reset to pending so we don't
// lose work after a hard crash mid-job.
const STALE_LOCK_MS = 10 * 60_000;

function register(type, fn) {
  if (typeof fn !== 'function') throw new Error(`handler for ${type} must be a function`);
  handlers.set(type, fn);
}

async function enqueue(type, payload = {}, opts = {}) {
  const {
    runAt = new Date(),
    maxAttempts = 5,
    priority = 5,
  } = opts;
  const id = uuid();
  await db('job_queue').insert({
    id,
    type,
    payload: JSON.stringify(payload || {}),
    priority,
    runAt,
    maxAttempts,
    attempts: 0,
    status: 'pending',
    createdAt: new Date(),
  });
  return id;
}

// Reset rows that look orphaned (running for too long → worker likely died
// without finishing). Called periodically by the worker tick.
async function reapStale() {
  const cutoff = new Date(Date.now() - STALE_LOCK_MS);
  const reaped = await db('job_queue')
    .where({ status: 'running' })
    .where('lockedAt', '<', cutoff)
    .update({
      status: 'pending',
      lockedAt: null,
      lockedBy: null,
      lastError: 'Reaped stale lock — worker did not finish in time',
    });
  if (reaped > 0) log.warn?.({ reaped }, '[jobs] reaped stale running rows') ?? console.warn(`[jobs] reaped ${reaped} stale rows`);
  return reaped;
}

// Pick + claim one ready job. Returns the row or null.
async function claimNext() {
  const candidate = await db('job_queue')
    .where({ status: 'pending' })
    .where('runAt', '<=', new Date())
    .orderBy([{ column: 'priority', order: 'asc' }, { column: 'runAt', order: 'asc' }])
    .first();
  if (!candidate) return null;

  // Atomic claim — only the row whose status is still 'pending' wins.
  const claimed = await db('job_queue')
    .where({ id: candidate.id, status: 'pending' })
    .update({
      status: 'running',
      lockedAt: new Date(),
      lockedBy: WORKER_ID,
      attempts: db.raw('attempts + 1'),
    });
  if (!claimed) return null; // raced — try again next tick
  // Re-fetch so we have the bumped attempts count for downstream maths.
  return db('job_queue').where({ id: candidate.id }).first();
}

// Run one tick: claim + execute one job. Returns null when nothing to do.
async function tick() {
  const job = await claimNext();
  if (!job) return null;

  const handler = handlers.get(job.type);
  if (!handler) {
    await db('job_queue').where({ id: job.id }).update({
      status: 'dead',
      lastError: `No handler registered for type "${job.type}"`,
      finishedAt: new Date(),
      lockedBy: null,
    });
    return { id: job.id, ok: false, reason: 'no-handler' };
  }

  let payload;
  try { payload = JSON.parse(job.payload); }
  catch (e) { payload = {}; }

  try {
    await handler(payload, { id: job.id, attempts: job.attempts });
    await db('job_queue').where({ id: job.id }).update({
      status: 'done',
      finishedAt: new Date(),
      lastError: null,
      lockedBy: null,
    });
    return { id: job.id, ok: true };
  } catch (err) {
    const reason = err?.message || String(err);
    if (job.attempts >= job.maxAttempts) {
      await db('job_queue').where({ id: job.id }).update({
        status: 'dead',
        lastError: reason,
        finishedAt: new Date(),
        lockedBy: null,
      });
      log.error?.({ jobId: job.id, type: job.type, reason }, '[jobs] dead-lettered') ?? console.error(`[jobs] dead-lettered ${job.id} (${job.type}): ${reason}`);
    } else {
      const backoff = BACKOFF_MS[Math.min(job.attempts - 1, BACKOFF_MS.length - 1)] || BACKOFF_MS[BACKOFF_MS.length - 1];
      await db('job_queue').where({ id: job.id }).update({
        status: 'pending',
        runAt: new Date(Date.now() + backoff),
        lastError: reason,
        lockedBy: null,
      });
    }
    return { id: job.id, ok: false, error: reason };
  }
}

// Long-running poller. Run in-process from index.js, or as its own node
// process for HA setups. Multiple workers are safe.
function startWorker({ pollMs = 5_000, idleMs = 5_000, reapEveryMs = 60_000 } = {}) {
  if (workerStop) return workerStop; // already running
  let stopped = false;
  let lastReap = 0;

  const loop = async () => {
    while (!stopped) {
      try {
        if (Date.now() - lastReap > reapEveryMs) {
          await reapStale().catch(() => {});
          lastReap = Date.now();
        }
        const r = await tick();
        if (!r) {
          await new Promise((res) => setTimeout(res, idleMs));
        } else {
          // Got a job — immediately try the next without idling
          await new Promise((res) => setTimeout(res, pollMs > 0 ? 50 : 0));
        }
      } catch (err) {
        // Log the full error, not just err.message — DB connection failures
        // (e.g. cPanel MySQL connection-limit / stale-connection drops) often
        // carry the useful detail on err.code / err.stack, and a bare empty
        // message here is undiagnosable.
        console.error('[jobs] worker loop error:', err?.code || '', err?.stack || err?.message || err);
        await new Promise((res) => setTimeout(res, idleMs));
      }
    }
  };
  loop();
  workerStop = () => { stopped = true; workerStop = null; };
  return workerStop;
}

// ── Admin / observability helpers ──────────────────────────────────────────

async function stats() {
  const rows = await db('job_queue')
    .select('status')
    .count('* as count')
    .groupBy('status');
  const out = { pending: 0, running: 0, done: 0, dead: 0 };
  for (const r of rows) out[r.status] = Number(r.count) || 0;
  return out;
}

async function listByStatus(status, { limit = 100, type } = {}) {
  const q = db('job_queue').where({ status }).orderBy('createdAt', 'desc').limit(Math.min(500, limit));
  if (type) q.andWhere({ type });
  return q;
}

async function retryDead(id) {
  const updated = await db('job_queue')
    .where({ id, status: 'dead' })
    .update({
      status: 'pending',
      runAt: new Date(),
      attempts: 0,
      lockedAt: null,
      lockedBy: null,
      finishedAt: null,
    });
  return updated > 0;
}

async function discard(id) {
  return db('job_queue').where({ id }).del();
}

// Periodic cleanup — call from a daily cron. Keeps the table small.
async function purgeOld({ doneOlderThanDays = 7, deadOlderThanDays = 90 } = {}) {
  const doneCutoff = new Date(Date.now() - doneOlderThanDays * 86_400_000);
  const deadCutoff = new Date(Date.now() - deadOlderThanDays * 86_400_000);
  const [doneN, deadN] = await Promise.all([
    db('job_queue').where({ status: 'done' }).where('finishedAt', '<', doneCutoff).del(),
    db('job_queue').where({ status: 'dead' }).where('finishedAt', '<', deadCutoff).del(),
  ]);
  return { done: doneN, dead: deadN };
}

module.exports = {
  enqueue,
  register,
  startWorker,
  tick,
  reapStale,
  stats,
  listByStatus,
  retryDead,
  discard,
  purgeOld,
};
