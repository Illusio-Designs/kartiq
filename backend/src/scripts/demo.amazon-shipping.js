// Click-through demo for the Amazon auto-booked courier + printable label.
//
//   cd backend && npm run demo:amazon-shipping
//
// Starts the real backend with a FAKE Amazon behind it (no Amazon account, no
// real money), and prepares a demo seller with:
//   • 1 FBA order  (Amazon ships it — Kartriq only watches)
//   • 3 MFN orders (you ship them — try the auto-booked courier on these)
// Then open the web app (cd frontend && npm run dev) and log in with the
// credentials printed below. The fake Amazon offers 3 couriers; the cheapest
// (₹62.50 "Standard / SlowCo") is the one that gets auto-booked.
//
// Needs MySQL (see backend/.env). Press Ctrl+C to stop.

process.env.PORT = process.env.PORT || '5001';
process.env.DISABLE_CRON = 'true';
process.env.DISABLE_RATE_LIMIT = 'true';

const http = require('http');
const { fake, install, amazonOrder } = require('./lib/fakeAmazon');
install();

const BASE = `http://localhost:${process.env.PORT}/api/v1`;
const EMAIL = process.env.DEMO_EMAIL || 'demo-seller@kartriq.test';
const PASSWORD = process.env.DEMO_PASSWORD || 'demo12345';

function req(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request({ method, headers, hostname: url.hostname, port: url.port, path: url.pathname + url.search }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { let b; try { b = JSON.parse(d); } catch { b = d; } resolve({ status: res.statusCode, body: b }); });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = require('../utils/db');
  const { encryptCredentials } = require('../utils/crypto');
  const { randomUUID } = require('crypto');
  require('../index');
  for (let i = 0; i < 180; i++) { try { if ((await req('GET', '/plans')).status === 200) break; } catch { /* booting */ } await sleep(1000); }

  // Seller account (re-use it if it already exists)
  let r = await req('POST', '/auth/onboard', { body: { email: EMAIL, password: PASSWORD, businessName: 'Demo Seller', ownerName: 'Demo Seller' } });
  if (r.status === 409) r = await req('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = r.body.token;
  const tenantId = r.body.tenant?.id || r.body.user?.tenantId;

  // Warehouse with a real address (Amazon needs a ship-from address)
  let wh = await db('warehouses').where({ tenantId, isVirtual: 0, isActive: 1 }).first();
  if (!wh) {
    const w = await req('POST', '/warehouses', { token, body: { name: 'Pune Warehouse', address: { line1: '5 Industrial Estate', city: 'Pune', state: 'MH', pincode: '411019', country: 'IN' }, phone: '9999999999' } });
    wh = await db('warehouses').where({ id: w.body.id }).first();
  }

  // Product with weight + size, and stock
  const TS = Date.now();
  const sku = `DEMO-WIDGET-${TS}`;
  const p = await req('POST', '/products', { token, body: { name: 'Demo Widget', sku, costPrice: 100, mrp: 499, sellingPrice: 399, weight: 0.75, dimensions: { length: 30, width: 20, height: 12 } } });
  const variantId = p.body.variants[0].id;
  await db('inventory_items').insert({ id: randomUUID(), tenantId, warehouseId: wh.id, productId: p.body.id, variantId, quantityOnHand: 100, quantityReserved: 0, quantityAvailable: 100, reorderPoint: 0, reorderQty: 0, updatedAt: new Date() });

  // Amazon channel with (fake-accepted) credentials, auto-book OFF so you can turn it ON yourself
  let ch = await db('channels').where({ tenantId, type: 'AMAZON' }).first();
  if (!ch) {
    const c = await req('POST', '/channels', { token, body: { name: 'Amazon India (demo)', type: 'AMAZON' } });
    ch = await db('channels').where({ id: c.body.id }).first();
  }
  await db('channels').where({ id: ch.id }).update({
    credentials: JSON.stringify(encryptCredentials({ refreshToken: fake.goodRefreshToken, sellerId: 'DEMO', region: 'IN', clientId: 'demo', clientSecret: 'demo' })),
    autoBookShipping: 0, isActive: 1,
  });

  // 1 FBA + 3 MFN orders, pulled in through the real sync path
  fake.orders = [
    amazonOrder(`DEMO-FBA-${TS}`, 'AFN', sku, 1, 399),
    amazonOrder(`DEMO-MFN-${TS}-A`, 'MFN', sku, 2, 399),
    amazonOrder(`DEMO-MFN-${TS}-B`, 'MFN', sku, 1, 399),
    amazonOrder(`DEMO-MFN-${TS}-C`, 'MFN', sku, 3, 399),
  ];
  const sync = await req('POST', `/channels/${ch.id}/sync/orders`, { token, body: {} });

  const line = '─'.repeat(64);
  console.log(`\n${line}\n  DEMO READY — fake Amazon, no real money\n${line}`);
  console.log(`  API:       ${BASE}   (orders imported: ${sync.body?.imported})`);
  console.log(`  Web app:   cd frontend && npm run dev   →  http://localhost:3000`);
  console.log(`  Login:     ${EMAIL}  /  ${PASSWORD}`);
  console.log(`\n  Try this:`);
  console.log(`   1. Channels → "Amazon India (demo)" → Channel settings → turn ON`);
  console.log(`      "Auto-book Amazon courier" → Save settings.`);
  console.log(`   2. Orders → open a DEMO-MFN order → set status to Confirmed.`);
  console.log(`      → it becomes SHIPPED, tracking appears, a "Shipping label" card shows.`);
  console.log(`   3. Click Print label (opens the fake label PDF) / Download / Cancel label.`);
  console.log(`   4. Open the DEMO-FBA order: Amazon ships it — no courier, no label.`);
  console.log(`   5. On any MFN order, click "Print packing slip" (items, qty, addresses, no prices).`);
  console.log(`      Bulk: Orders list → tick several orders → "Print packing slips" (one slip per page).`);
  console.log(`      Bulk labels: confirm 2+ MFN orders first, then tick them → "Print shipping labels" (one merged PDF).`);
  console.log(`   6. With the switch OFF, confirming an MFN order does NOT buy a label`);
  console.log(`      (use the manual "Buy shipping via Amazon" card instead).`);
  console.log(`${line}\n  Ctrl+C to stop.\n`);
})().catch((e) => { console.error('DEMO FAILED:', e); process.exit(1); });
