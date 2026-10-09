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
const prisma = require('../utils/prisma');
const db = require('../utils/db');
const { encryptCredentials } = require('../utils/crypto');
const { importOrders } = require('./channel.service');
const AmazonDemoAdapter = require('./channels/ecom/amazon-demo');

const { buildDemoOrders } = AmazonDemoAdapter;
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

// Warehouse + product + stock + the demo Amazon channel + fresh demo orders.
async function seedDemoData(tenantId) {
  const now = new Date();
  const whId = crypto.randomUUID();
  await db('warehouses').insert({
    id: whId, tenantId, name: 'Demo Warehouse (Pune)', code: `DEMO-WH-${Date.now().toString(36).toUpperCase()}`,
    address: JSON.stringify({ line1: '5 Industrial Estate', city: 'Pune', state: 'MH', pincode: '411019', country: 'IN' }),
    phone: '9999999999', isActive: 1, isVirtual: 0, updatedAt: now,
  });

  const sku = `DEMO-WIDGET-${Date.now().toString(36).toUpperCase()}`;
  const productId = crypto.randomUUID();
  const variantId = crypto.randomUUID();
  await db('products').insert({
    id: productId, tenantId, name: 'Demo Widget', sku, weight: 0.75,
    dimensions: JSON.stringify({ length: 30, width: 20, height: 12 }),
    images: '[]', tags: '[]', isActive: 1, updatedAt: now,
  });
  await db('product_variants').insert({
    id: variantId, tenantId, productId, sku, name: 'Demo Widget', attributes: '{}',
    costPrice: 100, mrp: 499, sellingPrice: 399, weight: 0.75, isActive: 1, updatedAt: now,
  });
  await db('inventory_items').insert({
    id: crypto.randomUUID(), tenantId, warehouseId: whId, productId, variantId,
    quantityOnHand: 200, quantityReserved: 0, quantityAvailable: 200, reorderPoint: 0, reorderQty: 0, updatedAt: now,
  });

  const ch = await prisma.channel.create({
    data: { tenantId, name: 'Amazon India (DEMO)', type: 'AMAZON', category: 'ECOM' },
  });
  await db('channels').where({ id: ch.id }).update({
    isDemo: 1, isActive: 1, autoBookShipping: 0,
    credentials: JSON.stringify(encryptCredentials({ demo: true })),
  });

  const raws = buildDemoOrders({ sku });
  const res = await importOrders(ch.id, raws, { tenantId });
  return { channelId: ch.id, imported: res.imported, failed: res.failed, errors: res.errors };
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

  const seeded = await seedDemoData(tenantId);
  return { email, password: generated || undefined, passwordWasGenerated: !!generated, tenantId, ...seeded };
}

async function resetDemo() {
  requireEnabled();
  const tenant = await findDemoTenant();
  if (!tenant) throw new DemoError(404, 'There is no demo tenant yet. Create it first.');
  if (!tenant.isDemo) throw new DemoError(403, 'Refusing to reset a non-demo tenant.'); // belt and braces
  await purgeTenantData(tenant.id);
  const seeded = await seedDemoData(tenant.id);
  return { tenantId: tenant.id, ...seeded };
}

module.exports = { getDemoStatus, setupDemo, resetDemo, demoEnabled, DemoError };
