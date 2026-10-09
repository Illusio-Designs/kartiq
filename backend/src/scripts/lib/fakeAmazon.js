// A stand-in for Amazon's SP-API (Login with Amazon, Orders, Buy Shipping, Easy
// Ship, Feeds) and for the seller's own couriers (iThink, Shiprocket, Delhivery,
// Xpressbees). Replaces axios's transport so the REAL Kartriq adapter code runs
// end-to-end with no accounts or network. Used by the automated test
// (test.amazon-shipping.js). Records every call it receives in `fake.calls`.

const zlib = require('zlib');
const axios = require('axios');

const fake = {
  calls: [],            // every request Kartriq made to "Amazon"
  orders: [],           // what GET /orders/v0/orders returns
  mode: 'ok',           // ok | noRates | buyFails
  goodRefreshToken: 'Atzr|GOOD',
  nextShipment: 1,
  labelType: 'PDF',     // PDF | PNG | ZPL — what the next purchased label is
  deny: [],             // regexes of `METHOD /path` that answer 403 (missing role)
  labels: {},           // shipmentId -> the exact bytes Amazon "sent"
  easyShip: { mode: 'ok', nextPkg: 1, packages: {}, labelMode: 'ok' }, // mode: ok | noSlots ; labelMode: ok | fails
  courier: { mode: 'ok', n: 1, status: {}, cancelled: [], labelMode: 'ok' }, // status: awb -> raw status text
  rates: [
    { id: 'svc-express', offer: 'off-express', name: 'Express', carrier: 'FastCo', amount: 140, eta: '2026-10-12T00:00:00Z' },
    { id: 'svc-cheap',   offer: 'off-cheap',   name: 'Standard', carrier: 'SlowCo', amount: 62.5, eta: '2026-10-16T00:00:00Z' },
    { id: 'svc-mid',     offer: 'off-mid',     name: 'Surface', carrier: 'MidCo',  amount: 95, eta: '2026-10-14T00:00:00Z' },
  ],
};
// 1×1 red PNG, for the PNG-label case.
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// The label Amazon "returns": a real one-page PDF (300×450 pt, with the order id
// printed on it) by default; fake.labelType switches to a PNG or ZPL label.
async function makeLabel(n, amazonOrderId) {
  if (fake.labelType === 'PNG') return { bytes: TINY_PNG, fileType: 'image/png' };
  if (fake.labelType === 'ZPL') return { bytes: Buffer.from(`^XA^FO20,20^FDFAKE-LABEL-${n}^FS^XZ`), fileType: 'ZPL203' };
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 450]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(`FAKE-LABEL-${n}`, { x: 20, y: 400, size: 18, font });
  page.drawText(String(amazonOrderId || ''), { x: 20, y: 370, size: 12, font });
  return { bytes: Buffer.from(await doc.save()), fileType: 'application/pdf' };
}

const callsTo = (re) => fake.calls.filter((c) => re.test(`${c.method} ${c.path}`));

function amazonResponse(config, status, data) {
  const res = { data, status, statusText: String(status), headers: {}, config, request: {} };
  if (status >= 200 && status < 300) return Promise.resolve(res);
  const err = new Error(`Request failed with status code ${status}`);
  err.isAxiosError = true; err.config = config; err.response = res;
  return Promise.reject(err);
}

const COURIER_HOST = /ithinklogistics\.com|shiprocket\.in|delhivery\.com|xpressbees\.com/;

async function pdfBytes(text) {
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([288, 432]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(String(text), { x: 20, y: 400, size: 14, font });
  return Buffer.from(await doc.save());
}

// The seller's own couriers. Each answers the endpoints our adapter calls.
function fakeCourier(config, url, method, body) {
  const c = fake.courier;
  const path = url.pathname;
  fake.calls.push({ method, path, body, params: config.params, host: url.host });
  const bad = () => amazonResponse(config, 400, { message: 'Courier says: pincode not serviceable' });
  // label files (a courier-hosted PDF link)
  if (method === 'GET' && /\/fakelabels\//.test(path)) {
    if (c.labelMode === 'fails') return amazonResponse(config, 500, {});
    return pdfBytes(`COURIER-LABEL ${path.split('/').pop()}`).then((b) => { const r = amazonResponse(config, 200, b); return r; });
  }
  if (/ithinklogistics/.test(url.host)) {
    const d = body?.data || {};
    if (/warehouse\/get/.test(path)) return amazonResponse(config, 200, { status: 'success', data: [{ id: '77' }] });
    if (/order\/add\.json/.test(path)) {
      if (c.mode === 'bookFails') return amazonResponse(config, 200, { status: 'error', data: { 1: { status: 'Error', remark: 'Invalid pincode' } } });
      const n = c.n++;
      return amazonResponse(config, 200, { status: 'success', data: { 1: { status: 'success', refnum: `ITH-REF-${n}`, waybill: `ITH${5000 + n}`, logistic_name: 'Ekart' } } });
    }
    if (/shipping\/label/.test(path)) return amazonResponse(config, 200, { status: 'success', file_name: `https://my.ithinklogistics.com/fakelabels/${d.awb_numbers}.pdf` });
    if (/order\/track/.test(path)) return amazonResponse(config, 200, { status: 'success', data: { [d.awb_number_list]: { current_status: c.status[d.awb_number_list] || 'Manifested' } } });
    if (/order\/cancel/.test(path)) {
      if (c.mode === 'cancelFails') return amazonResponse(config, 200, { status: 'success', data: { 1: { status: 'error', remark: 'Already picked up' } } });
      c.cancelled.push(d.awb_numbers); return amazonResponse(config, 200, { status: 'success', data: { 1: { status: 'success' } } });
    }
  }
  if (/shiprocket/.test(url.host)) {
    if (/auth\/login/.test(path)) return amazonResponse(config, 200, { token: 'SRTOKEN' });
    if (/orders\/create\/adhoc/.test(path)) { if (c.mode === 'bookFails') return bad(); const n = c.n++; return amazonResponse(config, 200, { order_id: 900 + n, shipment_id: 800 + n, awb_code: null }); }
    if (/courier\/assign\/awb/.test(path)) { const sid = body.shipment_id[0]; return amazonResponse(config, 200, { response: { data: { awb_code: `SR${sid}`, courier_name: 'Blue Dart' } } }); }
    if (/courier\/generate\/pickup/.test(path)) return amazonResponse(config, 200, { response: { pickup_status: 1, pickup_scheduled_date: '2026-10-10' } });
    if (/courier\/generate\/label/.test(path)) return amazonResponse(config, 200, { label_created: 1, label_url: `https://files.shiprocket.in/fakelabels/${body.shipment_id[0]}.pdf` });
    if (/courier\/track\/awb/.test(path)) return amazonResponse(config, 200, { tracking_data: { track_status: 1, shipment_track: [{ courier_name: 'Blue Dart', current_status: c.status[path.split('/').pop()] || 'Pickup Scheduled' }] } });
    if (/orders\/cancel\/shipment\/awbs/.test(path)) { c.cancelled.push(...body.awbs); return amazonResponse(config, 200, { message: 'cancelled' }); }
  }
  if (/delhivery/.test(url.host)) {
    if (/cmu\/create/.test(path)) {
      if (c.mode === 'bookFails') return amazonResponse(config, 200, { packages: [{ status: 'Fail', remarks: ['Pincode not serviceable'] }] });
      const n = c.n++; return amazonResponse(config, 200, { packages: [{ waybill: `DL${7000 + n}`, status: 'Success' }] });
    }
    if (/packages\/json/.test(path)) return amazonResponse(config, 200, { ShipmentData: [{ Shipment: { Status: { Status: c.status[config.params?.waybill] || 'Manifested' } } }] });
    if (/edit-plan/.test(path)) { c.cancelled.push(body.waybill); return amazonResponse(config, 200, { status: true }); }
  }
  if (/xpressbees/.test(url.host)) {
    if (/users\/login/.test(path)) return amazonResponse(config, 200, { data: 'XBTOKEN' });
    if (/shipments2\/track/.test(path)) return amazonResponse(config, 200, { data: { status: c.status[path.split('/').pop()] || 'Booked', history: [] } });
    if (/shipments2\/cancel/.test(path)) { c.cancelled.push(body.awb); return amazonResponse(config, 200, { status: true }); }
    if (/shipments2$/.test(path)) { if (c.mode === 'bookFails') return bad(); const n = c.n++; return amazonResponse(config, 200, { data: { awb_number: `XB${3000 + n}`, shipment_id: `XBS${n}` } }); }
  }
  return amazonResponse(config, 404, { message: `fake courier: no route for ${method} ${url.host}${path}` });
}

// Easy Ship (India) + Feeds (label document) + the S3-style upload/download hosts.
function fakeEasyShip(config, url, method, path, body) {
  const e = fake.easyShip;
  if (method === 'POST' && path === '/easyShip/2022-03-23/timeSlot') {
    if (e.mode === 'noSlots') return amazonResponse(config, 200, { timeSlots: [] });
    return amazonResponse(config, 200, { timeSlots: [
      { slotId: 'slot-1', startTime: '2026-10-10T10:00:00Z', endTime: '2026-10-10T13:00:00Z', handoverMethod: 'Pickup' },
      { slotId: 'slot-2', startTime: '2026-10-10T14:00:00Z', endTime: '2026-10-10T17:00:00Z', handoverMethod: 'Pickup' },
    ] });
  }
  if (method === 'POST' && path === '/easyShip/2022-03-23/package') {
    const n = e.nextPkg++;
    const pkg = { packageId: `PKG-${n}`, trackingId: `ESY${9000 + n}`, packageStatus: 'ReadyForPickup', amazonOrderId: body.amazonOrderId };
    e.packages[pkg.packageId] = pkg;
    return amazonResponse(config, 200, { scheduledPackageId: { amazonOrderId: body.amazonOrderId, packageId: pkg.packageId }, packageStatus: pkg.packageStatus, trackingDetails: { trackingId: pkg.trackingId }, packageTimeSlot: body.packageDetails.packageTimeSlot });
  }
  if (method === 'GET' && path === '/easyShip/2022-03-23/package') {
    const pkg = e.packages[config.params?.packageId];
    if (!pkg) return amazonResponse(config, 404, { errors: [{ message: 'no such package' }] });
    return amazonResponse(config, 200, { scheduledPackageId: { packageId: pkg.packageId }, packageStatus: pkg.packageStatus, trackingDetails: { trackingId: pkg.trackingId } });
  }
  if (method === 'DELETE' && path === '/easyShip/2022-03-23/package') {
    const pkg = e.packages[config.params?.packageId]; if (pkg) pkg.packageStatus = 'LabelCanceled';
    return amazonResponse(config, 204, {});
  }
  if (method === 'GET' && path === '/feeds/2021-06-30/feeds') return amazonResponse(config, 200, { feeds: [] });
  if (method === 'POST' && path === '/feeds/2021-06-30/documents') return amazonResponse(config, 200, { feedDocumentId: 'FD-IN', url: 'https://tm-s3.amazonaws.com/upload/FD-IN' });
  if (method === 'PUT' && /\/upload\//.test(path)) return amazonResponse(config, 200, {});
  if (method === 'POST' && path === '/feeds/2021-06-30/feeds') { fake.feedBody = body; return amazonResponse(config, 200, { feedId: 'FEED-1' }); }
  if (method === 'GET' && /^\/feeds\/2021-06-30\/feeds\//.test(path)) {
    if (e.labelMode === 'fails') return amazonResponse(config, 200, { processingStatus: 'FATAL' });
    return amazonResponse(config, 200, { processingStatus: 'DONE', resultFeedDocumentId: 'FD-OUT' });
  }
  if (method === 'GET' && /^\/feeds\/2021-06-30\/documents\//.test(path)) return amazonResponse(config, 200, { url: 'https://tm-s3.amazonaws.com/download/FD-OUT' });
  if (method === 'GET' && /\/download\//.test(path)) return pdfBytes('EASYSHIP-LABEL').then((b) => amazonResponse(config, 200, b));
  return null;
}

const realAdapter = axios.defaults.adapter;
function fakeAdapter(config) {
  const url = new URL(config.url, config.baseURL || 'http://x');
  if (COURIER_HOST.test(url.host)) {
    let b = config.data;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { /* leave */ } }
    return fakeCourier(config, url, String(config.method || 'get').toUpperCase(), b);
  }
  const isAmazon = /amazon\.com|amazon\.in|amazonaws\.com/.test(url.host);
  if (!isAmazon) return realAdapter(config); // anything else is a real call
  const method = String(config.method || 'get').toUpperCase();
  const path = url.pathname;
  let body = config.data;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* leave */ } }
  fake.calls.push({ method, path, body, params: config.params });
  if (fake.deny.some((re) => re.test(`${method} ${path}`))) return amazonResponse(config, 403, { errors: [{ code: 'Unauthorized', message: 'Access to requested resource is denied.' }] });
  { const es = fakeEasyShip(config, url, method, path, body); if (es) return es; }

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
  if (/restrictedDataToken/.test(path)) { if (fake.noPii && /address|buyerInfo/.test(JSON.stringify(body))) return amazonResponse(config, 403, { errors: [{ message: 'Unauthorized: PII role missing' }] }); return amazonResponse(config, 200, { restrictedDataToken: 'RDT' }); }

  if (method === 'GET' && path === '/fba/inventory/v1/summaries') return amazonResponse(config, 200, { payload: { inventorySummaries: [] } });
  if (method === 'GET' && /^\/mfn\/v0\/shipments\//.test(path)) return amazonResponse(config, 404, { errors: [{ message: 'not found' }] });
  if (method === 'GET' && path === '/orders/v0/orders') {
    return amazonResponse(config, 200, { payload: { Orders: fake.orders } });
  }
  let m = path.match(/^\/orders\/v0\/orders\/([^/]+)\/orderItems$/);
  if (m) {
    const o = fake.orders.find((x) => x.AmazonOrderId === m[1]);
    return amazonResponse(config, 200, { payload: { OrderItems: o ? o._items : [] } });
  }
  if (method === 'GET' && path === '/sellers/v1/marketplaceParticipations') return amazonResponse(config, 200, { payload: [{ marketplace: { name: 'Amazon.in' } }] });
  if (method === 'POST' && /\/shipmentConfirmation$/.test(path)) return amazonResponse(config, 204, {});
  m = path.match(/^\/orders\/v0\/orders\/([^/]+)$/);
  if (method === 'GET' && m) {
    const o = fake.orders.find((x) => x.AmazonOrderId === m[1]);
    return o ? amazonResponse(config, 200, { payload: Object.fromEntries(Object.entries(o).filter(([k]) => k !== '_items')) }) : amazonResponse(config, 404, { errors: [{ message: 'no such order' }] });
  }
  m = path.match(/^\/orders\/v0\/orders\/([^/]+)\/address$/);
  if (m) { if (fake.noPii) return amazonResponse(config, 403, { errors: [{ message: 'Access denied' }] }); const o = fake.orders.find((x) => x.AmazonOrderId === m[1]); return amazonResponse(config, 200, { payload: { AmazonOrderId: m[1], ShippingAddress: o ? { ...o.ShippingAddress, Phone: '9876543210' } : null } }); }
  m = path.match(/^\/orders\/v0\/orders\/([^/]+)\/buyerInfo$/);
  if (m) { const o = fake.orders.find((x) => x.AmazonOrderId === m[1]); return amazonResponse(config, 200, { payload: { AmazonOrderId: m[1], BuyerEmail: o?.BuyerInfo?.BuyerEmail, BuyerName: o?.BuyerInfo?.BuyerName } }); }
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
    return makeLabel(n, body.ShipmentRequestDetails?.AmazonOrderId).then(({ bytes, fileType }) => {
      fake.labels[`SHIP-${n}`] = bytes;
      return amazonResponse(config, 200, {
        payload: {
          ShipmentId: `SHIP-${n}`, TrackingId: `TRK${1000 + n}`, Status: 'Purchased',
          ShippingService: {
            CarrierName: chosen?.carrier, ShippingServiceName: chosen?.name,
            Rate: { Amount: chosen?.amount, CurrencyCode: 'INR' },
          },
          Label: { FileContents: { Contents: zlib.gzipSync(bytes).toString('base64'), FileType: fileType } },
        },
      });
    });
  }
  if (method === 'DELETE' && /^\/mfn\/v0\/shipments\//.test(path)) return amazonResponse(config, 200, { payload: {} });

  return amazonResponse(config, 404, { errors: [{ message: `fake Amazon: no route for ${method} ${path}` }] });
}

// Route all Amazon-bound axios calls to the fake; everything else stays real.
function install() { axios.defaults.adapter = fakeAdapter; }

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


module.exports = { fake, callsTo, install, amazonOrder };
