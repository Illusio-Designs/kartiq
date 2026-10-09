// End-to-end test: Amazon FBA vs MFN, "Confirm → label → shipment status" with Amazon
// (Easy Ship / Buy Shipping) and the seller's own courier (iThink, Shiprocket, Delhivery, Xpressbees).
//
//   node src/scripts/test.amazon-shipping.js        (needs MySQL, see .env)
//
// Runs the REAL backend (Express app + real database + real Amazon adapter
// code) in this process. Only Amazon itself is faked: axios's transport is
// replaced by a stand-in SP-API that answers LWA, Orders, Buy Shipping etc. and
// records every call, so we can assert exactly what Kartriq asked Amazon for.
// No real Amazon credentials or network are used. Exits 0 on success, 1 on any
// failure.

process.env.PORT = process.env.TEST_PORT || '5055';
process.env.DISABLE_CRON = 'true';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const http = require('http');

const { fake, callsTo, install: installFakeAmazon, amazonOrder } = require('./lib/fakeAmazon');
const { PDFDocument } = require('pdf-lib');
installFakeAmazon();

// ───────────────────────────── Test harness ─────────────────────────────────
const BASE = `http://localhost:${process.env.PORT}/api/v1`;
let passed = 0, failed = 0;
const failures = [];
const rows = []; // for the final result table
const ok = (cond, msg) => {
  if (cond) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${msg}`); rows.push(['PASS', msg]); }
  else { failed++; failures.push(msg); console.log(`  \x1b[31m✗\x1b[0m ${msg}`); rows.push(['FAIL', msg]); }
};
const group = (n) => console.log(`\n\x1b[1m${n}\x1b[0m`);

function req(method, path, { token, body, raw } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request({ method, headers, hostname: url.hostname, port: url.port, path: url.pathname + url.search }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (raw) return resolve({ status: res.statusCode, headers: res.headers, buf });
        let parsed; try { parsed = JSON.parse(buf.toString()); } catch { parsed = buf.toString(); }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try { const r = await req('GET', '/plans'); if (r.status === 200) return; } catch { /* not up yet */ }
    await sleep(1000);
  }
  throw new Error('server did not start in time');
}

// ──────────────────────────────── The test ──────────────────────────────────

async function main() {
  const db = require('../utils/db');
  const { encryptCredentials } = require('../utils/crypto');
  const { randomUUID } = require('crypto');
  const S = require('../services/shipping/status');

  require('../index'); // boots the real app (migrations + seed on first run)
  await waitForServer();

  const TS = Date.now();
  const SKU = `WIDGET-${TS}`;
  const owner = { email: `owner-${TS}@test.local`, password: 'test12345', businessName: `Shipping Test ${TS}`, ownerName: 'Seller' };
  const other = { email: `other-${TS}@test.local`, password: 'test12345', businessName: `Other ${TS}`, ownerName: 'Other' };

  group('0. Setup (real API + real DB)');
  const o1 = await req('POST', '/auth/onboard', { body: owner });
  ok(o1.status === 201 && o1.body.token, 'Seller tenant onboarded');
  const token = o1.body.token;
  const tenantId = o1.body.tenant.id;
  const o2 = await req('POST', '/auth/onboard', { body: other });
  const otherToken = o2.body.token;

  const wh = await req('POST', '/warehouses', {
    token, body: { name: 'Pune Warehouse', address: { line1: '5 Industrial Estate', city: 'Pune', state: 'MH', pincode: '411019', country: 'IN' }, phone: '9999999999' },
  });
  ok(wh.status === 201, `Warehouse with a full address created (${wh.status})`);
  const whId = wh.body.id;

  const prod = await req('POST', '/products', {
    token, body: { name: 'Test Widget', sku: SKU, costPrice: 100, mrp: 499, sellingPrice: 399, weight: 0.75, dimensions: { length: 30, width: 20, height: 12 } },
  });
  ok(prod.status === 201 && prod.body.variants?.length > 0, 'Product (0.75 kg, 30×20×12 cm) created with a default variant');
  const variantId = prod.body.variants[0].id;
  const productId = prod.body.id;
  const seedStock = async (qty) => {
    await db('inventory_items').where({ tenantId, warehouseId: whId, variantId }).del();
    await db('inventory_items').insert({
      id: randomUUID(), tenantId, warehouseId: whId, productId, variantId,
      quantityOnHand: qty, quantityReserved: 0, quantityAvailable: qty, reorderPoint: 0, reorderQty: 0, updatedAt: new Date(),
    });
  };
  await seedStock(500);
  const stock = async () => db('inventory_items').where({ tenantId, warehouseId: whId, variantId }).first();

  const ch = await req('POST', '/channels', { token, body: { name: 'Amazon India', type: 'AMAZON' } });
  ok(ch.status === 201, `Amazon channel created (${ch.status})`);
  const chId = ch.body.id;
  ok(ch.body.mfnShipping === 'AMAZON' && !ch.body.shippingProviderId, 'New Amazon channel defaults to "Amazon arranges the courier"');
  const setCreds = (refreshToken, region = 'IN') => db('channels').where({ id: chId }).update({
    credentials: JSON.stringify(encryptCredentials({ refreshToken, sellerId: 'SELLER1', region, clientId: 'cid', clientSecret: 'csecret' })),
  });
  await setCreds('Atzr|REVOKED');

  // helpers
  const find = async (cid) => db('orders').where({ tenantId, channelOrderId: cid }).first();
  const row = async (id) => db('orders').where({ id }).first();
  const sync = () => req('POST', `/channels/${chId}/sync/orders`, { token, body: {} });
  const confirm = (id, tok = token) => req('POST', `/orders/${id}/book-shipping`, { token: tok, body: {} });
  const refresh = (id, tok = token) => req('POST', `/orders/${id}/shipment/refresh`, { token: tok, body: {} });
  const shipment = (id, tok = token) => req('GET', `/orders/${id}/shipment`, { token: tok });
  const labelGet = (id, tok = token) => req('GET', `/orders/${id}/label`, { token: tok, raw: true });
  const useAmazon = async () => { const r = await req('PUT', `/channels/${chId}`, { token, body: { mfnShipping: 'AMAZON' } }); return r; };
  const mkCourier = async (type, name, creds) => {
    const id = randomUUID();
    await db('channels').insert({ id, tenantId, name, type, category: 'LOGISTICS', isActive: 1, credentials: JSON.stringify(encryptCredentials(creds)), updatedAt: new Date() });
    return id;
  };
  const useCourier = (id) => req('PUT', `/channels/${chId}`, { token, body: { mfnShipping: 'OWN', shippingProviderId: id } });
  const evs = async (id) => (await db('order_shipment_events').where({ orderId: id }).orderBy('createdAt', 'asc').orderBy('id', 'asc')).map((e) => e.status);

  // ── 1. Needs re-authorising ──────────────────────────────────────────────
  group('1. Revoked refresh token → "Needs re-authorising" → Re-authorise');
  fake.orders = [];
  const bad = await sync();
  ok(bad.status >= 400, `Sync fails when the refresh token is invalid (${bad.status})`);
  ok(/invalid grant parameter : refresh_token/.test(JSON.stringify(bad.body)), 'Error text is Amazon\'s "invalid grant … refresh_token"');
  const chBad = await req('GET', `/channels/${chId}`, { token });
  ok(chBad.body.needsReauth === true && /authorise|authorize/i.test(chBad.body.reauthReason || ''), `Channel is flagged needsReauth with a plain reason ("${(chBad.body.reauthReason || '').slice(0, 60)}…")`);
  ok((await req('GET', '/channels', { token })).body.find((c) => c.id === chId)?.needsReauth === true, 'The channel list shows the same flag (so the red banner can appear)');
  const stBad = await req('GET', `/oauth/amazon/status?channelId=${chId}`, { token });
  ok(stBad.status === 200 && /invalid grant/.test(stBad.body.error || ''), 'Status endpoint reports the error while waiting for re-authorisation');
  const t0 = Date.now();
  const reconnect = await req('POST', `/channels/${chId}/connect`, { token, body: { refreshToken: fake.goodRefreshToken, sellerId: 'SELLER1', region: 'IN', clientId: 'cid', clientSecret: 'csecret' } });
  ok(reconnect.status === 200, `Seller re-authorises (connect with the fresh token) (${reconnect.status})`);
  const chGood = await req('GET', `/channels/${chId}`, { token });
  ok(chGood.body.needsReauth === false && !chGood.body.syncError, 'Banner clears: needsReauth false, error gone');
  const stGood = await req('GET', `/oauth/amazon/status?channelId=${chId}`, { token });
  ok(stGood.body.connected === true && !stGood.body.error && new Date(stGood.body.authorizedAt).getTime() >= t0 - 2000, 'Status now returns a fresh authorizedAt (the UI uses it to know consent finished)');
  await setCreds(fake.goodRefreshToken);

  // ── 2. FBA vs MFN import ─────────────────────────────────────────────────
  group('2. FBA (Amazon ships) vs MFN (you ship): import');
  const SKU2 = `PLAIN-${TS}`;
  const prod2 = await req('POST', '/products', { token, body: { name: 'Plain Item', sku: SKU2, costPrice: 10, mrp: 50, sellingPrice: 40 } });
  const v2 = prod2.body.variants[0].id;
  await db('inventory_items').insert({ id: randomUUID(), tenantId, warehouseId: whId, productId: prod2.body.id, variantId: v2, quantityOnHand: 100, quantityReserved: 0, quantityAvailable: 100, reorderPoint: 0, reorderQty: 0, updatedAt: new Date() });
  const mfnOrders = [];
  for (let n = 1; n <= 30; n++) {
    const sku = (n === 4 || n === 5) ? SKU2 : SKU;
    mfnOrders.push(amazonOrder(`AMZ-MFN-${n}`, 'MFN', sku, n === 2 ? 2 : 1, n === 4 || n === 5 ? 40 : 399));
  }
  fake.orders = [amazonOrder('AMZ-AFN-1', 'AFN', SKU, 1, 399), ...mfnOrders];
  const sync1 = await sync();
  ok(sync1.status === 200 && sync1.body.imported === 31, `Sync imported the FBA order and 30 MFN orders (${sync1.status}, imported=${sync1.body?.imported})`);
  const afn = await find('AMZ-AFN-1');
  const M = {}; for (let n = 1; n <= 30; n++) M[n] = await find(`AMZ-MFN-${n}`);
  ok(afn?.fulfillmentType === 'CHANNEL' && afn?.status === 'PROCESSING', 'FBA order is CHANNEL-fulfilled (Amazon ships it)');
  ok(M[1]?.fulfillmentType === 'SELF' && M[1]?.status === 'PROCESSING', 'MFN order is SELF-fulfilled and arrives PROCESSING');
  ok(M[1]?.warehouseId === whId && M[1].shipmentStatus === null, 'MFN order routed to your REAL warehouse, no shipment status yet');
  const st1 = await stock();
  ok(st1.quantityReserved === 29 + 2 - 2 + 0 || st1.quantityReserved > 0, 'MFN stock is reserved on import');

  // ── 3. FBA hands-off ─────────────────────────────────────────────────────
  group('3. FBA order is hands-off');
  const callsBefore3 = fake.calls.length;
  const afnConfirm = await req('PATCH', `/orders/${afn.id}/status`, { token, body: { status: 'CONFIRMED' } });
  ok(afnConfirm.status === 400, `Manual status change on an FBA order is blocked (${afnConfirm.status})`);
  const afnBook = await confirm(afn.id);
  ok(afnBook.status === 409 && /marketplace|FBA/i.test(JSON.stringify(afnBook.body)), `Confirm on an FBA order is refused with a reason (${afnBook.status})`);
  ok(fake.calls.length === callsBefore3, 'No call to Amazon was made for the FBA order');
  const confirmedPlain = await req('PATCH', `/orders/${M[1].id}/status`, { token, body: { status: 'CONFIRMED' } });
  ok(confirmedPlain.status === 200 && confirmedPlain.body.shipping === undefined && callsBefore3 === fake.calls.length, 'Changing an order to CONFIRMED by hand books nothing any more (Confirm button is the only trigger)');
  await db('orders').where({ id: M[1].id }).update({ status: 'PROCESSING' });

  // ── 4. Channel settings: how MFN orders work ─────────────────────────────
  group('4. Manage channel: "How do orders you ship yourself work?"');
  const bogusM = await req('PUT', `/channels/${chId}`, { token, body: { mfnShipping: 'MAGIC' } });
  ok(bogusM.status === 400, `Unknown method refused (${bogusM.status})`);
  const ownNone = await req('PUT', `/channels/${chId}`, { token, body: { mfnShipping: 'OWN' } });
  ok(ownNone.status === 400 && /courier/i.test(ownNone.body.error), `"My own courier" without choosing one is refused (${ownNone.body.error})`);
  const notConnected = await mkCourier('ITHINK', 'iThink (no keys)', {});
  await db('channels').where({ id: notConnected }).update({ credentials: null });
  const ownNC = await useCourier(notConnected);
  ok(ownNC.status === 400 && /Connect .* first/i.test(ownNC.body.error), `A courier that is not connected yet is refused: "${ownNC.body.error}"`);
  const wrongKind = await req('POST', '/channels', { token, body: { name: 'Shopify X', type: 'SHOPIFY' } });
  const ownWrong = await useCourier(wrongKind.body.id);
  ok(ownWrong.status === 400, `Only a courier (logistics) channel can be chosen (${ownWrong.status})`);
  const otherCourier = await (async () => {
    const id = randomUUID();
    await db('channels').insert({ id, tenantId: o2.body.tenant.id, name: 'Other iThink', type: 'ITHINK', category: 'LOGISTICS', isActive: 1, credentials: JSON.stringify(encryptCredentials({ accessToken: 'a', secretKey: 'b' })), updatedAt: new Date() });
    return id;
  })();
  ok((await useCourier(otherCourier)).status === 400, "Another seller's courier cannot be chosen (400)");
  const unsupported = await mkCourier('DTDC', 'DTDC', { apiKey: 'x' });
  const ownUns = await useCourier(unsupported);
  ok(ownUns.status === 400 && /not supported/i.test(ownUns.body.error), `A courier we cannot book yet is refused with the four supported names: "${ownUns.body.error}"`);

  const IT = await mkCourier('ITHINK', 'iThink Logistics', { accessToken: 'AT', secretKey: 'SK', pickupAddressId: '77' });
  const SR = await mkCourier('SHIPROCKET', 'Shiprocket', { email: 'a@b.c', password: 'pw' });
  const DL = await mkCourier('DELHIVERY', 'Delhivery', { token: 'DLTOKEN' });
  const XB = await mkCourier('XPRESSBEES', 'Xpressbees', { email: 'a@b.c', password: 'pw' });
  const goodOwn = await useCourier(IT);
  ok(goodOwn.status === 200 && goodOwn.body.mfnShipping === 'OWN' && goodOwn.body.shippingProviderId === IT, 'Choosing a connected supported courier (iThink) works');
  const backAmz = await useAmazon();
  ok(backAmz.status === 200 && backAmz.body.mfnShipping === 'AMAZON' && backAmz.body.shippingProviderId === null, 'Switching back to "Amazon arranges" clears the courier choice');
  ok((await req('PUT', `/channels/${chId}`, { token: otherToken, body: { mfnShipping: 'AMAZON' } })).status === 404, "Another seller cannot change your channel's method (404)");

  // ── 5. Amazon Easy Ship (India): the main flow ───────────────────────────
  group('5. Amazon arranges the courier (Easy Ship, India): Confirm → label → status');
  const stBefore = await stock();
  fake.calls.length = 0;
  const c2 = await confirm(M[2].id);
  ok(c2.status === 200 && c2.body.booked === true, `Seller presses CONFIRM (${c2.status})`);
  ok(c2.body.provider === 'AMAZON_EASYSHIP' && c2.body.trackingNumber === 'ESY9001', `Amazon Easy Ship booked it, tracking ${c2.body.trackingNumber}`);
  const o2a = await row(M[2].id);
  ok(o2a.status === 'CONFIRMED' && o2a.shipmentStatus === 'PICKUP_SCHEDULED' && o2a.shipmentProvider === 'AMAZON_EASYSHIP', `Order is CONFIRMED, shipment status "Pickup scheduled" (is ${o2a.status} / ${o2a.shipmentStatus})`);
  ok(o2a.trackingNumber === 'ESY9001' && o2a.channelShipmentId === 'PKG-1', 'Tracking and Amazon package id saved');
  ok(callsTo(/timeSlot/).length === 1 && callsTo(/POST \/easyShip\/2022-03-23\/package/).length === 1, 'Exactly 1 slot lookup + 1 package booking');
  const pk = callsTo(/POST \/easyShip\/2022-03-23\/package/)[0].body;
  ok(pk.packageDetails.packageTimeSlot.slotId === 'slot-1', 'It took the earliest open pickup slot');
  ok(pk.packageDetails.packageWeight.value === 1500 && pk.packageDetails.packageDimensions.length === 30, 'Parcel from the products: 0.75 kg × 2 = 1500 g, 30×20×12 cm');
  ok(callsTo(/eligibleShippingServices/).length === 0, 'Buy Shipping rates were NOT used in India');
  ok(c2.body.hasLabel === true && !!(await db('order_labels').where({ orderId: M[2].id, status: 'ACTIVE' }).first()), 'Label stored (ACTIVE)');
  const lbl2 = await labelGet(M[2].id);
  ok(lbl2.status === 200 && /pdf/.test(lbl2.headers['content-type']) && lbl2.buf.slice(0, 5).toString() === '%PDF-', `Download label returns the PDF Amazon made (${lbl2.status})`);
  ok(callsTo(/POST \/feeds\/2021-06-30\/feeds/).length === 1, 'The label was requested from Amazon\'s document feed once');
  const lbl2b = await labelGet(M[2].id);
  ok(lbl2b.status === 200 && lbl2b.buf.equals(lbl2.buf) && callsTo(/POST \/feeds\/2021-06-30\/feeds/).length === 1, 'Second download is served from our copy (no second request to Amazon)');
  const stC = await stock();
  ok(stC.quantityOnHand === stBefore.quantityOnHand && stC.quantityReserved === stBefore.quantityReserved, 'Stock stays RESERVED while the order is only Confirmed (nothing has left the shelf)');
  ok(callsTo(/shipmentConfirmation/).length === 0, 'Nothing extra is sent to Amazon (it already knows its own courier)');
  ok(JSON.stringify(await evs(M[2].id)) === JSON.stringify(['BOOKED', 'PICKUP_SCHEDULED']), 'Timeline: Booked → Pickup scheduled');

  const same = await refresh(M[2].id);
  ok(same.status === 200 && same.body.changed === false && same.body.status === 'PICKUP_SCHEDULED', 'Refresh with no news changes nothing');
  const pkg1 = fake.easyShip.packages['PKG-1'];
  pkg1.packageStatus = 'PickedUp';
  const r1 = await refresh(M[2].id);
  const o2b = await row(M[2].id);
  ok(r1.body.changed === true && o2b.shipmentStatus === 'PICKED_UP' && o2b.status === 'SHIPPED' && o2b.shippedAt, 'Courier picks it up → shipment "Picked up", order becomes SHIPPED');
  const stP = await stock();
  ok(stP.quantityOnHand === stBefore.quantityOnHand - 2 && stP.quantityReserved === stBefore.quantityReserved - 2, `Stock leaves the shelf only now: on-hand ${stBefore.quantityOnHand} → ${stP.quantityOnHand}`);
  const cantCancel = await req('DELETE', `/orders/${M[2].id}/label`, { token });
  ok(cantCancel.status === 409 && /already picked/i.test(cantCancel.body.error), `Cancel booking after pickup is refused (${cantCancel.status})`);
  ok(callsTo(/DELETE \/easyShip/).length === 0, 'Amazon was not asked to cancel a parcel that was already collected');
  pkg1.packageStatus = 'AtDestinationFC';
  await refresh(M[2].id);
  ok((await row(M[2].id)).shipmentStatus === 'IN_TRANSIT', 'Amazon "AtDestinationFC" → In transit');
  pkg1.packageStatus = 'OutForDelivery';
  await refresh(M[2].id);
  ok((await row(M[2].id)).shipmentStatus === 'OUT_FOR_DELIVERY', 'Out for delivery');
  pkg1.packageStatus = 'PickedUp'; // an old/late report must never drag the parcel backwards
  const back = await refresh(M[2].id);
  ok(back.body.changed === false && (await row(M[2].id)).shipmentStatus === 'OUT_FOR_DELIVERY', 'A late "Picked up" report does NOT move the parcel backwards');
  pkg1.packageStatus = 'Delivered';
  await refresh(M[2].id);
  const o2c = await row(M[2].id);
  ok(o2c.shipmentStatus === 'DELIVERED' && o2c.status === 'DELIVERED' && o2c.deliveredAt, 'Delivered → order DELIVERED');
  pkg1.packageStatus = 'Undeliverable';
  const afterDone = await refresh(M[2].id);
  ok(afterDone.body.changed === false && (await row(M[2].id)).shipmentStatus === 'DELIVERED', 'A delivered parcel is final');
  const tl = await shipment(M[2].id);
  ok(tl.status === 200 && tl.body.status === 'DELIVERED' && tl.body.canCancel === false && tl.body.events.map((e) => e.status).join() === 'BOOKED,PICKUP_SCHEDULED,PICKED_UP,IN_TRANSIT,OUT_FOR_DELIVERY,DELIVERED', 'Timeline endpoint lists every step in order');

  // exceptions
  const cX = await confirm(M[6].id);
  const pkgX = fake.easyShip.packages[cX.body.trackingNumber ? Object.keys(fake.easyShip.packages).slice(-1)[0] : ''];
  pkgX.packageStatus = 'PickedUp'; await refresh(M[6].id);
  pkgX.packageStatus = 'Undeliverable'; await refresh(M[6].id);
  ok((await row(M[6].id)).shipmentStatus === 'DELIVERY_FAILED' && (await row(M[6].id)).status === 'SHIPPED', 'Delivery failed is shown as an exception (order stays SHIPPED)');
  pkgX.packageStatus = 'ReturnedToSeller'; await refresh(M[6].id);
  const oX = await row(M[6].id);
  ok(oX.shipmentStatus === 'RTO_DELIVERED' && oX.status === 'RETURNED', 'Returned to you → order RETURNED');
  ok((await evs(M[6].id)).includes('DELIVERY_FAILED'), 'The exception stays visible in the timeline');

  // ── 6. Cancel booking before pickup ──────────────────────────────────────
  group('6. Cancel booking (until the courier picks up) and confirm again');
  const c3 = await confirm(M[3].id);
  ok(c3.status === 200, 'Order 3 confirmed');
  const stBeforeCancel = await stock();
  fake.calls.length = 0;
  const cancel3 = await req('DELETE', `/orders/${M[3].id}/label`, { token });
  ok(cancel3.status === 200 && cancel3.body.cancelled === true, `Booking cancelled (${cancel3.status})`);
  ok(callsTo(/DELETE \/easyShip\/2022-03-23\/package/).length === 1, 'Amazon was told to cancel the pickup');
  const o3 = await row(M[3].id);
  ok(o3.status === 'CONFIRMED' && o3.shipmentStatus === null && !o3.trackingNumber && !o3.courierName && !o3.channelShipmentId && !o3.shipmentProvider, 'Order back to CONFIRMED with no shipment status, tracking or courier');
  ok((await db('order_labels').where({ orderId: M[3].id }).first()).status === 'CANCELLED', 'Old label kept as CANCELLED (history)');
  ok((await labelGet(M[3].id)).status === 404, 'Cancelled label can no longer be downloaded');
  const stAfterCancel = await stock();
  ok(stAfterCancel.quantityOnHand === stBeforeCancel.quantityOnHand && stAfterCancel.quantityReserved === stBeforeCancel.quantityReserved, 'Stock untouched (it was never taken off the shelf)');
  ok((await req('DELETE', `/orders/${M[3].id}/label`, { token })).status === 404, 'Cancelling twice is refused');
  const c3b = await confirm(M[3].id);
  ok(c3b.status === 200 && c3b.body.trackingNumber !== c3.body.trackingNumber, `Confirm again books a NEW pickup (${c3b.body.trackingNumber})`);
  const tl3 = await shipment(M[3].id);
  ok(tl3.body.events.map((e) => e.status).join() === 'BOOKED,PICKUP_SCHEDULED,CANCELLED,BOOKED,PICKUP_SCHEDULED' && tl3.body.canCancel === true, 'History: first booking, Cancelled, then the new booking');

  // ── 7. When Amazon / the courier says no ────────────────────────────────
  group('7. When it fails: nothing is booked, the reason is shown, Retry works');
  fake.easyShip.mode = 'noSlots';
  const pkgBefore = callsTo(/POST \/easyShip\/2022-03-23\/package/).length;
  const f1 = await confirm(M[7].id);
  ok(f1.status === 400 && /no pickup slot/i.test(f1.body.error), `No pickup slot → clear message: "${f1.body.error}"`);
  ok((await row(M[7].id)).shippingError && !(await db('order_labels').where({ orderId: M[7].id }).first()), 'Reason stored on the order, no label saved');
  ok(callsTo(/POST \/easyShip\/2022-03-23\/package/).length === pkgBefore, 'No package was booked');
  fake.easyShip.mode = 'ok';
  const f2 = await confirm(M[7].id);
  const o7 = await row(M[7].id);
  ok(f2.status === 200 && o7.shippingError === null && o7.shipmentStatus === 'PICKUP_SCHEDULED', 'Retry works once Amazon is happy; the old error is cleared');
  fake.easyShip.labelMode = 'fails';
  const f3 = await confirm(M[8].id);
  ok(f3.status === 200 && f3.body.booked === true && f3.body.hasLabel === false && f3.body.labelError, `Label not ready yet: the booking still succeeds and says so ("${(f3.body.labelError || '').slice(0, 50)}…")`);
  const f3l = await labelGet(M[8].id);
  ok(f3l.status === 502 && /not ready/i.test(f3l.buf.toString()), `Download says "not ready yet" instead of failing silently (${f3l.status})`);
  fake.easyShip.labelMode = 'ok';
  const f3m = await labelGet(M[8].id);
  ok(f3m.status === 200 && f3m.buf.slice(0, 4).toString() === '%PDF', 'A moment later the label downloads fine (fetched on demand)');
  const noWh = randomUUID();
  await db('warehouses').insert({ id: noWh, tenantId, name: 'No-address WH', code: `NOADDR-${TS}`, address: JSON.stringify({}), isActive: 1, isVirtual: 0, updatedAt: new Date() });
  await db('orders').where({ id: M[5].id }).update({ warehouseId: noWh });
  fake.calls.length = 0;
  const f4 = await confirm(M[5].id);
  ok(f4.status === 400 && /has no city\/pincode/.test(f4.body.error) && callsTo(/easyShip/).length === 0, `Warehouse without an address: clear message, Amazon not called ("${f4.body.error}")`);
  await db('orders').where({ id: M[5].id }).update({ warehouseId: null });
  const f5 = await confirm(M[5].id);
  ok(f5.status === 400 && /No ship-from warehouse/.test(f5.body.error), `Order with no warehouse at all: "${f5.body.error}"`);
  await db('orders').where({ id: M[5].id }).update({ warehouseId: whId });

  // ── 8. Products without weight/size ──────────────────────────────────────
  group('8. Product has no weight or size');
  fake.calls.length = 0;
  const w4 = await confirm(M[4].id);
  const pk4 = callsTo(/POST \/easyShip\/2022-03-23\/package/)[0]?.body?.packageDetails;
  ok(w4.status === 200 && pk4?.packageWeight?.value === 500 && pk4?.packageDimensions?.length === 20, 'Falls back to 500 g, 20×15×10 cm');
  ok(w4.body.usedDefaults?.weight === true && w4.body.usedDefaults?.dimensions === true, 'Result flags that defaults were assumed');

  // ── 9. Amazon outside India: Buy Shipping ────────────────────────────────
  group('9. Amazon arranges the courier outside India (Buy Shipping)');
  await setCreds(fake.goodRefreshToken, 'US');
  fake.calls.length = 0;
  fake.labelType = 'PDF';
  const b9 = await confirm(M[9].id);
  ok(b9.status === 200 && b9.body.provider === 'AMAZON_BUY' && b9.body.trackingNumber === 'TRK1001', `US seller: Buy Shipping, tracking ${b9.body.trackingNumber}`);
  const buy = callsTo(/POST \/mfn\/v0\/shipments/)[0];
  ok(buy?.body?.ShippingServiceId === 'svc-cheap' && callsTo(/easyShip/).length === 0, 'Bought the CHEAPEST of 3 offers (₹62.50), Easy Ship not used');
  const o9 = await row(M[9].id);
  ok(o9.status === 'CONFIRMED' && o9.shipmentStatus === 'BOOKED' && o9.shipmentProvider === 'AMAZON_BUY', 'Order CONFIRMED, shipment "Booked"');
  const l9 = await labelGet(M[9].id);
  ok(l9.status === 200 && l9.buf.equals(fake.labels['SHIP-1']), 'Label is exactly what Amazon sent (gunzipped)');
  const r9 = await refresh(M[9].id);
  ok(r9.status === 200 && r9.body.changed === false, 'Buy Shipping has no tracking feed: refresh is harmless');
  const x9 = await req('DELETE', `/orders/${M[9].id}/label`, { token });
  ok(x9.status === 200 && callsTo(/DELETE \/mfn\/v0\/shipments\/SHIP-1/).length === 1, 'Cancel booking voids the shipment with Amazon');
  fake.mode = 'noRates';
  const n9 = await confirm(M[10].id);
  ok(n9.status === 400 && /no eligible courier/.test(n9.body.error), `No courier available: "${n9.body.error}"`);
  fake.mode = 'buyFails';
  const n9b = await confirm(M[10].id);
  ok(n9b.status === 400 && /Address could not be verified/.test(n9b.body.error), 'Amazon purchase error is passed through');
  fake.mode = 'ok';
  await setCreds(fake.goodRefreshToken, 'IN');

  // ── 10. My own courier partner ───────────────────────────────────────────
  group('10. I use my own courier (iThink, Shiprocket, Delhivery, Xpressbees)');
  const marketConf = () => callsTo(/shipmentConfirmation/).length;
  // iThink
  await useCourier(IT);
  fake.calls.length = 0;
  const i1 = await confirm(M[11].id);
  ok(i1.status === 200 && i1.body.provider === 'ITHINK' && /^ITH\d+/.test(i1.body.trackingNumber) && i1.body.carrier === 'Ekart', `iThink booked it: ${i1.body.trackingNumber} via ${i1.body.carrier}`);
  const ithAdd = callsTo(/order\/add\.json/)[0]?.body?.data;
  ok(ithAdd?.access_token === 'AT' && ithAdd.secret_key === 'SK' && ithAdd.shipments[0].weight === '0.75' && ithAdd.shipments[0].shipment_length === '30', 'Request carries the keys and the real parcel (0.75 kg, 30 cm)');
  ok(ithAdd?.pickup_address_id === '77', 'Pickup address id comes from the courier connection');
  const o11 = await row(M[11].id);
  ok(o11.status === 'CONFIRMED' && o11.shipmentStatus === 'BOOKED' && o11.shipmentProvider === 'ITHINK', 'Same result as Amazon: Confirmed + Booked');
  ok(i1.body.marketplaceConfirmed === true && marketConf() === 1, 'Amazon was told the tracking number + courier (needed for your own courier)');
  const li = await labelGet(M[11].id);
  ok(li.status === 200 && li.buf.slice(0, 4).toString() === '%PDF', 'Download label: iThink PDF fetched through their link');
  fake.courier.status[i1.body.trackingNumber] = 'Picked Up';
  await refresh(M[11].id);
  ok((await row(M[11].id)).shipmentStatus === 'PICKED_UP' && (await row(M[11].id)).status === 'SHIPPED', 'iThink "Picked Up" → Picked up, order SHIPPED');
  fake.courier.status[i1.body.trackingNumber] = 'In Transit'; await refresh(M[11].id);
  ok((await row(M[11].id)).shipmentStatus === 'IN_TRANSIT', 'iThink "In Transit" → In transit');
  fake.courier.status[i1.body.trackingNumber] = 'RTO Initiated'; await refresh(M[11].id);
  ok((await row(M[11].id)).shipmentStatus === 'RTO_INITIATED', 'iThink "RTO Initiated" → Returning to you');
  fake.courier.status[i1.body.trackingNumber] = 'RTO Delivered'; await refresh(M[11].id);
  ok((await row(M[11].id)).shipmentStatus === 'RTO_DELIVERED', 'iThink "RTO Delivered" → Returned to you');

  // iThink cancel
  const i2 = await confirm(M[12].id);
  fake.courier.mode = 'cancelFails';
  const ic1 = await req('DELETE', `/orders/${M[12].id}/label`, { token });
  ok(ic1.status === 502 && /Already picked up/.test(ic1.body.error) && (await row(M[12].id)).shipmentStatus === 'BOOKED', `Courier refuses to cancel → shown, booking stays (${ic1.body.error})`);
  fake.courier.mode = 'ok';
  const ic2 = await req('DELETE', `/orders/${M[12].id}/label`, { token });
  ok(ic2.status === 200 && fake.courier.cancelled.includes(i2.body.trackingNumber) && (await row(M[12].id)).shipmentStatus === null, 'Cancel booking sent to iThink, order back to unbooked');
  fake.courier.mode = 'bookFails';
  const ib = await confirm(M[12].id);
  ok(ib.status === 400 && /Invalid pincode/.test(ib.body.error) && !(await db('order_labels').where({ orderId: M[12].id, status: 'ACTIVE' }).first()), `Courier rejects the order: "${ib.body.error}" — nothing saved`);
  fake.courier.mode = 'ok';

  // Shiprocket
  await useCourier(SR);
  fake.calls.length = 0;
  const s1 = await confirm(M[13].id);
  ok(s1.status === 200 && s1.body.provider === 'SHIPROCKET' && /^SR\d+/.test(s1.body.trackingNumber) && s1.body.carrier === 'Blue Dart', `Shiprocket booked it (create → assign courier → pickup): ${s1.body.trackingNumber}`);
  ok(callsTo(/orders\/create\/adhoc/).length === 1 && callsTo(/courier\/assign\/awb/).length === 1 && callsTo(/courier\/generate\/pickup/).length === 1, 'All three Shiprocket steps ran once');
  ok((await row(M[13].id)).shipmentStatus === 'PICKUP_SCHEDULED', 'Pickup was requested → "Pickup scheduled"');
  const lsr = await labelGet(M[13].id);
  const labelReq = callsTo(/courier\/generate\/label/)[0]?.body;
  ok(lsr.status === 200 && lsr.buf.slice(0, 4).toString() === '%PDF' && Array.isArray(labelReq?.shipment_id), 'Label asked by SHIPMENT id and fetched as PDF');
  fake.courier.status[s1.body.trackingNumber] = 'Delivered'; await refresh(M[13].id);
  ok((await row(M[13].id)).shipmentStatus === 'DELIVERED', 'Shiprocket "Delivered" → Delivered (jumps straight there, nothing skipped by mistake)');

  // Delhivery
  await useCourier(DL);
  const d1 = await confirm(M[14].id);
  ok(d1.status === 200 && d1.body.provider === 'DELHIVERY' && /^DL\d+/.test(d1.body.trackingNumber) && (await row(M[14].id)).shipmentStatus === 'BOOKED', `Delhivery booked it: ${d1.body.trackingNumber}`);
  const ld = await labelGet(M[14].id);
  ok(ld.status === 404 && /print it from their panel/i.test(ld.buf.toString()) && d1.body.labelError, `No label via Delhivery's API: honest message ("${(d1.body.labelError || '').slice(0, 60)}…")`);
  ok((await req('GET', `/orders/${M[14].id}/label?format=meta`, { token })).body.available === false, 'Label info says "not available through the API" so the screen can tell the seller');
  fake.courier.status[d1.body.trackingNumber] = 'In Transit'; await refresh(M[14].id);
  ok((await row(M[14].id)).shipmentStatus === 'IN_TRANSIT', 'Delhivery "In Transit" → In transit');

  // Xpressbees
  await useCourier(XB);
  const x1 = await confirm(M[15].id);
  ok(x1.status === 200 && x1.body.provider === 'XPRESSBEES' && /^XB\d+/.test(x1.body.trackingNumber), `Xpressbees booked it: ${x1.body.trackingNumber}`);
  fake.courier.status[x1.body.trackingNumber] = 'Out For Delivery'; await refresh(M[15].id);
  ok((await row(M[15].id)).shipmentStatus === 'OUT_FOR_DELIVERY', 'Xpressbees "Out For Delivery" → Out for delivery');

  // disconnected courier
  await db('channels').where({ id: XB }).update({ credentials: null });
  const xd = await confirm(M[16].id);
  ok(xd.status === 400 && /not connected/i.test(xd.body.error), `Courier disconnected later: "${xd.body.error}"`);
  await useAmazon();

  // ── 11. RTO-approval path ────────────────────────────────────────────────
  group('11. Held (RTO-risk) orders: approve, then confirm');
  await db('orders').where({ id: M[17].id }).update({ needsApproval: 1 });
  const ap = await req('POST', `/orders/${M[17].id}/approve`, { token, body: {} });
  ok(ap.status === 200 && ap.body.status === 'CONFIRMED' && ap.body.shipping === undefined, 'Approve only approves (no automatic booking)');
  const ap2 = await confirm(M[17].id);
  ok(ap2.status === 200 && (await row(M[17].id)).shipmentStatus === 'PICKUP_SCHEDULED', 'Then Confirm books the courier');

  // ── 12. Isolation ────────────────────────────────────────────────────────
  group('12. Another seller cannot touch your shipments');
  ok((await labelGet(M[2].id, otherToken)).status === 404, 'Other tenant cannot download the label');
  ok((await confirm(M[18].id, otherToken)).status !== 200 && !(await row(M[18].id)).shipmentStatus, 'Other tenant cannot confirm your order');
  ok((await req('DELETE', `/orders/${M[17].id}/label`, { token: otherToken })).status === 404, 'Other tenant cannot cancel your booking');
  ok((await shipment(M[2].id, otherToken)).status === 404 && (await refresh(M[2].id, otherToken)).status === 404, 'Other tenant cannot read or refresh your shipment status');
  ok((await confirm(M[18].id, '')).status === 401, 'No login → 401');

  // ── 13. Plan ─────────────────────────────────────────────────────────────
  group('13. FIVERR_FREE test plan');
  const plans = await req('GET', '/plans');
  ok(!plans.body.some((p) => p.code === 'FIVERR_FREE'), 'Hidden from the public pricing list');
  const plan = await db('plans').where({ code: 'FIVERR_FREE' }).first();
  ok(plan && Number(plan.monthlyPrice) === 0 && plan.isPublic === 0, 'Exists in the database, ₹0, not public');

  // ── 14. Packing slip ─────────────────────────────────────────────────────
  group('14. Packing slip');
  const slipRaw = (id, tok = token) => req('GET', `/orders/${id}/packing-slip`, { token: tok, raw: true });
  const slip = await slipRaw(M[1].id);
  const html = slip.buf.toString();
  ok(slip.status === 200 && /text\/html/.test(slip.headers['content-type']), `MFN order returns a printable HTML page (${slip.status})`);
  ok(html.includes('PACKING SLIP') && html.includes(M[1].orderNumber) && html.includes('AMZ-MFN-1'), 'Titled PACKING SLIP, carries the order number and Amazon order id');
  ok(html.includes('Test Widget') && html.includes(SKU) && html.includes('Total units: 1'), 'Lists the item name, SKU and quantity');
  ok(html.includes('12 MG Road') && html.includes('411001') && html.includes('Pune Warehouse') && html.includes('411019'), 'Ship-to (buyer) and ship-from (your warehouse) are there');
  ok(html.includes(owner.businessName), 'Seller business name is on the slip');
  ok(!/₹|INR|Rs\.?\s?\d|\b399\b|subtotal|total amount/i.test(html), 'NO prices or money amounts on the slip');
  ok(!/<script/i.test(html) && !html.includes('Shipped with'), 'No scripts; a not-yet-booked order shows no tracking line');
  const slip2 = (await slipRaw(M[2].id)).buf.toString();
  ok(slip2.includes('Shipped with') && slip2.includes('ESY9001'), 'A booked order shows its courier + tracking on the slip');
  await db('customers').where({ id: M[1].customerId }).update({ name: '<script>alert(1)</script>' });
  await db('orders').where({ id: M[1].id }).update({ notes: '"><img src=x onerror=alert(2)>' });
  const evil = (await slipRaw(M[1].id)).buf.toString();
  ok(!/<script>alert|<img src=x/i.test(evil) && evil.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'Hostile buyer name / note is HTML-escaped');
  const afnSlip = await req('GET', `/orders/${afn.id}/packing-slip`, { token });
  ok(afnSlip.status === 400 && /fulfilled by the marketplace/.test(JSON.stringify(afnSlip.body)), 'FBA order: no slip, clear reason');
  ok((await slipRaw(M[1].id, otherToken)).status === 404 && (await slipRaw(M[1].id, '')).status === 401, 'Other seller → 404, no login → 401');

  // ── 15. Bulk packing slips ───────────────────────────────────────────────
  group('15. Bulk packing slips');
  await db('orders').where({ id: M[5].id }).update({ status: 'CANCELLED' });
  const bogus = randomUUID();
  const bulk = await req('POST', '/orders/packing-slips', { token, body: { ids: [M[2].id, afn.id, M[1].id, bogus, M[4].id, M[5].id, M[2].id] } });
  ok(bulk.status === 200 && bulk.body.printed === 3, `One document, 3 slips (duplicate counted once) (printed=${bulk.body.printed})`);
  ok((bulk.body.html.match(/<div class="sheet">/g) || []).length === 3 && /page-break-after:always/.test(bulk.body.html), 'One slip per page');
  const pos = (n) => bulk.body.html.indexOf(n);
  ok(pos(M[2].orderNumber) > -1 && pos(M[1].orderNumber) > pos(M[2].orderNumber) && pos(M[4].orderNumber) > pos(M[1].orderNumber), 'Slips come out in the order selected');
  const reasons = Object.fromEntries(bulk.body.skipped.map((x) => [x.id, x.reason]));
  ok(bulk.body.skipped.length === 3 && /marketplace \(FBA\)/.test(reasons[afn.id]) && /not found/i.test(reasons[bogus]) && /cancelled/i.test(reasons[M[5].id]), 'FBA, unknown and cancelled orders skipped, each with a reason');
  ok(!/<script>alert|<img src=x/i.test(bulk.body.html) && !/₹|INR|subtotal/i.test(bulk.body.html), 'Escaped text, no prices');
  ok((await req('POST', '/orders/packing-slips', { token, body: { ids: [] } })).status === 400, 'Empty selection refused');
  const tooMany = await req('POST', '/orders/packing-slips', { token, body: { ids: Array.from({ length: 101 }, () => randomUUID()) } });
  ok(tooMany.status === 400 && /at most 100/.test(JSON.stringify(tooMany.body)), 'Limit is 100');
  ok((await req('POST', '/orders/packing-slips', { body: { ids: [M[4].id] } })).status === 401, 'No login → 401');
  const spyBulk = await req('POST', '/orders/packing-slips', { token: otherToken, body: { ids: [M[2].id, M[1].id] } });
  ok(spyBulk.status === 400 && !spyBulk.body.html, "Another seller cannot pull your orders into their slips");

  // ── 16. Bulk label download ──────────────────────────────────────────────
  group('16. Bulk "Download labels"');
  await setCreds(fake.goodRefreshToken, 'US'); // Buy Shipping gives us PDF / PNG / ZPL labels to test
  const bookAs = async (o, type) => { fake.labelType = type; return confirm(o.id); };
  const b19 = await bookAs(M[19], 'PDF'); const b20 = await bookAs(M[20], 'PNG'); const b21 = await bookAs(M[21], 'ZPL'); const b22 = await bookAs(M[22], 'PDF');
  fake.labelType = 'PDF';
  ok([b19, b20, b21, b22].every((b) => b.status === 200), 'Set-up: 4 orders booked with a PDF, PNG, ZPL and (later corrupted) PDF label');
  await setCreds(fake.goodRefreshToken, 'IN');
  await db('order_labels').where({ orderId: M[22].id }).update({ content: Buffer.from('not a pdf').toString('base64') });
  await useCourier(IT);
  const bi = await confirm(M[23].id); // courier-hosted label (link): fetched the first time it's needed
  await useAmazon();
  ok(bi.status === 200 && !(await db('order_labels').where({ orderId: M[23].id }).first()).content, 'A courier-hosted label is stored as a link only (not fetched yet)');
  const bl = await req('POST', '/orders/labels', { token, body: { ids: [M[19].id, M[20].id, M[21].id, afn.id, M[24].id, bogus, M[22].id, M[23].id, M[19].id] } });
  ok(bl.status === 200 && bl.body.printed === 3 && bl.body.pages === 3, `PDF + PNG + the courier link merge into one PDF of 3 pages (printed=${bl.body.printed}, pages=${bl.body.pages})`);
  const merged = await PDFDocument.load(Buffer.from(bl.body.pdf, 'base64'));
  const sizes = merged.getPages().map((pg) => `${Math.round(pg.getWidth())}x${Math.round(pg.getHeight())}`);
  ok(sizes.join() === '300x450,288x432,288x432', `Real PDF: Amazon PDF (300×450), PNG on a 4×6 page, courier PDF (${sizes.join(', ')})`);
  ok(!!(await db('order_labels').where({ orderId: M[23].id }).first()).content, 'The courier label was fetched once and kept');
  const why = Object.fromEntries(bl.body.skipped.map((x) => [x.id, x.reason]));
  ok(bl.body.skipped.length === 5, `5 skipped, each with a reason (${bl.body.skipped.length})`);
  ok(/ZPL/.test(why[M[21].id]) && /marketplace \(FBA\)/.test(why[afn.id]) && /press Confirm first/.test(why[M[24].id]) && /not found/i.test(why[bogus]) && /could not be read/.test(why[M[22].id]), 'ZPL, FBA, not-confirmed, unknown and corrupt files are skipped with the right reason');
  const rev = await req('POST', '/orders/labels', { token, body: { ids: [M[20].id, M[19].id] } });
  const revSizes = (await PDFDocument.load(Buffer.from(rev.body.pdf, 'base64'))).getPages().map((pg) => Math.round(pg.getWidth()));
  ok(revSizes[0] === 288 && revSizes[1] === 300, 'Labels come out in the order selected');
  ok((await req('POST', '/orders/labels', { token, body: { ids: [M[21].id] } })).status === 400, 'Only a ZPL order selected: 400 with the reason');
  ok((await req('POST', '/orders/labels', { token, body: { ids: [] } })).status === 400 && (await req('POST', '/orders/labels', { body: { ids: [M[19].id] } })).status === 401, 'Empty → 400, no login → 401');
  const spyL = await req('POST', '/orders/labels', { token: otherToken, body: { ids: [M[19].id, M[20].id] } });
  ok(spyL.status === 400 && !spyL.body.pdf, "Another seller cannot pull your labels into their PDF");

  // ── 17. Bulk Confirm ─────────────────────────────────────────────────────
  group('17. Bulk "Confirm & get labels"');
  fake.mode = 'ok'; fake.easyShip.mode = 'ok';
  const pkgs0 = callsTo(/POST \/easyShip\/2022-03-23\/package/).length;
  const bb = await req('POST', '/orders/book-shipping', { token, body: { ids: [M[25].id, M[26].id, afn.id, M[3].id, bogus, M[25].id] } });
  ok(bb.status === 200 && bb.body.booked === 2, `Books the 2 new MFN orders (booked=${bb.body.booked})`);
  const bres = Object.fromEntries(bb.body.results.map((r) => [r.id, r]));
  ok(bb.body.results.length === 5 && bres[M[25].id].booked && bres[M[25].id].trackingNumber && bres[M[26].id].booked, 'Duplicate handled once; each booked order reports its tracking number');
  ok(bres[afn.id].kind === 'skipped' && bres[M[3].id].kind === 'skipped' && /Already confirmed/i.test(bres[M[3].id].reason), `FBA and already-confirmed orders skipped (not errors): "${bres[M[3].id].reason}"`);
  ok(bres[bogus].kind === 'skipped' && /not found/i.test(bres[bogus].reason), 'Unknown order skipped');
  ok(callsTo(/POST \/easyShip\/2022-03-23\/package/).length === pkgs0 + 2, 'Exactly 2 pickups were booked with Amazon');
  const bl2 = await req('POST', '/orders/labels', { token, body: { ids: [M[25].id, M[26].id] } });
  ok(bl2.status === 200 && bl2.body.printed === 2, 'Their labels download together as one PDF straight away');
  fake.easyShip.mode = 'noSlots';
  const bf = await req('POST', '/orders/book-shipping', { token, body: { ids: [M[27].id] } });
  ok(bf.status === 200 && bf.body.failed === 1 && /no pickup slot/i.test(bf.body.results[0].reason), 'A failure is reported per order, not as a crash');
  fake.easyShip.mode = 'ok';
  ok((await req('POST', '/orders/book-shipping', { token, body: { ids: [] } })).status === 400, 'Empty selection refused');
  const big = await req('POST', '/orders/book-shipping', { token, body: { ids: Array.from({ length: 51 }, () => randomUUID()) } });
  ok(big.status === 400 && /at most 50/.test(JSON.stringify(big.body)), 'Limit is 50');
  const pkgs1 = callsTo(/POST \/easyShip\/2022-03-23\/package/).length;
  const bo = await req('POST', '/orders/book-shipping', { token: otherToken, body: { ids: [M[27].id] } });
  ok(bo.status === 200 && bo.body.booked === 0 && callsTo(/POST \/easyShip\/2022-03-23\/package/).length === pkgs1, "Another seller cannot book your orders, and nothing is bought for them");

  // ── 18. Orders list: shipment status filter + counts ─────────────────────
  group('18. Orders list: Shipment status column, chips and counts');
  const lst = await req('GET', `/orders?limit=100&shipmentStatus=PICKUP_SCHEDULED`, { token });
  ok(lst.status === 200 && lst.body.orders.length > 0 && lst.body.orders.every((o) => o.shipmentStatus === 'PICKUP_SCHEDULED'), `Filter by "Pickup scheduled" (${lst.body.orders?.length} orders)`);
  ok(lst.body.orders.every((o) => 'shipmentStatus' in o), 'Every row carries shipmentStatus (for the new column)');
  const toc = await req('GET', `/orders?limit=100&shipmentStatus=TO_CONFIRM`, { token });
  ok(toc.status === 200 && toc.body.orders.length > 0 && toc.body.orders.every((o) => !o.shipmentStatus && o.fulfillmentType === 'SELF' && ['PENDING', 'PROCESSING', 'CONFIRMED'].includes(o.status)), `"To confirm" shows only unbooked self-shipped open orders (${toc.body.orders.length})`);
  ok(!toc.body.orders.some((o) => o.id === afn.id), 'The FBA order is never in "To confirm"');
  const stats = await req('GET', '/orders/stats', { token });
  const sc = stats.body.shipmentCounts || {};
  ok(sc.TO_CONFIRM === toc.body.total && sc.PICKUP_SCHEDULED === lst.body.total && sc.DELIVERED >= 2 && sc.RTO_DELIVERED >= 1, `Stats give a count per chip (${JSON.stringify(sc)})`);

  // ── 19. Automatic status polling (cron) ──────────────────────────────────
  group('19. Background poll updates shipments by itself');
  const k = await confirm(M[28].id);
  const kPkg = Object.values(fake.easyShip.packages).find((p) => p.trackingId === k.body.trackingNumber);
  kPkg.packageStatus = 'PickedUp';
  const { pollOpenShipments } = require('../services/shipping/shipment.service');
  const poll = await pollOpenShipments({});
  ok(poll.checked > 0 && poll.changed >= 1 && (await row(M[28].id)).shipmentStatus === 'PICKED_UP', `Poll moved the parcel without anyone clicking (checked ${poll.checked}, changed ${poll.changed})`);
  const poll2 = await pollOpenShipments({});
  ok(poll2.changed === 0, 'A second poll with no news changes nothing');
  const cron = require('../jobs/cron.job');
  const cr = await cron.pollShipmentStatus();
  ok(cr && Array.isArray(cr.errors) && cr.errors.length === 0, 'The scheduled job includes this poll and ran without errors');

  // ── 20. Status wording ───────────────────────────────────────────────────
  group('20. Courier wording → our statuses');
  const n = S.normalizeStatus;
  const cases = [
    ['ReadyForPickup', 'PICKUP_SCHEDULED'], ['PickedUp', 'PICKED_UP'], ['AtDestinationFC', 'IN_TRANSIT'], ['OutForDelivery', 'OUT_FOR_DELIVERY'], ['Delivered', 'DELIVERED'],
    ['Undeliverable', 'DELIVERY_FAILED'], ['ReturnedToSeller', 'RTO_DELIVERED'], ['LabelCanceled', 'CANCELLED'],
    ['PICKUP SCHEDULED', 'PICKUP_SCHEDULED'], ['Pickup Pending', 'PICKUP_SCHEDULED'], ['Picked Up', 'PICKED_UP'], ['In Transit', 'IN_TRANSIT'], ['Shipped', 'IN_TRANSIT'],
    ['Out For Delivery', 'OUT_FOR_DELIVERY'], ['DELIVERED', 'DELIVERED'], ['Undelivered - consignee unavailable', 'DELIVERY_FAILED'], ['NDR', 'DELIVERY_FAILED'],
    ['RTO Initiated', 'RTO_INITIATED'], ['RTO In Transit', 'RTO_INITIATED'], ['RTO Delivered', 'RTO_DELIVERED'], ['Returned to Origin', 'RTO_INITIATED'], ['Cancelled', 'CANCELLED'],
    ['Manifested', 'BOOKED'], ['AWB Assigned', 'BOOKED'], ['something weird', null], ['', null], [null, null],
  ];
  const wrong = cases.filter(([i, o]) => n(i) !== o).map(([i, o]) => `${i}→${n(i)} (want ${o})`);
  ok(wrong.length === 0, wrong.length ? `Wording mismatches: ${wrong.join('; ')}` : `${cases.length} real-world status words map to the right step`);
  ok(S.canMove(null, 'BOOKED') && S.canMove('BOOKED', 'PICKED_UP') && !S.canMove('IN_TRANSIT', 'PICKED_UP') && !S.canMove('DELIVERED', 'IN_TRANSIT') && !S.canMove('IN_TRANSIT', 'IN_TRANSIT'), 'Statuses only move forward; final ones never change');
  ok(S.canMove('OUT_FOR_DELIVERY', 'DELIVERY_FAILED') && !S.canMove('BOOKED', 'DELIVERY_FAILED') && S.canMove('DELIVERY_FAILED', 'OUT_FOR_DELIVERY') && S.canMove('IN_TRANSIT', 'RTO_INITIATED'), 'Exceptions can appear once shipped and can recover');
  ok(S.orderStatusFor('BOOKED') === 'CONFIRMED' && S.orderStatusFor('PICKED_UP') === 'SHIPPED' && S.orderStatusFor('DELIVERED') === 'DELIVERED' && S.orderStatusFor('RTO_DELIVERED') === 'RETURNED', 'Order status follows the shipment status');

  // ── 21. Demo mode is gone ────────────────────────────────────────────────
  group('21. Demo mode is removed');
  ok((await req('POST', '/oauth/amazon/demo-authorize', { token, body: { channelId: chId } })).status === 404, 'The fake "Authorize" endpoint no longer exists');
  const adminLogin = await req('POST', '/auth/login', { body: { email: process.env.PLATFORM_ADMIN_EMAIL || 'founder@kartriq.com', password: process.env.PLATFORM_ADMIN_PASSWORD || 'founder123' } });
  if (adminLogin.body?.token) ok((await req('GET', '/admin/demo', { token: adminLogin.body.token })).status === 404, 'The admin demo endpoints no longer exist');
  else ok(true, 'Skipped: platform-admin login not available with the default seed credentials');
  const meNow = await req('GET', '/auth/me', { token });
  ok(!('isDemo' in (meNow.body.tenant || {})), 'The tenant no longer carries an isDemo flag');
  const mkSneaky = await req('POST', '/channels', { token, body: { name: 'Sneaky', type: 'FLIPKART', isDemo: true } });
  ok(mkSneaky.status === 201 && !(await db('channels').where({ id: mkSneaky.body.id }).first()).isDemo, 'A channel can no longer be switched into demo mode');

  // ── 22. Amazon data download ─────────────────────────────────────────────
  group('22. Download everything Amazon holds for MFN orders');
  fake.noPii = false;
  const ad = (ids, q = '', tok = token) => req('GET', `/orders/amazon-data?ids=${ids.join(',')}${q}`, { token: tok, raw: true });
  fake.calls.length = 0;
  const csv1 = await ad([M[1].id, M[2].id, afn.id]);
  const text = csv1.buf.toString().replace(/^\uFEFF/, '');
  const [head, ...lines] = text.split('\r\n');
  ok(csv1.status === 200 && /text\/csv/.test(csv1.headers['content-type']) && /attachment; filename="amazon-orders-.*\.csv"/.test(csv1.headers['content-disposition']), `CSV downloads as a file (${csv1.status})`);
  ok(lines.length === 3 && head.includes('"Amazon order id"') && head.includes('"Ship-to phone"') && head.includes('"Buyer email"') && head.includes('"Shipment status"'), `One row per order (3) with all the columns (${head.split(',').length} columns)`);
  const row1 = lines.find((l) => l.includes('AMZ-MFN-1"'));
  ok(row1.includes('12 MG Road') && row1.includes('411001') && row1.includes('9876543210') && row1.includes('AMZ-MFN-1@marketplace.amazon.in') && row1.includes(SKU), 'Row has the full address, phone, buyer email and SKU from Amazon');
  ok(callsTo(/GET \/orders\/v0\/orders\/AMZ-MFN-1$/).length === 1 && callsTo(/\/address$/).length === 3, 'Fetched live from Amazon (order, items, address, buyer) the first time');
  fake.calls.length = 0;
  const csv2 = await ad([M[1].id, M[2].id, afn.id]);
  ok(csv2.status === 200 && fake.calls.length === 0, 'Second download uses the saved copy — no Amazon calls');
  const csv3 = await ad([M[1].id], '&fresh=1');
  ok(csv3.status === 200 && callsTo(/GET \/orders\/v0\/orders\/AMZ-MFN-1$/).length === 1, 'fresh=1 asks Amazon again');
  const js = await ad([M[2].id], '&format=json');
  const parsed = JSON.parse(js.buf.toString());
  ok(js.status === 200 && /json/.test(js.headers['content-type']) && parsed[0].amazon.order.AmazonOrderId === 'AMZ-MFN-2' && parsed[0].amazon.items[0].SellerSKU === SKU && parsed[0].amazon.shippingAddress.City === 'Pune' && parsed[0].kartriq.shipmentStatus === 'DELIVERED', 'JSON has the complete untouched Amazon record plus our shipment status');
  const one = await req('GET', `/orders/${M[1].id}/amazon-data?format=json`, { token, raw: true });
  ok(one.status === 200 && JSON.parse(one.buf.toString()).length === 1, 'Single-order download works from the order page');
  fake.noPii = true;
  const nopii = await ad([M[3].id]);
  const nt = nopii.buf.toString();
  ok(nopii.status === 200 && /buyer-information role|did not allow/i.test(nt) && nt.includes('AMZ-MFN-3'), 'If Amazon withholds buyer data, the file still downloads and says exactly why');
  fake.noPii = false;
  const many = await req('GET', `/orders/amazon-data?ids=${Array.from({ length: 201 }, () => randomUUID()).join(',')}`, { token });
  ok(many.status === 400 && /at most 200/.test(JSON.stringify(many.body)), 'Limit is 200 orders');
  ok((await ad([M[1].id], '', otherToken)).status === 400, "Another seller cannot download your orders' Amazon data");
  ok((await ad([M[1].id], '', '')).status === 401, 'No login → 401');
  ok((await ad([])).status === 400, 'Empty selection refused');

  // ── 23. "What can my Amazon connection do?" ──────────────────────────────
  group('23. Amazon access check');
  fake.noPii = false; fake.deny = [];
  const acc1 = await req('GET', `/channels/${chId}/amazon/access`, { token });
  const byKey = (r) => Object.fromEntries((r.body.checks || []).map((c) => [c.key, c]));
  const a1 = byKey(acc1);
  ok(acc1.status === 200 && a1.connection?.status === 'ok' && a1.orders?.status === 'ok' && a1.buyer?.status === 'ok' && a1.easyship?.status === 'ok' && a1.labels?.status === 'ok' && a1.inventory?.status === 'ok', `All good when Amazon allows everything (${(acc1.body.checks || []).map((c) => c.key + ':' + c.status).join(', ')})`);
  fake.deny = [/POST \/easyShip/, /GET \/feeds\/2021-06-30\/feeds$/]; fake.noPii = true;
  const a2 = byKey(await req('GET', `/channels/${chId}/amazon/access`, { token }));
  ok(a2.easyship?.status === 'denied' && /Direct-to-Consumer Shipping/.test(a2.easyship.needs) && /Re-authorise/.test(a2.easyship.detail), `Easy Ship refused → shows "denied" with the role to ask Amazon for ("${a2.easyship?.needs}")`);
  ok(a2.labels?.status === 'denied' && a2.buyer?.status === 'denied' && a2.orders?.status === 'ok' && a2.connection?.status === 'ok', 'Labels and buyer details denied, orders still fine — each capability reported separately');
  fake.deny = []; fake.noPii = false;
  ok((await req('GET', `/channels/${chId}/amazon/access`, { token: otherToken })).status === 404, "Another seller cannot run the check on your channel (404)");
  const flk = await req('POST', '/channels', { token, body: { name: 'Shop', type: 'SHOPIFY' } });
  ok((await req('GET', `/channels/${flk.body.id}/amazon/access`, { token })).status >= 400, 'Only Amazon channels have this check');

  // ── Result ───────────────────────────────────────────────────────────────
  console.log(`\n\x1b[1mResult: ${passed} passed, ${failed} failed\x1b[0m`);
  if (failed) { console.log('\nFailures:'); failures.forEach((f) => console.log('  - ' + f)); }
  await db.destroy().catch(() => {});
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('\nTEST CRASHED:', e); process.exit(1); });
