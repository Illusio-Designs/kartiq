// Demo mode — a public-safe sandbox tenant so anyone can log in on a LIVE site
// and click through the Amazon flows (auto-booked courier, labels, packing
// slips, bulk printing) with NO real Amazon account and NO real money.
//
// How it stays safe:
//   • Off unless the server sets DEMO_MODE_ENABLED=true.
//   • Only platform admins can create / reset it (admin routes).
//   • The fake Amazon is attached to ONE channel (channels.isDemo=1) that lives
//     in ONE tenant (tenants.isDemo=1). No API lets a seller set isDemo.
//   • Reset only ever purges the tenant flagged isDemo — never anyone else.
//   • The demo tenant is on the hidden FIVERR_FREE plan (all features, free).

const crypto = require('crypto');
const db = require('../utils/db');
const { encryptCredentials } = require('../utils/crypto');
const demoEnabled = () => process.env.DEMO_MODE_ENABLED === 'true';

class DemoError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const requireEnabled = () => {
  if (!demoEnabled()) throw new DemoError(403, 'Demo mode is not enabled on this server. Set DEMO_MODE_ENABLED=true and restart.');
};

// Business data wiped on reset. Users, plan/subscription, roles, wallet, billing
// and audit history are kept, so the demo login keeps working.
const PURGE_TABLES = [
  'order_labels', 'order_videos', 'stock_movements', 'returns', 'invoices', 'shipments',
  'channel_returns', 'channel_settlements', 'order_items', 'orders', 'channel_listings',
  'purchase_order_items', 'purchase_orders', 'inventory_items', 'product_variants', 'products',
  'customers', 'vendors', 'brands', 'categories', 'channel_requests', 'channels', 'warehouses',
  'usage_meters',
];

async function findDemoTenant() {
  return db('tenants').where({ isDemo: 1 }).first();
}

async function getDemoStatus() {
  const tenant = await findDemoTenant();
  const out = { enabled: demoEnabled(), exists: !!tenant, tenant: null, channel: null, counts: null };
  if (!tenant) return out;
  const owner = await db('users').where({ tenantId: tenant.id }).orderBy('createdAt', 'asc').first();
  const channel = await db('channels').where({ tenantId: tenant.id, isDemo: 1 }).first();
  const n = async (table, where = {}) => Number((await db(table).where({ tenantId: tenant.id, ...where }).count({ c: '*' }).first()).c);
  out.tenant = { id: tenant.id, businessName: tenant.businessName, loginEmail: owner?.email || tenant.ownerEmail };
  out.channel = channel ? { id: channel.id, name: channel.name, autoBookShipping: !!channel.autoBookShipping } : null;
  out.counts = {
    orders: await n('orders'),
    mfn: await n('orders', { fulfillmentType: 'SELF' }),
    fba: await n('orders', { fulfillmentType: 'CHANNEL' }),
    labels: await n('order_labels', { status: 'ACTIVE' }),
  };
  return out;
}

// Wipe the demo tenant's business data (multi-pass: retry tables that are still
// referenced until everything is gone, so any extra data a tester created —
// purchases, vendors, invoices — is cleaned too).
async function purgeTenantData(tenantId) {
  const existing = [];
  for (const t of PURGE_TABLES) {
    const has = await db.schema.hasTable(t);
    if (has && await db.schema.hasColumn(t, 'tenantId')) existing.push(t);
  }
  let pending = existing.slice();
  for (let pass = 0; pass < 6 && pending.length; pass++) {
    const next = [];
    for (const t of pending) {
      try { await db(t).where({ tenantId }).del(); } catch { next.push(t); }
    }
    pending = next;
  }
  if (pending.length) throw new DemoError(500, `Could not clear: ${pending.join(', ')}`);
}

// What the demo tenant starts with: ONLY a warehouse (with a real address, which
// Amazon needs as the ship-from). Everything else is created by the tester
// clicking through the real screens — connect the Amazon channel, pull the
// catalog, sync the orders — so the demo covers the whole journey.
async function seedDemoData(tenantId) {
  const whId = crypto.randomUUID();
  await db('warehouses').insert({
    id: whId, tenantId, name: 'Demo Warehouse (Pune)', code: `DEMO-WH-${Date.now().toString(36).toUpperCase()}`,
    address: JSON.stringify({ line1: '5 Industrial Estate', city: 'Pune', state: 'MH', pincode: '411019', country: 'IN' }),
    phone: '9999999999', isActive: 1, isVirtual: 0, updatedAt: new Date(),
  });
  return { warehouseId: whId };
}

// Is this tenant THE demo tenant (and is demo mode on)? Used to flag a demo
// tenant's new Amazon channel as a demo channel — decided by the server from the
// tenant, never from anything the client sends.
async function isDemoTenant(tenantId) {
  if (!demoEnabled() || !tenantId) return false;
  const t = await db('tenants').where({ id: tenantId, isDemo: 1 }).first();
  return !!t;
}

// The fake "Authorize with Amazon" step succeeded: mark the channel connected.
// Real credentials are never stored for a demo channel.
async function completeDemoConnect(channelId, tenantId) {
  if (!(await isDemoTenant(tenantId))) throw new DemoError(403, 'Demo authorization is only available in the demo tenant.');
  const ch = await db('channels').where({ id: channelId, tenantId }).first();
  if (!ch) throw new DemoError(404, 'Channel not found');
  if (ch.type !== 'AMAZON') throw new DemoError(400, 'Only the Amazon channel has a demo authorization.');
  await db('channels').where({ id: channelId }).update({
    isDemo: 1, isActive: 1, syncError: null,
    credentials: JSON.stringify(encryptCredentials({ demo: true })),
  });
  return { connected: true };
}

async function setupDemo({ email, password, businessName } = {}) {
  requireEnabled();
  if (await findDemoTenant()) throw new DemoError(409, 'A demo tenant already exists. Use "Reset demo data" instead.');
  email = String(email || 'demo-seller@kartriq.test').trim().toLowerCase();
  let generated = null;
  if (!password) { generated = crypto.randomBytes(12).toString('base64url'); password = generated; }
  if (String(password).length < 10) throw new DemoError(400, 'The demo password must be at least 10 characters.');
  if (await db('users').where({ email }).first()) throw new DemoError(409, `The email ${email} is already used by another account.`);

  // Create the tenant + owner through the normal onboarding code path.
  const { onboardBusiness } = require('../controllers/auth.controller');
  const result = await new Promise((resolve, reject) => {
    const res = {
      _s: 200,
      status(c) { this._s = c; return this; },
      json(b) { resolve({ status: this._s, body: b }); return this; },
    };
    Promise.resolve(onboardBusiness({
      body: { email, password, businessName: businessName || 'Kartriq Demo Seller', ownerName: 'Demo Seller', planCode: 'STANDARD' },
      headers: {}, ip: '127.0.0.1',
    }, res)).catch(reject);
  });
  if (result.status !== 201) throw new DemoError(500, `Could not create the demo account: ${JSON.stringify(result.body).slice(0, 200)}`);
  const tenantId = result.body.tenant.id;

  // Flag it, put it on the forever-free plan.
  const plan = await db('plans').where({ code: 'FIVERR_FREE' }).first();
  if (!plan) throw new DemoError(500, 'The FIVERR_FREE plan is missing — run the seed (npm run db:seed).');
  const farFuture = new Date(); farFuture.setFullYear(farFuture.getFullYear() + 100);
  await db('tenants').where({ id: tenantId }).update({ isDemo: 1, status: 'ACTIVE', trialEndsAt: null });
  await db('subscriptions').where({ tenantId }).update({
    planId: plan.id, status: 'ACTIVE', currentPeriodEnd: farFuture, trialEndsAt: null,
  });

  await seedDemoData(tenantId);
  return { email, password: generated || undefined, passwordWasGenerated: !!generated, tenantId };
}

async function resetDemo() {
  requireEnabled();
  const tenant = await findDemoTenant();
  if (!tenant) throw new DemoError(404, 'There is no demo tenant yet. Create it first.');
  if (!tenant.isDemo) throw new DemoError(403, 'Refusing to reset a non-demo tenant.'); // belt and braces
  await purgeTenantData(tenant.id);
  await seedDemoData(tenant.id);
  return { tenantId: tenant.id };
}

module.exports = { getDemoStatus, setupDemo, resetDemo, demoEnabled, isDemoTenant, completeDemoConnect, DemoError };
