// A stand-in for Amazon's SP-API (Login with Amazon, Orders, Buy Shipping).
// Replaces axios's transport so the REAL Kartriq adapter code runs end-to-end
// with no Amazon account or network. Shared by the automated test
// (test.amazon-shipping.js) and the click-through demo (demo.amazon-shipping.js).
// Records every call it receives in `fake.calls`.

const zlib = require('zlib');
const axios = require('axios');

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
function fakeAdapter(config) {
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
