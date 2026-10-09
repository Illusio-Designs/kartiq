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
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const http = require('http');
const zlib = require('zlib');
const axios = require('axios');

// ───────────────────────── Fake Amazon (SP-API) ─────────────────────────────
const fake = {
  calls: [],            // every request Kartriq made to "Amazon"
  orders: [],           // what GET /orders/v0/orders returns
  mode: 'ok',           // ok | noRates | buyFails
  goodRefreshToken: 'Atzr|GOOD',
  nextShipment: 1,
  rates: [
    { id: 'svc-express', offer: 'off-express', name: 'Express', carrier: 'FastCo', amount: 140, eta: '2026-10-12T00:00:00Z' },
    { id: 'svc-cheap',   offer: 'off-cheap',   name: 'Standard', carrier: 'SlowCo', amount: 62.5, eta: '2026-10-16T00:00:00Z' },
    { id: 'svc-mid',     offer: 'off-mid',     name: 'Surface', carrier: 'MidCo',  amount: 95, eta: '2026-10-14T00:00:00Z' },
  ],
};
const callsTo = (re) => fake.calls.filter((c) => re.test(`${c.method} ${c.path}`));

function amazonResponse(config, status, data) {
  const res = { data, status, statusText: String(status), headers: {}, config, request: {} };
  if (status >= 200 && status < 300) return Promise.resolve(res);
  const err = new Error(`Request failed with status code ${status}`);
  err.isAxiosError = true; err.config = config; err.response = res;
  return Promise.reject(err);
}

const realAdapter = axios.defaults.adapter;
axios.defaults.adapter = (config) => {
  const url = new URL(config.url, config.baseURL || 'http://x');
  const isAmazon = /amazon\.com|amazon\.in|amazonaws\.com/.test(url.host);
  if (!isAmazon) return realAdapter(config); // anything else is a real call
  const method = String(config.method || 'get').toUpperCase();
  const path = url.pathname;
  let body = config.data;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* leave */ } }
  fake.calls.push({ method, path, body, params: config.params });

  // Login with Amazon (token exchange)
  if (/auth\/o2\/token/.test(url.href)) {
    if (!body || body.refresh_token !== fake.goodRefreshToken) {
      return amazonResponse(config, 400, {
        error: 'invalid_grant',
        error_description: 'The request has an invalid grant parameter : refresh_token. User may have revoked or didn\'t grant the permission.',
      });
    }
    return amazonResponse(config, 200, { access_token: 'AT', expires_in: 3600 });
  }
  if (/restrictedDataToken/.test(path)) return amazonResponse(config, 200, { restrictedDataToken: 'RDT' });

  if (method === 'GET' && path === '/orders/v0/orders') {
    return amazonResponse(config, 200, { payload: { Orders: fake.orders } });
  }
  let m = path.match(/^\/orders\/v0\/orders\/([^/]+)\/orderItems$/);
  if (m) {
    const o = fake.orders.find((x) => x.AmazonOrderId === m[1]);
    return amazonResponse(config, 200, { payload: { OrderItems: o ? o._items : [] } });
  }
  if (/\/address$|\/buyerInfo$/.test(path)) return amazonResponse(config, 200, { payload: {} });

  if (method === 'POST' && path === '/mfn/v0/eligibleShippingServices') {
    if (fake.mode === 'noRates') return amazonResponse(config, 200, { payload: { ShippingServiceList: [] } });
    return amazonResponse(config, 200, {
      payload: {
        ShippingServiceList: fake.rates.map((r) => ({
          ShippingServiceId: r.id, ShippingServiceOfferId: r.offer, ShippingServiceName: r.name,
          CarrierName: r.carrier, Rate: { Amount: r.amount, CurrencyCode: 'INR' }, LatestEstimatedDeliveryDate: r.eta,
        })),
      },
    });
  }
  if (method === 'POST' && path === '/mfn/v0/shipments') {
    if (fake.mode === 'buyFails') {
      return amazonResponse(config, 400, { errors: [{ code: 'InvalidInput', message: 'Address could not be verified' }] });
    }
    const chosen = fake.rates.find((r) => r.id === body.ShippingServiceId);
    const n = fake.nextShipment++;
    const pdf = Buffer.from(`%PDF-1.4 FAKE-LABEL-${n}`);
    return amazonResponse(config, 200, {
      payload: {
        ShipmentId: `SHIP-${n}`, TrackingId: `TRK${1000 + n}`, Status: 'Purchased',
        ShippingService: {
          CarrierName: chosen?.carrier, ShippingServiceName: chosen?.name,
          Rate: { Amount: chosen?.amount, CurrencyCode: 'INR' },
        },
        Label: { FileContents: { Contents: zlib.gzipSync(pdf).toString('base64'), FileType: 'application/pdf' } },
      },
    });
  }
  if (method === 'DELETE' && /^\/mfn\/v0\/shipments\//.test(path)) return amazonResponse(config, 200, { payload: {} });

  return amazonResponse(config, 404, { errors: [{ message: `fake Amazon: no route for ${method} ${path}` }] });
};

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

function amazonOrder(id, fc, sku, qty, price) {
  return {
    AmazonOrderId: id, FulfillmentChannel: fc, OrderStatus: 'Unshipped',
    PurchaseDate: new Date().toISOString(), OrderTotal: { Amount: String(qty * price), CurrencyCode: 'INR' },
    PaymentMethod: 'Other', ShipmentServiceLevelCategory: 'Standard',
    ShippingAddress: { Name: 'Test Buyer', AddressLine1: '12 MG Road', City: 'Pune', StateOrRegion: 'MH', PostalCode: '411001', CountryCode: 'IN' },
    BuyerInfo: { BuyerName: 'Test Buyer', BuyerEmail: `${id}@marketplace.amazon.in` },
    _items: [{
      SellerSKU: sku, ASIN: 'B0TEST', Title: 'Test Widget', QuantityOrdered: qty,
      ItemPrice: { Amount: String(qty * price), CurrencyCode: 'INR' },
    }],
  };
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
  ok(pdf.buf.toString().startsWith('%PDF-1.4 FAKE-LABEL-1'), 'Label bytes are exactly what Amazon sent (gunzipped correctly)');
  const pdf2 = await req('GET', `/orders/${mfn2.id}/label`, { token, raw: true });
  ok(pdf2.status === 200 && pdf2.buf.equals(pdf.buf), 'Label can be re-printed any time (same bytes again)');

  const stAfter = await stock();
  ok(stAfter.quantityOnHand === stBefore.quantityOnHand - 2, `Stock deducted on ship: on-hand ${stBefore.quantityOnHand} → ${stAfter.quantityOnHand}`);
  ok(stAfter.quantityReserved === stBefore.quantityReserved - 2, `Reservation released (${stBefore.quantityReserved} → ${stAfter.quantityReserved})`);

  // ── 6. Idempotency ───────────────────────────────────────────────────────
  group('6. No double-buying');
  const again = await req('PATCH', `/orders/${mfn2.id}/status`, { token, body: { status: 'CONFIRMED' } });
  const retry = await req('POST', `/orders/${mfn2.id}/book-shipping`, { token, body: {} });
  ok(retry.status === 409 && /already/.test(JSON.stringify(retry.body)), `Retry on an order that has a label is refused (${retry.status})`);
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

  // ── 11. Cancel label ─────────────────────────────────────────────────────
  group('11. Cancel a label');
  fake.calls.length = 0;
  const del = await req('DELETE', `/orders/${mfn2.id}/label`, { token });
  ok(del.status === 200 && del.body.cancelled === true, `Label cancelled (${del.status})`);
  ok(callsTo(/DELETE \/mfn\/v0\/shipments\/SHIP-1/).length === 1, 'Amazon was told to void shipment SHIP-1');
  ok((await db('order_labels').where({ orderId: mfn2.id }).first()).status === 'CANCELLED', 'Local label marked CANCELLED (history kept)');
  const gone = await req('GET', `/orders/${mfn2.id}/label`, { token });
  ok(gone.status === 404, `Cancelled label is no longer downloadable (${gone.status})`);

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

  // ── Result ───────────────────────────────────────────────────────────────
  console.log(`\n\x1b[1mResult: ${passed} passed, ${failed} failed\x1b[0m`);
  if (failed) { console.log('\nFailures:'); failures.forEach((f) => console.log('  - ' + f)); }
  await db.destroy().catch(() => {});
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('\nTEST CRASHED:', e); process.exit(1); });
