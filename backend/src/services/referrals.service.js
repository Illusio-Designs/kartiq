// Referral / affiliate program.
//
// Each tenant gets a short unique code (`KQ-XXXXXX`) on first request. They
// share it via URL `?ref=CODE` on signup pages. When a referred tenant
// converts (defined here as: subscription transitions from TRIAL → ACTIVE
// on a paid plan), the referral is marked converted with its reward amount
// recorded for manual settlement (there is no wallet).
//
// Configuration knobs (read from platform_settings on demand):
//   referral.rewardAmount    — INR per conversion (default 500)
//   referral.rewardCurrency  — currency (default INR)

const { v4: uuid } = require('uuid');
const db = require('../utils/db');
const settings = require('./settings.service');

const CODE_PREFIX = 'KQ';

async function getRewardAmount() {
  const v = await settings.get('referral.rewardAmount');
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 500;
}

async function getRewardCurrency() {
  const v = await settings.get('referral.rewardCurrency');
  return v || 'INR';
}

// Generate a short, human-readable, URL-safe code. Avoid characters that
// look alike (0/O, 1/I/L) so customers don't mistype on a phone keyboard.
function randomCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${CODE_PREFIX}-${s}`;
}

// Lazy-allocate a referral code on first read. Survives collisions by
// retrying. We don't pre-generate at tenant create time so existing tenants
// can adopt the feature on next visit to /referrals.
async function ensureCodeForTenant(tenantId) {
  const row = await db('tenants').where({ id: tenantId }).first('referralCode');
  if (row?.referralCode) return row.referralCode;

  for (let i = 0; i < 8; i++) {
    const code = randomCode();
    const exists = await db('tenants').where({ referralCode: code }).first('id');
    if (exists) continue;
    await db('tenants').where({ id: tenantId }).update({ referralCode: code });
    return code;
  }
  // Astronomical luck — fall back to embedding the tenant id
  const fallback = `${CODE_PREFIX}-${tenantId.slice(0, 6).toUpperCase()}`;
  await db('tenants').where({ id: tenantId }).update({ referralCode: fallback });
  return fallback;
}

// Called from the onboard flow when a new tenant signs up with `?ref=CODE`.
// We resolve the code → referrer tenant and create a `pending` referral row.
// Self-referral and unknown codes are no-ops (we don't 4xx — the signup
// itself shouldn't fail because someone fat-fingered a code).
async function recordSignup({ referredTenantId, code }) {
  if (!code || typeof code !== 'string') return null;
  const cleaned = code.trim().toUpperCase();
  const referrer = await db('tenants').where({ referralCode: cleaned }).first('id');
  if (!referrer) return null;
  if (referrer.id === referredTenantId) return null; // self-referral
  // De-dup if somehow re-invoked
  const existing = await db('referrals').where({ referredTenantId }).first('id');
  if (existing) return existing;

  const [rewardAmount, currency] = await Promise.all([getRewardAmount(), getRewardCurrency()]);
  const id = uuid();
  await db('referrals').insert({
    id,
    referrerTenantId: referrer.id,
    referredTenantId,
    code: cleaned,
    status: 'pending',
    rewardAmount,
    rewardCurrency: currency,
    signedUpAt: new Date(),
    createdAt: new Date(),
  });
  await db('tenants').where({ id: referredTenantId }).update({ referredByCode: cleaned });
  return { id };
}

// Called when a referred tenant becomes a paying customer. Flips the status to
// converted and records the reward. Safe to call repeatedly — only the first call has effect.
async function markConverted(referredTenantId, { reason } = {}) {
  const row = await db('referrals')
    .where({ referredTenantId, status: 'pending' })
    .first();
  if (!row) return null;

  // The prepaid wallet no longer exists, so the reward is recorded on the
  // referral row (rewardAmount) and settled manually by the founder team.
  await db('referrals').where({ id: row.id }).update({
    status: 'converted',
    convertedAt: new Date(),
  });

  // Audit (without a request context — this fires from a job/route handler)
  return { id: row.id, referrerTenantId: row.referrerTenantId, reason };
}

// Manual void from admin tooling. Called when a referred tenant is found
// to be fraudulent / a duplicate. If already converted the reward is not
// clawed back automatically — handle it manually.
async function voidReferral(id, reason = 'Manual void') {
  const row = await db('referrals').where({ id }).first();
  if (!row) return null;
  if (row.status === 'voided') return row;
  await db('referrals').where({ id }).update({
    status: 'voided',
    voidedAt: new Date(),
    voidedReason: String(reason).slice(0, 255),
  });
  return { ...row, status: 'voided' };
}

// Return the referrer's view: my code, share link, list of referrals,
// total earned. Used by GET /referrals/me.
async function summaryForTenant(tenantId, frontendUrl) {
  const code = await ensureCodeForTenant(tenantId);
  const list = await db('referrals as r')
    .where('r.referrerTenantId', tenantId)
    .leftJoin('tenants as t', 't.id', 'r.referredTenantId')
    .orderBy('r.signedUpAt', 'desc')
    .select(
      'r.id', 'r.code', 'r.status', 'r.rewardAmount', 'r.rewardCurrency',
      'r.signedUpAt', 'r.convertedAt',
      't.businessName as referredBusinessName',
    )
    .limit(200);

  const earned = list
    .filter((r) => r.status === 'converted')
    .reduce((sum, r) => sum + Number(r.rewardAmount || 0), 0);
  const pendingCount = list.filter((r) => r.status === 'pending').length;
  const convertedCount = list.filter((r) => r.status === 'converted').length;

  const [rewardAmount, currency] = await Promise.all([getRewardAmount(), getRewardCurrency()]);

  return {
    code,
    shareUrl: `${frontendUrl || ''}/onboarding?ref=${encodeURIComponent(code)}`,
    rewardPerConversion: rewardAmount,
    currency,
    totals: {
      signups: list.length,
      pending: pendingCount,
      converted: convertedCount,
      earned,
    },
    referrals: list,
  };
}

module.exports = {
  ensureCodeForTenant,
  recordSignup,
  markConverted,
  voidReferral,
  summaryForTenant,
  getRewardAmount,
  getRewardCurrency,
};
