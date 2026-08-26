// session.service — single-session-per-device-class login guard.
//
// Rule the product wants: one account can't be signed in on two devices of the
// SAME kind at once — but a phone (app) and a computer (web) at the same time is
// fine. So we allow at most one active session per "device class":
//
//     WEB   (browser / PC / desktop app)
//     MOBILE(the native app, or a mobile browser)
//
// How it's enforced: every full-session JWT carries a session id (`sid`) and its
// device class (`dc`). The active session id for each (user, deviceClass) lives
// in `user_sessions` with a UNIQUE(userId, deviceClass) key. Logging in on a
// class REPLACES that row with a fresh sid — so the previous device's token,
// which still carries the OLD sid, no longer matches and is rejected on its next
// request ("newest device wins"). Web and mobile have independent rows, so both
// can be signed in together.

const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const db = require('../utils/db');

const DEVICE_CLASSES = ['WEB', 'MOBILE'];

// Small in-process cache of "is this sid still the active one" so we don't hit
// the DB on every authenticated request. Short TTL; invalidated on revoke.
const _cache = new Map(); // sid -> { ok, exp }
const CACHE_TTL_MS = 30 * 1000;

// Decide the device class from an explicit client header first (the web app and
// the mobile app both set one), falling back to a User-Agent sniff so requests
// without the header still get classified sensibly.
function resolveDeviceClass(req) {
  const explicit = String(
    req.headers['x-client-type'] || req.headers['x-client'] || req.headers['x-device-type'] || ''
  ).toLowerCase();
  if (['mobile', 'app', 'ios', 'android', 'expo', 'native'].includes(explicit)) return 'MOBILE';
  if (['web', 'pc', 'desktop', 'browser'].includes(explicit)) return 'WEB';

  const ua = String(req.headers['user-agent'] || '');
  if (/\b(Expo|okhttp|Dalvik|CFNetwork|Android|iPhone|iPad|iPod|Mobile)\b/i.test(ua)) return 'MOBILE';
  return 'WEB';
}

// Create (and replace any prior) session for this user on the resolved device
// class. Returns { sid, deviceClass }.
async function createSession(user, req) {
  const deviceClass = resolveDeviceClass(req);
  const sid = randomUUID();
  const now = new Date();
  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim()
    || req.ip || req.socket?.remoteAddress || null;
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 1000) || null;

  // Replace any existing session on this device class (newest wins). Deleting
  // first keeps it robust even where the UNIQUE upsert isn't available.
  await db('user_sessions').where({ userId: user.id, deviceClass }).del();
  await db('user_sessions').insert({
    id: sid,
    userId: user.id,
    tenantId: user.tenantId || null,
    deviceClass,
    userAgent,
    ip: ip ? String(ip).slice(0, 64) : null,
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null,
  });
  return { sid, deviceClass };
}

// Issue a 7-day session JWT bound to a fresh session row. Drop-in replacement
// for the old issueJwt(user), but needs `req` to know the device class.
async function issueSessionToken(user, req) {
  const { sid, deviceClass } = await createSession(user, req);
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId || null,
      isPlatformAdmin: !!user.isPlatformAdmin,
      sid,
      dc: deviceClass,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Is this token's session still the active one for its device class? Tokens
// minted before this feature (no sid) are treated as valid for back-compat, so
// a deploy doesn't sign everyone out. Fails OPEN on a DB error — consistent with
// the auth middleware's rule of never logging a user out on a transient hiccup.
async function isSessionActive(sid, userId) {
  if (!sid) return true;
  const hit = _cache.get(sid);
  if (hit && hit.exp > Date.now()) return hit.ok;
  try {
    const row = await db('user_sessions').where({ id: sid }).first();
    const ok = !!row && !row.revokedAt && (!userId || row.userId === userId);
    _cache.set(sid, { ok, exp: Date.now() + CACHE_TTL_MS });
    return ok;
  } catch (e) {
    // Don't punish users for a DB blip — allow, and don't cache the failure.
    console.error('[session] isSessionActive lookup failed:', e.message);
    return true;
  }
}

// Revoke a single session (used on logout).
async function revokeSession(sid) {
  if (!sid) return;
  _cache.delete(sid);
  try {
    await db('user_sessions').where({ id: sid }).del();
  } catch (e) {
    console.error('[session] revokeSession failed:', e.message);
  }
}

// Revoke every session for a user (e.g. on password reset / forced logout).
async function revokeAllForUser(userId) {
  if (!userId) return;
  try {
    const rows = await db('user_sessions').where({ userId }).select('id');
    for (const r of rows) _cache.delete(r.id);
    await db('user_sessions').where({ userId }).del();
  } catch (e) {
    console.error('[session] revokeAllForUser failed:', e.message);
  }
}

module.exports = {
  DEVICE_CLASSES,
  resolveDeviceClass,
  createSession,
  issueSessionToken,
  isSessionActive,
  revokeSession,
  revokeAllForUser,
};
