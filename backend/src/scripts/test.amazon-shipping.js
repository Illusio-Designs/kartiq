// End-to-end test: Amazon FBA vs MFN, and MFN "auto-book courier".
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
process.env.DEMO_MODE_ENABLED = 'true';
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
  await seedStock(50);
  const stock = async () => db('inventory_items').where({ tenantId, warehouseId: whId, variantId }).first();

  const ch = await req('POST', '/channels', { token, body: { name: 'Amazon India', type: 'AMAZON' } });
  ok(ch.status === 201, `Amazon channel created (${ch.status})`);
  const chId = ch.body.id;
  const setCreds = (refreshToken) => db('channels').where({ id: chId }).update({
    credentials: JSON.stringify(encryptCredentials({ refreshToken, sellerId: 'SELLER1', region: 'IN', clientId: 'cid', clientSecret: 'csecret' })),
  });
  await setCreds('Atzr|REVOKED');

  // ── 1. The error you reported ────────────────────────────────────────────
  group('1. Revoked refresh token (the error you reported)');
  fake.orders = [];
  const bad = await req('POST', `/channels/${chId}/sync/orders`, { token, body: {} });
  ok(bad.status >= 400, `Sync fails when the refresh token is invalid (${bad.status})`);
  ok(/invalid grant parameter : refresh_token/.test(JSON.stringify(bad.body)), 'Error text is Amazon\'s "invalid grant … refresh_token"');
  const chRow = await db('channels').where({ id: chId }).first();
  ok(/LWA token exchange failed \(400\)/.test(chRow.syncError || ''), 'Channel stores the error so the seller can see it');
  await setCreds(fake.goodRefreshToken); // "reconnect with a fresh token"
  ok(true, 'Reconnected with a fresh refresh token');

  // ── 2. FBA vs MFN import ─────────────────────────────────────────────────
  group('2. FBA (Amazon ships) vs MFN (you ship): import');
  fake.orders = [amazonOrder('AMZ-AFN-1', 'AFN', SKU, 1, 399), amazonOrder('AMZ-MFN-1', 'MFN', SKU, 2, 399)];
  const sync1 = await req('POST', `/channels/${chId}/sync/orders`, { token, body: {} });
  ok(sync1.status === 200 && sync1.body.imported === 2, `Sync imported both orders (${sync1.status}, imported=${sync1.body?.imported})`);
  const find = async (cid) => db('orders').where({ tenantId, channelOrderId: cid }).first();
  const afn = await find('AMZ-AFN-1');
  const mfn1 = await find('AMZ-MFN-1');
  ok(afn?.fulfillmentType === 'CHANNEL', 'FBA order is marked CHANNEL-fulfilled (Amazon ships it)');
  ok(afn?.status === 'PROCESSING', `FBA order starts PROCESSING (is ${afn?.status})`);
  const fbaWh = afn?.warehouseId ? await db('warehouses').where({ id: afn.warehouseId }).first() : null;
  ok(fbaWh?.externalSource === 'AMAZON_FBA' && fbaWh?.isVirtual === 1, 'FBA order is attached to the virtual "Amazon FBA" warehouse');
  ok(mfn1?.fulfillmentType === 'SELF', 'MFN order is marked SELF-fulfilled (you ship it)');
  ok(mfn1?.status === 'PROCESSING', `MFN order arrives PROCESSING — Amazon's own "Unshipped" status (is ${mfn1?.status})`);
  ok(mfn1?.warehouseId === whId, 'MFN order routed to your REAL warehouse');
  const st1 = await stock();
  ok(st1.quantityReserved === 2 && st1.quantityAvailable === 48, `MFN stock reserved: 2 reserved, 48 available (reserved=${st1.quantityReserved}, available=${st1.quantityAvailable})`);
  ok(st1.quantityOnHand === 50, 'On-hand unchanged until it ships (50)');

  // ── 3. FBA can't be confirmed/shipped by hand ────────────────────────────
  group('3. FBA order is hands-off');
  const ratesBefore = callsTo(/eligibleShippingServices/).length;
  const afnConfirm = await req('PATCH', `/orders/${afn.id}/status`, { token, body: { status: 'CONFIRMED' } });
  ok(afnConfirm.status === 400, `Manual status change on an FBA order is blocked (${afnConfirm.status})`);
  ok(callsTo(/eligibleShippingServices/).length === ratesBefore, 'No Amazon courier is ever requested for an FBA order');

  // ── 4. Auto-book OFF ─────────────────────────────────────────────────────
  group('4. MFN with auto-book courier OFF');
  const conf0 = await req('PATCH', `/orders/${mfn1.id}/status`, { token, body: { status: 'CONFIRMED' } });
  ok(conf0.status === 200 && conf0.body.status === 'CONFIRMED', 'Order confirmed');
  ok(callsTo(/eligibleShippingServices/).length === ratesBefore, 'Auto-book OFF → Amazon is NOT asked for rates');
  ok(!(await db('order_labels').where({ orderId: mfn1.id }).first()), 'No label bought');
  ok(conf0.body.shipping === undefined, 'Response has no shipping block (nothing was attempted)');

  // ── 5. Auto-book ON: the main flow ───────────────────────────────────────
  group('5. MFN with auto-book courier ON (the automation)');
  const put = await req('PUT', `/channels/${chId}`, { token, body: { autoBookShipping: true } });
  ok(put.status === 200, 'Seller switches "Auto-book courier" ON for the channel');
  fake.orders = [amazonOrder('AMZ-MFN-2', 'MFN', SKU, 2, 399)];
  await req('POST', `/channels/${chId}/sync/orders`, { token, body: {} });
  const mfn2 = await find('AMZ-MFN-2');
  ok(mfn2?.status === 'PROCESSING', 'New MFN order arrives PROCESSING (not yet shipped)');
  const stBefore = await stock();
  fake.calls.length = 0;
  const conf = await req('PATCH', `/orders/${mfn2.id}/status`, { token, body: { status: 'CONFIRMED' } });
  ok(conf.status === 200, `Seller presses CONFIRM (${conf.status})`);
  ok(conf.body.shipping?.booked === true, 'Kartriq auto-booked the courier with Amazon');
  ok(conf.body.status === 'SHIPPED', `Order is SHIPPED straight away (is ${conf.body.status})`);
  ok(conf.body.trackingNumber === 'TRK1001', `Tracking number saved from Amazon (${conf.body.trackingNumber})`);
  ok(conf.body.courierName === 'SlowCo', `Courier recorded (${conf.body.courierName})`);
  ok(conf.body.channelShipmentId === 'SHIP-1', 'Amazon shipment id saved (so the label can be cancelled)');
  ok(conf.body.shippedAt, 'Shipped time recorded');

  const ratesReq = callsTo(/POST \/mfn\/v0\/eligibleShippingServices/)[0];
  const buyReq = callsTo(/POST \/mfn\/v0\/shipments/)[0];
  ok(callsTo(/eligibleShippingServices/).length === 1 && callsTo(/POST \/mfn\/v0\/shipments/).length === 1, 'Exactly 1 rates call + 1 buy call to Amazon');
  ok(buyReq?.body?.ShippingServiceId === 'svc-cheap', `It bought the CHEAPEST rate: ₹62.50 Standard, not ₹95 or ₹140 (bought ${buyReq?.body?.ShippingServiceId})`);
  ok(conf.body.shipping.chosen?.amount === 62.5 && conf.body.shipping.ratesConsidered === 3, 'It considered all 3 offers and picked the lowest');
  ok(conf.body.shipping.rates === undefined && !JSON.stringify(conf.body).includes('svc-express'), 'No courier list is returned/displayed to the seller');

  const det = ratesReq?.body?.ShipmentRequestDetails;
  ok(det?.Weight?.Value === 1500 && det?.Weight?.Unit === 'grams', `Parcel weight from product: 0.75 kg × 2 = 1500 g (sent ${det?.Weight?.Value} ${det?.Weight?.Unit})`);
  ok(det?.PackageDimensions?.Length === 30 && det?.PackageDimensions?.Width === 20 && det?.PackageDimensions?.Height === 12, 'Parcel size from product: 30×20×12 cm');
  ok(det?.ShipFromAddress?.PostalCode === '411019' && det?.ShipFromAddress?.City === 'Pune', 'Ship-from is the order\'s warehouse address (Pune 411019)');
  ok(conf.body.shipping.usedDefaults?.weight === false && conf.body.shipping.usedDefaults?.dimensions === false, 'No default weight/size had to be assumed');

  const lbl = await db('order_labels').where({ orderId: mfn2.id }).first();
  ok(lbl && lbl.status === 'ACTIVE' && lbl.trackingNumber === 'TRK1001', 'Label record saved (ACTIVE) with tracking');
  ok(Number(lbl?.cost) === 62.5 && lbl?.carrier === 'SlowCo', 'Label cost ₹62.50 and carrier saved');
  const pdf = await req('GET', `/orders/${mfn2.id}/label`, { token, raw: true });
  ok(pdf.status === 200 && /pdf/.test(pdf.headers['content-type']), `GET /orders/:id/label returns the file (${pdf.status}, ${pdf.headers['content-type']})`);
  ok(pdf.buf.equals(fake.labels['SHIP-1']) && pdf.buf.slice(0, 5).toString() === '%PDF-', 'Label bytes are exactly what Amazon sent (gunzipped correctly)');
  const pdf2 = await req('GET', `/orders/${mfn2.id}/label`, { token, raw: true });
  ok(pdf2.status === 200 && pdf2.buf.equals(pdf.buf), 'Label can be re-printed any time (same bytes again)');

  const stAfter = await stock();
  ok(stAfter.quantityOnHand === stBefore.quantityOnHand - 2, `Stock deducted on ship: on-hand ${stBefore.quantityOnHand} → ${stAfter.quantityOnHand}`);
  ok(stAfter.quantityReserved === stBefore.quantityReserved - 2, `Reservation released (${stBefore.quantityReserved} → ${stAfter.quantityReserved})`);

  // ── 6. Idempotency ───────────────────────────────────────────────────────
  group('6. No double-buying');
  const again = await req('PATCH', `/orders/${mfn2.id}/status`, { token, body: { status: 'CONFIRMED' } });
  const retry = await req('POST', `/orders/${mfn2.id}/book-shipping`, { token, body: {} });
  const retryShipped = await (async () => {
    // (The status control lets a seller move a shipped order back to CONFIRMED —
    // `again` just did. Put it back so section 11 starts from a genuinely
    // SHIPPED order; the "moved back by hand" case is covered in section 11.)
    await db('orders').where({ id: mfn2.id }).update({ status: 'SHIPPED' });
    return req('POST', `/orders/${mfn2.id}/book-shipping`, { token, body: {} });
  })();
  ok(retry.status === 409 && /already/.test(JSON.stringify(retry.body)), `Retry on an order that has a label is refused (${retry.status})`);
  ok(retryShipped.status === 409, `Retry on an already-SHIPPED order is refused too (${retryShipped.status})`);
  ok(callsTo(/POST \/mfn\/v0\/shipments/).length === 1, 'Still exactly 1 label bought in total');
  ok((await db('order_labels').where({ orderId: mfn2.id }).count({ c: '*' }).first()).c === 1, 'Only 1 label row exists for the order');

  // ── 7. Failures buy nothing and are retryable ────────────────────────────
  group('7. When Amazon says no');
  await seedStock(50);
  fake.orders = [amazonOrder('AMZ-MFN-3', 'MFN', SKU, 1, 399)];
  await req('POST', `/channels/${chId}/sync/orders`, { token, body: {} });
  const mfn3 = await find('AMZ-MFN-3');
  fake.mode = 'noRates';
  const buysBefore = callsTo(/POST \/mfn\/v0\/shipments/).length;
  const c3 = await req('PATCH', `/orders/${mfn3.id}/status`, { token, body: { status: 'CONFIRMED' } });
  ok(c3.status === 200 && c3.body.status === 'CONFIRMED', 'Confirm still succeeds when no courier is available');
  ok(/no eligible courier/.test(c3.body.shipping?.error || ''), `Reason reported: "${c3.body.shipping?.error}"`);
  ok(/no eligible courier/.test(c3.body.shippingError || ''), 'Reason stored on the order for the UI');
  ok(callsTo(/POST \/mfn\/v0\/shipments/).length === buysBefore, 'Nothing was bought');
  ok(!(await db('order_labels').where({ orderId: mfn3.id }).first()), 'No label saved');

  fake.mode = 'buyFails';
  const r3 = await req('POST', `/orders/${mfn3.id}/book-shipping`, { token, body: {} });
  ok(r3.status === 400 && /Address could not be verified/.test(JSON.stringify(r3.body)), `Amazon purchase error is passed through (${r3.status})`);
  const o3 = await db('orders').where({ id: mfn3.id }).first();
  ok(o3.status === 'CONFIRMED' && !o3.trackingNumber, 'Order not marked shipped after a failed purchase');

  fake.mode = 'ok';
  const r3ok = await req('POST', `/orders/${mfn3.id}/book-shipping`, { token, body: {} });
  ok(r3ok.status === 200 && r3ok.body.booked === true, `Retry works once Amazon is happy (${r3ok.status})`);
  const o3b = await db('orders').where({ id: mfn3.id }).first();
  ok(o3b.status === 'SHIPPED' && o3b.shippingError === null, 'Order SHIPPED and the old error is cleared');

  // ── 8. Products without weight/size ──────────────────────────────────────
  group('8. Product has no weight or size');
  const SKU2 = `PLAIN-${TS}`;
  const prod2 = await req('POST', '/products', { token, body: { name: 'Plain Item', sku: SKU2, costPrice: 10, mrp: 50, sellingPrice: 40 } });
  const v2 = prod2.body.variants[0].id;
  await db('inventory_items').insert({ id: randomUUID(), tenantId, warehouseId: whId, productId: prod2.body.id, variantId: v2, quantityOnHand: 20, quantityReserved: 0, quantityAvailable: 20, reorderPoint: 0, reorderQty: 0, updatedAt: new Date() });
  fake.orders = [amazonOrder('AMZ-MFN-4', 'MFN', SKU2, 1, 40)];
  await req('POST', `/channels/${chId}/sync/orders`, { token, body: {} });
  const mfn4 = await find('AMZ-MFN-4');
  fake.calls.length = 0;
  const c4 = await req('PATCH', `/orders/${mfn4.id}/status`, { token, body: { status: 'CONFIRMED' } });
  const d4 = callsTo(/POST \/mfn\/v0\/eligibleShippingServices/)[0]?.body?.ShipmentRequestDetails;
  ok(c4.body.shipping?.booked === true, 'Still books a courier');
  ok(d4?.Weight?.Value === 500 && d4?.PackageDimensions?.Length === 20, 'Falls back to default 500 g, 20×15×10 cm');
  ok(c4.body.shipping?.usedDefaults?.weight === true && c4.body.shipping?.usedDefaults?.dimensions === true, 'Result flags that defaults were assumed');

  // ── 9. Warehouse with no address ─────────────────────────────────────────
  group('9. Warehouse has no address');
  // (the Starter plan allows 1 facility, so insert this one directly)
  const whNo = randomUUID();
  await db('warehouses').insert({ id: whNo, tenantId, name: 'No-address WH', code: `NOADDR-${TS}`, address: JSON.stringify({}), isActive: 1, isVirtual: 0, updatedAt: new Date() });
  fake.orders = [amazonOrder('AMZ-MFN-5', 'MFN', SKU2, 1, 40)];
  await req('POST', `/channels/${chId}/sync/orders`, { token, body: {} });
  const mfn5 = await find('AMZ-MFN-5');
  await db('orders').where({ id: mfn5.id }).update({ warehouseId: whNo });
  fake.calls.length = 0;
  const c5 = await req('PATCH', `/orders/${mfn5.id}/status`, { token, body: { status: 'CONFIRMED' } });
  ok(/has no city\/pincode/.test(c5.body.shipping?.error || ''), `Clear message: "${c5.body.shipping?.error}"`);
  ok(callsTo(/eligibleShippingServices/).length === 0, 'Amazon not called with a bad address');

  // ── 10. Approve path (RTO-flagged order) ─────────────────────────────────
  group('10. Confirming via "Approve" (RTO-risk orders)');
  fake.orders = [amazonOrder('AMZ-MFN-6', 'MFN', SKU, 1, 399)];
  await seedStock(30);
  await req('POST', `/channels/${chId}/sync/orders`, { token, body: {} });
  const mfn6 = await find('AMZ-MFN-6');
  await db('orders').where({ id: mfn6.id }).update({ needsApproval: 1 });
  const ap = await req('POST', `/orders/${mfn6.id}/approve`, { token, body: {} });
  ok(ap.status === 200 && ap.body.shipping?.booked === true && ap.body.status === 'SHIPPED', `Approve also auto-books and ships (${ap.status}, ${ap.body.status})`);

  // ── 11. Cancel a label ───────────────────────────────────────────────────
  group('11. Cancel a label (order goes back, stock goes back)');
  const stShipped = await stock();
  const mfn2Shipped = await db('orders').where({ id: mfn2.id }).first();
  ok(mfn2Shipped.status === 'SHIPPED' && mfn2Shipped.stockStatus === 'DEDUCTED', 'Before cancelling: order SHIPPED, stock DEDUCTED');
  fake.calls.length = 0;
  const del = await req('DELETE', `/orders/${mfn2.id}/label`, { token });
  ok(del.status === 200 && del.body.cancelled === true, `Label cancelled (${del.status})`);
  ok(del.body.orderReverted === true, 'Response says the order was taken back from SHIPPED');
  ok(callsTo(/DELETE \/mfn\/v0\/shipments\/SHIP-1/).length === 1, 'Amazon was told to void shipment SHIP-1');
  ok((await db('order_labels').where({ orderId: mfn2.id }).first()).status === 'CANCELLED', 'Local label marked CANCELLED (history kept)');
  const gone = await req('GET', `/orders/${mfn2.id}/label`, { token });
  ok(gone.status === 404, `Cancelled label is no longer downloadable (${gone.status})`);
  const mfn2Back = await db('orders').where({ id: mfn2.id }).first();
  ok(mfn2Back.status === 'CONFIRMED', `Order is CONFIRMED again, not SHIPPED (is ${mfn2Back.status})`);
  ok(!mfn2Back.trackingNumber && !mfn2Back.courierName && !mfn2Back.channelShipmentId && !mfn2Back.shippedAt, 'Tracking, courier, shipment id and shipped-time cleared');
  ok(mfn2Back.stockStatus === 'RESERVED', `Stock status back to RESERVED (is ${mfn2Back.stockStatus})`);
  const stUnshipped = await stock();
  ok(stUnshipped.quantityOnHand === stShipped.quantityOnHand + 2 && stUnshipped.quantityReserved === stShipped.quantityReserved + 2,
    `Stock restored: on-hand +2 (${stShipped.quantityOnHand}→${stUnshipped.quantityOnHand}), reserved +2 (${stShipped.quantityReserved}→${stUnshipped.quantityReserved})`);
  ok(stUnshipped.quantityAvailable === stShipped.quantityAvailable, 'Available unchanged (the units are still held for this order)');
  const adj = await db('stock_movements').where({ referenceId: mfn2.id, type: 'ADJUSTMENT' }).first();
  ok(adj && adj.quantity === 2 && /label cancelled/i.test(adj.notes || ''), 'Ledger has a compensating ADJUSTMENT entry (qty 2, "label cancelled")');
  const del2 = await req('DELETE', `/orders/${mfn2.id}/label`, { token });
  ok(del2.status === 404, `Cancelling again is refused, stock not moved twice (${del2.status})`);
  const stAgain = await stock();
  ok(stAgain.quantityOnHand === stUnshipped.quantityOnHand, 'Stock unchanged by the repeat cancel');

  const rebook = await req('POST', `/orders/${mfn2.id}/book-shipping`, { token, body: {} });
  ok(rebook.status === 200 && rebook.body.booked === true, `The order can be booked again (${rebook.status})`);
  const mfn2Re = await db('orders').where({ id: mfn2.id }).first();
  ok(mfn2Re.status === 'SHIPPED' && mfn2Re.trackingNumber && mfn2Re.trackingNumber !== 'TRK1001', `New label, new tracking (${mfn2Re.trackingNumber})`);
  const stRe = await stock();
  ok(stRe.quantityOnHand === stShipped.quantityOnHand && stRe.quantityReserved === stShipped.quantityReserved, 'Stock deducted exactly once again (same as the first shipment)');
  ok(Number((await db('order_labels').where({ orderId: mfn2.id, status: 'ACTIVE' }).count({ c: '*' }).first()).c) === 1, 'Exactly one ACTIVE label again');

  // A seller manually moved a shipped order back to CONFIRMED but the label is
  // still on it: cancelling must still clear the tracking and restore the stock.
  await db('orders').where({ id: mfn6.id }).update({ status: 'CONFIRMED' });
  const stM = await stock();
  const delManual = await req('DELETE', `/orders/${mfn6.id}/label`, { token });
  const mfn6Manual = await db('orders').where({ id: mfn6.id }).first();
  const stM2 = await stock();
  ok(delManual.status === 200 && delManual.body.orderReverted === true && !mfn6Manual.trackingNumber && mfn6Manual.status === 'CONFIRMED' && mfn6Manual.stockStatus === 'RESERVED',
    'Order manually moved back to CONFIRMED: cancel still clears tracking and returns stock to RESERVED');
  ok(stM2.quantityOnHand === stM.quantityOnHand + 1 && stM2.quantityReserved === stM.quantityReserved + 1, `…and restores its 1 unit (on-hand ${stM.quantityOnHand}→${stM2.quantityOnHand})`);

  // A DELIVERED order must NOT be pulled back — the parcel reached the buyer.
  await db('orders').where({ id: mfn3.id }).update({ status: 'DELIVERED' });
  const delDelivered = await req('DELETE', `/orders/${mfn3.id}/label`, { token });
  const mfn6After = await db('orders').where({ id: mfn3.id }).first();
  ok(delDelivered.status === 200 && delDelivered.body.orderReverted === false && mfn6After.status === 'DELIVERED' && !!mfn6After.trackingNumber && mfn6After.stockStatus === 'DEDUCTED',
    'A DELIVERED order keeps its status and tracking when its label is cancelled');

  // ── 12. Tenant isolation ─────────────────────────────────────────────────
  group('12. Another seller cannot touch your labels');
  const spy = await req('GET', `/orders/${mfn3.id}/label`, { token: otherToken });
  ok(spy.status === 404, `Other tenant cannot download the label (${spy.status})`);
  const spy2 = await req('POST', `/orders/${mfn3.id}/book-shipping`, { token: otherToken, body: {} });
  ok(spy2.status !== 200, `Other tenant cannot trigger booking (${spy2.status})`);
  const spy3 = await req('DELETE', `/orders/${mfn3.id}/label`, { token: otherToken });
  ok(spy3.status === 404, `Other tenant cannot cancel the label (${spy3.status})`);

  // ── 13. Forever-free plan ────────────────────────────────────────────────
  group('13. FIVERR_FREE test plan');
  const plans = await req('GET', '/plans');
  ok(!plans.body.some((p) => p.code === 'FIVERR_FREE'), 'Hidden from the public pricing list');
  const plan = await db('plans').where({ code: 'FIVERR_FREE' }).first();
  ok(plan && Number(plan.monthlyPrice) === 0 && plan.isPublic === 0, 'Exists in the database, ₹0, not public');

  // ── 14. Packing slip ─────────────────────────────────────────────────────
  group('14. Packing slip');
  const slipRaw = (id, tok = token) => req('GET', `/orders/${id}/packing-slip`, { token: tok, raw: true });
  const slip = await slipRaw(mfn1.id);
  const html = slip.buf.toString();
  ok(slip.status === 200 && /text\/html/.test(slip.headers['content-type']), `MFN order returns a printable HTML page (${slip.status}, ${slip.headers['content-type']})`);
  ok(html.includes('PACKING SLIP') && html.includes(mfn1.orderNumber), 'Titled PACKING SLIP, carries the order number');
  ok(html.includes('AMZ-MFN-1'), 'Shows the Amazon order id');
  ok(html.includes('Test Widget') && html.includes(SKU), 'Lists the item name and SKU');
  ok(/<td class="c qty">2<\/td>/.test(html) && html.includes('Total units: 2'), 'Shows quantity 2 and total units 2');
  ok(html.includes('12 MG Road') && html.includes('Pune') && html.includes('411001'), 'Ship-to address (buyer) is there');
  ok(html.includes('Pune Warehouse') && html.includes('411019') && html.includes('9999999999'), 'Ship-from is your warehouse (name, pincode, phone)');
  ok(html.includes(owner.businessName), 'Seller business name is on the slip');
  ok(!/₹|INR|Rs\.?\s?\d|\b798\b|\b399\b|subtotal|total amount/i.test(html), 'NO prices or money amounts on the slip');
  ok(!/<script/i.test(html), 'No scripts in the page');
  ok(!/amazon\.(in|com)/i.test(html.replace('AMZ-MFN-1', '')), 'No marketplace links or branding');
  ok(!html.includes('Shipped with'), 'Not-yet-shipped order shows no tracking line');

  const shippedSlip = (await slipRaw(mfn2.id)).buf.toString();
  const mfn2Now = await db('orders').where({ id: mfn2.id }).first();
  ok(shippedSlip.includes('Shipped with') && shippedSlip.includes(mfn2Now.trackingNumber), `Shipped order shows its courier + tracking (${mfn2Now.trackingNumber})`);

  // Buyer-controlled text must never become markup.
  await db('customers').where({ id: mfn1.customerId }).update({ name: '<script>alert(1)</script>' });
  await db('orders').where({ id: mfn1.id }).update({ notes: '"><img src=x onerror=alert(2)>' });
  const evil = (await slipRaw(mfn1.id)).buf.toString();
  ok(!/<script>alert|<img src=x/i.test(evil) && evil.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && evil.includes('&lt;img src=x'),
    'Hostile buyer name / note is HTML-escaped (no script or image injection)');

  const afnSlip = await req('GET', `/orders/${afn.id}/packing-slip`, { token });
  ok(afnSlip.status === 400 && /fulfilled by the marketplace/.test(JSON.stringify(afnSlip.body)), `FBA order: no slip, clear reason (${afnSlip.status})`);
  ok((await slipRaw(mfn1.id, otherToken)).status === 404, 'Another seller cannot open your packing slip (404)');
  ok((await slipRaw(mfn1.id, '')).status === 401, 'No login → 401');

  // ── 15. Bulk packing slips ───────────────────────────────────────────────
  group('15. Bulk packing slips');
  await db('orders').where({ id: mfn5.id }).update({ status: 'CANCELLED' });
  const bogus = randomUUID();
  const ids = [mfn2.id, afn.id, mfn1.id, bogus, mfn4.id, mfn5.id, mfn2.id /* duplicate */];
  const bulk = await req('POST', '/orders/packing-slips', { token, body: { ids } });
  ok(bulk.status === 200 && typeof bulk.body.html === 'string', `Bulk request returns one document (${bulk.status})`);
  ok(bulk.body.printed === 3, `3 slips printed: the 3 shippable orders, duplicate counted once (printed=${bulk.body.printed})`);
  const sheets = (bulk.body.html.match(/<div class="sheet">/g) || []).length;
  ok(sheets === 3, `Document has 3 slips, one per page (${sheets})`);
  ok(/page-break-after:always/.test(bulk.body.html) && /break-after:page/.test(bulk.body.html), 'Each slip starts on a new page when printed');
  const pos = (n) => bulk.body.html.indexOf(n);
  const ord2 = await db('orders').where({ id: mfn2.id }).first();
  const ord4 = await db('orders').where({ id: mfn4.id }).first();
  ok(pos(ord2.orderNumber) > -1 && pos(mfn1.orderNumber) > pos(ord2.orderNumber) && pos(ord4.orderNumber) > pos(mfn1.orderNumber), 'Slips come out in the order they were selected');
  const reasons = Object.fromEntries(bulk.body.skipped.map((x) => [x.id, x.reason]));
  ok(bulk.body.skipped.length === 3, `3 skipped, each with a reason (${bulk.body.skipped.length})`);
  ok(/marketplace \(FBA\)/.test(reasons[afn.id] || ''), `FBA order skipped: "${reasons[afn.id]}"`);
  ok(/not found/i.test(reasons[bogus] || ''), `Unknown order skipped: "${reasons[bogus]}"`);
  ok(/cancelled/i.test(reasons[mfn5.id] || ''), `Cancelled order skipped: "${reasons[mfn5.id]}"`);
  ok(!/<script>alert|<img src=x/i.test(bulk.body.html) && bulk.body.html.includes('&lt;script&gt;'), 'Hostile buyer text is escaped in the bulk document too');
  ok(!/₹|INR|Rs\.?\s?\d|subtotal/i.test(bulk.body.html), 'No prices anywhere in the bulk document');

  const one = await req('POST', '/orders/packing-slips', { token, body: { ids: [mfn4.id] } });
  ok(one.status === 200 && one.body.printed === 1 && one.body.skipped.length === 0, 'A single selected order works the same way');
  const allFba = await req('POST', '/orders/packing-slips', { token, body: { ids: [afn.id] } });
  ok(allFba.status === 400 && allFba.body.skipped?.length === 1, `Only FBA selected: 400 with the reason, nothing to print (${allFba.status})`);
  const none = await req('POST', '/orders/packing-slips', { token, body: { ids: [] } });
  ok(none.status === 400, `Empty selection refused (${none.status})`);
  const tooMany = await req('POST', '/orders/packing-slips', { token, body: { ids: Array.from({ length: 101 }, () => randomUUID()) } });
  ok(tooMany.status === 400 && /at most 100/.test(JSON.stringify(tooMany.body)), `101 orders refused, limit is 100 (${tooMany.status})`);
  const exactly = await req('POST', '/orders/packing-slips', { token, body: { ids: Array.from({ length: 100 }, () => randomUUID()) } });
  ok(exactly.status === 400 && !/at most/.test(JSON.stringify(exactly.body)), 'Exactly 100 is accepted by the limit check (then nothing found to print)');
  const noAuth = await req('POST', '/orders/packing-slips', { body: { ids: [mfn4.id] } });
  ok(noAuth.status === 401, `No login → 401 (${noAuth.status})`);
  const spyBulk = await req('POST', '/orders/packing-slips', { token: otherToken, body: { ids: [mfn2.id, mfn1.id, mfn4.id] } });
  ok(spyBulk.status === 400 && !spyBulk.body.html && spyBulk.body.skipped.every((x) => /not found/i.test(x.reason)), 'Another seller cannot pull your orders into their slips');

  // ── 16. Bulk shipping labels ─────────────────────────────────────────────
  group('16. Bulk shipping labels');
  await seedStock(80);
  fake.orders = ['7', '8', '9', '10'].map((n) => amazonOrder(`AMZ-MFN-${n}`, 'MFN', SKU, 1, 399));
  await req('POST', `/channels/${chId}/sync/orders`, { token, body: {} });
  const [l7, l8, l9, l10] = await Promise.all(['7', '8', '9', '10'].map((n) => find(`AMZ-MFN-${n}`)));
  const bookAs = async (o, type) => {
    fake.labelType = type;
    const r = await req('PATCH', `/orders/${o.id}/status`, { token, body: { status: 'CONFIRMED' } });
    return r.body.shipping;
  };
  const b7 = await bookAs(l7, 'PDF');
  const b8 = await bookAs(l8, 'PNG');
  const b9 = await bookAs(l9, 'ZPL');
  const b10 = await bookAs(l10, 'PDF');
  fake.labelType = 'PDF';
  ok(b7?.booked && b8?.booked && b9?.booked && b10?.booked, 'Set-up: 4 fresh orders each bought a label (PDF, PNG, ZPL, PDF)');
  await db('order_labels').where({ orderId: l10.id }).update({ content: Buffer.from('not a pdf').toString('base64') });
  const lblIds = [l7.id, l8.id, l9.id, afn.id, mfn1.id, mfn3.id, bogus, l10.id, l7.id /* duplicate */];
  const bl = await req('POST', '/orders/labels', { token, body: { ids: lblIds } });
  ok(bl.status === 200 && typeof bl.body.pdf === 'string', `Bulk labels returns one PDF (${bl.status})`);
  ok(bl.body.printed === 2 && bl.body.pages === 2, `2 labels merged into 2 pages: the PDF one and the PNG one (printed=${bl.body.printed}, pages=${bl.body.pages})`);
  const merged = await PDFDocument.load(Buffer.from(bl.body.pdf, 'base64'));
  const sizes = merged.getPages().map((pg) => `${Math.round(pg.getWidth())}x${Math.round(pg.getHeight())}`);
  ok(merged.getPageCount() === 2 && sizes[0] === '300x450' && sizes[1] === '288x432', `It is a real PDF: page 1 = Amazon's PDF label (300×450), page 2 = the PNG on a 4×6 page (${sizes.join(', ')})`);
  const why = Object.fromEntries(bl.body.skipped.map((x) => [x.id, x.reason]));
  ok(bl.body.skipped.length === 6, `6 skipped, each with a reason (${bl.body.skipped.length})`);
  ok(/ZPL/.test(why[l9.id] || ''), `ZPL thermal label skipped: "${why[l9.id]}"`);
  ok(/marketplace \(FBA\)/.test(why[afn.id] || ''), `FBA order skipped: "${why[afn.id]}"`);
  ok(/No active shipping label/.test(why[mfn1.id] || ''), `Order that never bought a label skipped: "${why[mfn1.id]}"`);
  ok(/No active shipping label/.test(why[mfn3.id] || ''), 'Order whose label was cancelled is skipped (cancelled labels never print)');
  ok(/not found/i.test(why[bogus] || ''), `Unknown order skipped: "${why[bogus]}"`);
  ok(/could not be read/.test(why[l10.id] || ''), `Corrupt label file skips only that order: "${why[l10.id]}"`);

  const rev = await req('POST', '/orders/labels', { token, body: { ids: [l8.id, l7.id] } });
  const revSizes = (await PDFDocument.load(Buffer.from(rev.body.pdf, 'base64'))).getPages().map((pg) => Math.round(pg.getWidth()));
  ok(revSizes[0] === 288 && revSizes[1] === 300, `Labels come out in the order selected (reversed selection → ${revSizes.join(', ')})`);
  const oneLbl = await req('POST', '/orders/labels', { token, body: { ids: [l7.id] } });
  ok(oneLbl.status === 200 && oneLbl.body.printed === 1 && oneLbl.body.skipped.length === 0, 'A single selected order works too');
  const onlyZpl = await req('POST', '/orders/labels', { token, body: { ids: [l9.id] } });
  ok(onlyZpl.status === 400 && onlyZpl.body.skipped?.length === 1 && !onlyZpl.body.pdf, `Only a ZPL order selected: 400 with the reason, nothing to print (${onlyZpl.status})`);
  ok((await req('POST', '/orders/labels', { token, body: { ids: [] } })).status === 400, 'Empty selection refused');
  const many = await req('POST', '/orders/labels', { token, body: { ids: Array.from({ length: 101 }, () => randomUUID()) } });
  ok(many.status === 400 && /at most 100/.test(JSON.stringify(many.body)), `101 orders refused, limit is 100 (${many.status})`);
  ok((await req('POST', '/orders/labels', { body: { ids: [l7.id] } })).status === 401, 'No login → 401');
  const spyL = await req('POST', '/orders/labels', { token: otherToken, body: { ids: [l7.id, l8.id] } });
  ok(spyL.status === 400 && !spyL.body.pdf && spyL.body.skipped.every((x) => /not found/i.test(x.reason)), "Another seller cannot pull your labels into their PDF");
  const stillThere = await db('order_labels').where({ orderId: l7.id, status: 'ACTIVE' }).count({ c: '*' }).first();
  ok(Number(stillThere.c) === 1, 'Bulk printing does not buy or change anything (label still the same single ACTIVE one)');
  ok(callsTo(/POST \/mfn\/v0\/shipments/).filter((c) => /AMZ-MFN-7/.test(JSON.stringify(c.body))).length === 1, 'Amazon was only asked to buy order 7 once — printing never re-buys');

  // ── 18. Bulk "Confirm & get label" ───────────────────────────────────────
  group('18. Bulk Confirm & get labels');
  await db('channels').where({ id: chId }).update({ autoBookShipping: 0 }); // prove it books even with the auto-book switch OFF
  await seedStock(80);
  fake.orders = ['11', '12', '13'].map((n) => amazonOrder(`AMZ-MFN-${n}`, 'MFN', SKU, 1, 399));
  await req('POST', `/channels/${chId}/sync/orders`, { token, body: {} });
  const [k11, k12, k13] = await Promise.all(['11', '12', '13'].map((n) => find(`AMZ-MFN-${n}`)));
  fake.labelType = 'PDF'; fake.mode = 'ok';
  const shipCallsBefore = callsTo(/POST \/mfn\/v0\/shipments/).length;
  const bb = await req('POST', '/orders/book-shipping', { token, body: { ids: [k11.id, k12.id, afn.id, mfn2.id, bogus, k11.id] } });
  ok(bb.status === 200 && bb.body.booked === 2, `Books the 2 new MFN orders even though the channel's auto-book switch is OFF (booked=${bb.body.booked})`);
  const bres = Object.fromEntries(bb.body.results.map((r) => [r.id, r]));
  ok(bb.body.results.length === 5, `Duplicate id handled once — 5 outcomes for 6 ids (${bb.body.results.length})`);
  ok(bres[k11.id].booked && bres[k11.id].trackingNumber && bres[k12.id].booked, 'Each booked order reports its own tracking number');
  ok(bres[afn.id].kind === 'skipped' && /FBA|channel/i.test(bres[afn.id].reason), `FBA order skipped, not an error: "${bres[afn.id].reason}"`);
  ok(bres[mfn2.id].kind === 'skipped', `Already-shipped order skipped, not bought twice: "${bres[mfn2.id].reason}"`);
  ok(bres[bogus].kind === 'skipped' && /not found/i.test(bres[bogus].reason), `Unknown order skipped: "${bres[bogus].reason}"`);
  ok(callsTo(/POST \/mfn\/v0\/shipments/).length === shipCallsBefore + 2, 'Amazon was asked to buy exactly 2 labels');
  ok((await db('orders').where({ id: k11.id }).first()).status === 'SHIPPED', 'Booked orders are SHIPPED');
  const bl2 = await req('POST', '/orders/labels', { token, body: { ids: [k11.id, k12.id] } });
  ok(bl2.status === 200 && bl2.body.printed === 2, 'Their labels print together as one PDF straight away (Confirm → Print)');

  fake.mode = 'buyFails';
  const bf = await req('POST', '/orders/book-shipping', { token, body: { ids: [k13.id] } });
  ok(bf.status === 200 && bf.body.booked === 0 && bf.body.failed === 1 && /Address could not be verified/.test(bf.body.results[0].reason), `A failure is reported per order, not as a crash: "${bf.body.results[0].reason.slice(0, 50)}…"`);
  fake.mode = 'ok';
  ok((await req('POST', '/orders/book-shipping', { token, body: { ids: [] } })).status === 400, 'Empty selection refused (400)');
  const big = await req('POST', '/orders/book-shipping', { token, body: { ids: Array.from({ length: 51 }, () => randomUUID()) } });
  ok(big.status === 400 && /at most 50/.test(JSON.stringify(big.body)), `51 orders refused, limit is 50 (${big.status})`);
  ok((await req('POST', '/orders/book-shipping', { body: { ids: [k13.id] } })).status === 401, 'No login → 401');
  const buyBefore = callsTo(/POST \/mfn\/v0\/shipments/).length;
  const bo = await req('POST', '/orders/book-shipping', { token: otherToken, body: { ids: [k13.id] } });
  ok(bo.status === 200 && bo.body.booked === 0 && /not found/i.test(bo.body.results[0].reason), 'Another seller cannot book labels for your orders');
  ok(callsTo(/POST \/mfn\/v0\/shipments/).length === buyBefore, 'And no purchase was made on your behalf');

  // ── 17. Demo mode (live-site sandbox) ────────────────────────────────────
  group('17. Demo mode');
  const adminLogin = await req('POST', '/auth/login', { body: { email: process.env.PLATFORM_ADMIN_EMAIL || 'founder@kartriq.com', password: process.env.PLATFORM_ADMIN_PASSWORD || 'founder123' } });
  if (!adminLogin.body?.token) {
    ok(true, 'Skipped: platform-admin login not available with the default seed credentials');
  } else {
    const adminTok = adminLogin.body.token;
    const demoEmail = `demo-${TS}@test.local`;
    const demoPass = 'DemoPass12345';
    // an existing demo tenant from an earlier run would make "setup" return 409 — clear its flag
    await db('tenants').where({ isDemo: 1 }).update({ isDemo: 0 });
    const sellerOrdersBefore = Number((await db('orders').where({ tenantId }).count({ c: '*' }).first()).c);

    process.env.DEMO_MODE_ENABLED = 'false';
    const off = await req('POST', '/admin/demo/setup', { token: adminTok, body: { email: demoEmail, password: demoPass } });
    ok(off.status === 403 && /not enabled/i.test(JSON.stringify(off.body)), `Server with demo mode OFF refuses to create it (${off.status})`);
    ok((await req('GET', '/admin/demo', { token: adminTok })).body.enabled === false, 'Status reports demo mode as disabled');
    process.env.DEMO_MODE_ENABLED = 'true';

    ok((await req('GET', '/admin/demo', { token })).status === 403, 'A normal seller cannot see the demo admin API (403)');
    ok((await req('POST', '/admin/demo/reset', { token, body: {} })).status === 403, 'A normal seller cannot reset demo data (403)');
    ok((await req('POST', '/admin/demo/setup', { token: adminTok, body: { email: demoEmail, password: 'short' } })).status === 400, 'Weak demo password refused (400)');

    const setup = await req('POST', '/admin/demo/setup', { token: adminTok, body: { email: demoEmail, password: demoPass } });
    ok(setup.status === 201 && setup.body.tenantId, `Setup creates the demo tenant (${setup.status})`);
    ok(setup.body.password === undefined, 'The chosen password is never echoed back');
    const gen = await req('POST', '/admin/demo/setup', { token: adminTok, body: { email: `demo2-${TS}@test.local` } });
    ok(gen.status === 409, `A second demo tenant is refused (${gen.status})`);

    const dt = await db('tenants').where({ id: setup.body.tenantId }).first();
    ok(dt.isDemo === 1 && dt.status === 'ACTIVE', 'Tenant is flagged isDemo and ACTIVE');
    const dsub = await db('subscriptions').where({ tenantId: dt.id }).first();
    const dplan = await db('plans').where({ id: dsub.planId }).first();
    ok(dplan.code === 'FIVERR_FREE' && dsub.status === 'ACTIVE' && new Date(dsub.currentPeriodEnd).getFullYear() > 2100, 'On the forever-free FIVERR_FREE plan');
    const stat = await req('GET', '/admin/demo', { token: adminTok });
    ok(stat.body.exists && stat.body.counts.orders === 0 && stat.body.channel === null, `Starts empty: no channel, no products, no orders (${JSON.stringify(stat.body.counts)})`);
    const startWh = await db('warehouses').where({ tenantId: setup.body.tenantId });
    ok(startWh.length === 1 && JSON.parse(startWh[0].address).pincode === '411019', 'The only thing it starts with is one warehouse that has a real address');
    ok(Number((await db('products').where({ tenantId: setup.body.tenantId }).count({ c: '*' }).first()).c) === 0, 'No products yet — the tester pulls them from the channel');
    ok(stat.body.tenant.loginEmail === demoEmail, 'Status shows the demo login email');

    // Real sellers can never switch a channel into demo mode.
    await req('PUT', `/channels/${chId}`, { token, body: { isDemo: true, name: 'Amazon India' } });
    const mk = await req('POST', '/channels', { token, body: { name: 'Sneaky', type: 'FLIPKART', isDemo: true } });
    ok((await db('channels').where({ id: chId }).first()).isDemo === 0, 'A seller cannot turn their real channel into a demo channel (PUT ignores isDemo)');
    ok(mk.status === 201 && (await db('channels').where({ id: mk.body.id }).first()).isDemo === 0, 'A seller cannot create a demo channel (POST ignores isDemo)');

    // The demo tenant works end to end, and never touches the network.
    const dl = await req('POST', '/auth/login', { body: { email: demoEmail, password: demoPass } });
    const dtok = dl.body.token;
    ok(dl.status === 200 && dtok, 'The demo seller can log in');
    const dme = await req('GET', '/auth/me', { token: dtok });
    ok(dme.status === 200 && dme.body.tenant?.id === dt.id, 'The demo seller is signed in to the demo tenant (and only that one)');
    const callsBefore = fake.calls.length;
    const demoJourney = async (tok, { verbose = false } = {}) => {
      const c = await req('POST', '/channels', { token: tok, body: { name: 'Amazon India', type: 'AMAZON' } });
      const id = c.body.id;
      const st = await req('GET', `/oauth/amazon/start?channelId=${id}&region=IN`, { token: tok });
      const au = await req('POST', '/oauth/amazon/demo-authorize', { token: tok, body: { channelId: id } });
      const pc = await req('POST', `/channels/${id}/pull-catalog`, { token: tok, body: {} });
      const sy = await req('POST', `/channels/${id}/sync/orders`, { token: tok, body: {} });
      return { id, c, st, au, pc, sy };
    };

    // A real seller's Amazon channel is never a demo channel, and cannot use the fake authorization.
    const realAmz = await req('POST', '/channels', { token, body: { name: 'Real Amazon 2', type: 'AMAZON' } });
    ok((await db('channels').where({ id: realAmz.body.id }).first()).isDemo === 0, 'With demo mode ON, a normal seller\'s Amazon channel is still a real one');
    ok((await req('POST', '/oauth/amazon/demo-authorize', { token, body: { channelId: realAmz.body.id } })).status === 403, 'A normal seller cannot use the fake "Authorize" (403)');
    const dFlip = await req('POST', '/channels', { token: await (async () => dtok)(), body: { name: 'Demo Flipkart', type: 'FLIPKART' } });
    ok(dFlip.status === 201 && (await db('channels').where({ id: dFlip.body.id }).first()).isDemo === 0, 'Only the Amazon channel is faked — other channels in the demo tenant stay real');
    await db('channels').where({ id: dFlip.body.id }).del();

    // ── The journey: connect → authorize → pull catalog → sync orders ──
    const cr = await req('POST', '/channels', { token: dtok, body: { name: 'Amazon India', type: 'AMAZON' } });
    const dch = await db('channels').where({ id: cr.body.id }).first();
    ok(cr.status === 201 && dch.isDemo === 1, 'Step 1 — the demo seller adds the Amazon channel; the server flags it as a demo channel');
    ok(!dch.credentials, 'It is not connected yet (no credentials)');
    const st0 = await req('GET', `/oauth/amazon/status?channelId=${dch.id}`, { token: dtok });
    ok(st0.body.connected === false, 'Status before authorizing: not connected');
    const start = await req('GET', `/oauth/amazon/start?channelId=${dch.id}&region=IN`, { token: dtok });
    ok(start.status === 200 && /\/demo\/amazon-consent\?channelId=/.test(start.body.url) && !/amazon\.in|amazon\.com/.test(start.body.url), `Step 2 — "Authorize with Amazon" sends them to Kartriq's FAKE consent page, not Amazon (${start.body.url.replace(/\?.*/, '')})`);
    const auth = await req('POST', '/oauth/amazon/demo-authorize', { token: dtok, body: { channelId: dch.id } });
    ok(auth.status === 200 && auth.body.connected === true, 'They click Authorize on the fake page');
    ok((await req('GET', `/oauth/amazon/status?channelId=${dch.id}`, { token: dtok })).body.connected === true, 'Status now says: connected (the polling modal would close)');
    const { decryptCredentials } = require('../utils/crypto');
    const storedCreds = decryptCredentials(JSON.parse((await db('channels').where({ id: dch.id }).first()).credentials));
    ok(storedCreds.demo === true && Object.keys(storedCreds).length === 1, 'Only a harmless placeholder is stored — no keys');
    const typed = await req('POST', `/channels/${dch.id}/connect`, { token: dtok, body: { refreshToken: 'Atzr|REAL-SECRET-TOKEN', clientId: 'x' } });
    const afterTyped = JSON.stringify(decryptCredentials(JSON.parse((await db('channels').where({ id: dch.id }).first()).credentials)));
    ok(typed.status === 200 && !afterTyped.includes('REAL-SECRET'), 'Even if someone types real keys into the demo, they are thrown away, never stored');
    const conn = await req('GET', `/channels/${dch.id}/test`, { token: dtok });
    ok(conn.status === 200 && /DEMO/.test(JSON.stringify(conn.body)), 'Connection test says it is a demo marketplace');
    const early = await req('POST', `/channels/${dch.id}/sync/orders`, { token: dtok, body: {} });
    ok(early.status === 200 && early.body.fetched === 0, 'Syncing orders BEFORE pulling the catalog brings nothing (orders need products first)');
    const pull = await req('POST', `/channels/${dch.id}/pull-catalog`, { token: dtok, body: {} });
    const prodCount = Number((await db('products').where({ tenantId: dt.id }).count({ c: '*' }).first()).c);
    ok(pull.status === 200 && prodCount === 3, `Step 3 — Pull catalog brings in 3 products (${prodCount})`);
    const fbaWhD = await db('warehouses').where({ tenantId: dt.id, externalSource: 'AMAZON_FBA' }).first();
    const widgetStock = await db('inventory_items as i').join('product_variants as v', 'v.id', 'i.variantId').where({ 'i.tenantId': dt.id, 'v.sku': 'DEMO-WIDGET' }).first();
    const fbaStock = await db('inventory_items as i').join('product_variants as v', 'v.id', 'i.variantId').where({ 'i.tenantId': dt.id, 'v.sku': 'DEMO-FBA-ITEM' }).first();
    ok(widgetStock && widgetStock.quantityOnHand === 120 && widgetStock.warehouseId === startWh[0].id, 'Merchant-fulfilled stock (120) lands in the tester\'s real warehouse');
    ok(fbaStock && fbaStock.quantityOnHand === 40 && fbaWhD && fbaStock.warehouseId === fbaWhD.id, 'FBA stock (40) lands in the virtual "Amazon FBA" facility');
    const sync1 = await req('POST', `/channels/${dch.id}/sync/orders`, { token: dtok, body: {} });
    ok(sync1.status === 200 && sync1.body.imported === 6, `Step 4 — Sync orders brings in the 6 demo orders (${sync1.body.imported})`);
    const sync2 = await req('POST', `/channels/${dch.id}/sync/orders`, { token: dtok, body: {} });
    ok(sync2.status === 200 && sync2.body.fetched === 0 && Number((await db('orders').where({ tenantId: dt.id }).count({ c: '*' }).first()).c) === 6, 'Syncing again adds nothing — no duplicates, no flood');
    const stat2 = await req('GET', '/admin/demo', { token: adminTok });
    ok(stat2.body.counts.orders === 6 && stat2.body.counts.mfn === 5 && stat2.body.counts.fba === 1 && stat2.body.channel?.id === dch.id, `Admin status now shows 6 orders = 5 MFN + 1 FBA and the channel (${JSON.stringify(stat2.body.counts)})`);

    await req('PUT', `/channels/${dch.id}`, { token: dtok, body: { autoBookShipping: true } });
    const dOrder = async (suffix) => db('orders').where({ tenantId: dt.id }).whereRaw('channelOrderId like ?', [`%-${suffix}`]).first();
    const m1 = await dOrder('MFN1'); const fbaD = await dOrder('FBA'); const errD = await dOrder('MFN5-ERR');
    ok(m1.fulfillmentType === 'SELF' && fbaD.fulfillmentType === 'CHANNEL', 'Demo orders: MFN1 is self-fulfilled, FBA is channel-fulfilled');
    const c1 = await req('PATCH', `/orders/${m1.id}/status`, { token: dtok, body: { status: 'CONFIRMED' } });
    ok(c1.body.shipping?.booked === true && c1.body.status === 'SHIPPED', `Confirm on a demo MFN order auto-books and ships it (${c1.body.status})`);
    ok(c1.body.shipping.chosen?.carrier === 'DemoPost' && c1.body.shipping.ratesConsidered === 3, `Cheapest of 3 demo couriers chosen (${c1.body.shipping.chosen?.carrier})`);
    ok(/^DEMO/.test(c1.body.trackingNumber || ''), `Demo tracking number (${c1.body.trackingNumber})`);
    const dpdf = await req('GET', `/orders/${m1.id}/label`, { token: dtok, raw: true });
    const dlabel = await PDFDocument.load(dpdf.buf);
    ok(dpdf.status === 200 && dlabel.getPageCount() === 1 && Math.round(dlabel.getPage(0).getWidth()) === 288, 'The saved demo label is a real 4×6 PDF');
    const err1 = await req('PATCH', `/orders/${errD.id}/status`, { token: dtok, body: { status: 'CONFIRMED' } });
    ok(err1.body.shipping?.error && /could not be verified/.test(err1.body.shipping.error) && err1.body.status === 'CONFIRMED', `The built-to-fail order shows a booking error and stays CONFIRMED ("${(err1.body.shipping?.error || '').slice(0, 60)}…")`);
    const retryErr = await req('POST', `/orders/${errD.id}/book-shipping`, { token: dtok, body: {} });
    ok(retryErr.status === 400, 'Retry on the built-to-fail order fails again, as designed (400)');
    const fbaTry = await req('PATCH', `/orders/${fbaD.id}/status`, { token: dtok, body: { status: 'CONFIRMED' } });
    ok(fbaTry.status === 400, 'FBA demo order cannot be confirmed by hand (400)');
    const unship = await req('DELETE', `/orders/${m1.id}/label`, { token: dtok });
    ok(unship.status === 200 && unship.body.orderReverted === true, 'Cancel label on a demo order un-ships it');
    const dBulk = await req('POST', '/orders/packing-slips', { token: dtok, body: { ids: [m1.id, fbaD.id] } });
    ok(dBulk.status === 200 && dBulk.body.printed === 1 && dBulk.body.skipped.length === 1, 'Bulk packing slips work on demo orders (FBA skipped)');
    ok(fake.calls.length === callsBefore, `The fake Amazon was NEVER called over the network during all of this (${fake.calls.length - callsBefore} calls)`);

    // Reset
    const dBeforeIds = (await db('orders').where({ tenantId: dt.id })).map((o) => o.id);
    await db('vendors').insert({ id: randomUUID(), tenantId: dt.id, name: 'Tester-made vendor', updatedAt: new Date() }).catch(() => {});
    const rs = await req('POST', '/admin/demo/reset', { token: adminTok, body: {} });
    ok(rs.status === 200, `Reset succeeds (${rs.status})`);
    ok(Number((await db('orders').where({ tenantId: dt.id }).count({ c: '*' }).first()).c) === 0 && (await db('channels').where({ tenantId: dt.id })).length === 0, 'After reset: no channel, no orders — back to the very start');
    ok(Number((await db('products').where({ tenantId: dt.id }).count({ c: '*' }).first()).c) === 0 && Number((await db('order_labels').where({ tenantId: dt.id }).count({ c: '*' }).first()).c) === 0, 'No products, no labels');
    ok(Number((await db('vendors').where({ tenantId: dt.id }).count({ c: '*' }).first()).c) === 0, 'Data a tester added (a vendor) is cleared too');
    ok((await db('warehouses').where({ tenantId: dt.id })).length === 1, 'One fresh warehouse with an address is back');
    const again = await demoJourney(dtok);
    const dAfter = await db('orders').where({ tenantId: dt.id });
    ok(again.au.status === 200 && again.pc.status === 200 && again.sy.body.imported === 6 && dAfter.length === 6, 'The whole journey can be done again after a reset (connect → catalog → 6 orders)');
    ok(dAfter.every((o) => !dBeforeIds.includes(o.id)) && dAfter.every((o) => o.status === 'PROCESSING'), 'All 6 orders are brand new and PROCESSING');
    const dch2 = await db('channels').where({ tenantId: dt.id, isDemo: 1 });
    ok(dch2.length === 1 && dch2[0].autoBookShipping === 0, 'Exactly one demo channel, auto-book switched back OFF');
    const dl2 = await req('POST', '/auth/login', { body: { email: demoEmail, password: demoPass } });
    ok(dl2.status === 200, 'The demo login still works after a reset');
    const sellerOrdersAfter = Number((await db('orders').where({ tenantId }).count({ c: '*' }).first()).c);
    ok(sellerOrdersAfter === sellerOrdersBefore, `Reset never touched another seller's data (${sellerOrdersBefore} → ${sellerOrdersAfter} orders)`);

    // If the server turns demo mode off, the demo channel must not fall back to real Amazon.
    process.env.DEMO_MODE_ENABLED = 'false';
    const d2tok = (await req('POST', '/auth/login', { body: { email: demoEmail, password: demoPass } })).body.token;
    const dch3 = await db('channels').where({ tenantId: dt.id, isDemo: 1 }).first();
    const sync = await req('POST', `/channels/${dch3.id}/sync/orders`, { token: d2tok, body: {} });
    ok(sync.status >= 400 && /not enabled/i.test(JSON.stringify(sync.body)), `With demo mode OFF the demo channel refuses to run (${sync.status})`);
    ok(fake.calls.length === callsBefore, 'And it never fell back to calling real Amazon');
    ok((await req('POST', '/admin/demo/reset', { token: adminTok, body: {} })).status === 403, 'Reset is refused while demo mode is OFF (403)');
    process.env.DEMO_MODE_ENABLED = 'true';
    await db('tenants').where({ id: dt.id }).update({ isDemo: 0 }); // leave the DB clean for the next run
    await db('channels').where({ tenantId: dt.id }).update({ isDemo: 0 });
  }

  // ── Result ───────────────────────────────────────────────────────────────
  console.log(`\n\x1b[1mResult: ${passed} passed, ${failed} failed\x1b[0m`);
  if (failed) { console.log('\nFailures:'); failures.forEach((f) => console.log('  - ' + f)); }
  await db.destroy().catch(() => {});
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('\nTEST CRASHED:', e); process.exit(1); });
