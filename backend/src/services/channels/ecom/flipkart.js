const axios = require('axios');
const settings = require('../../settings.service');
const { getEndpoint } = require('../../../config/channel-endpoints');

// Per-tenant credentials shape (set by /oauth/flipkart/callback):
//   { accessToken, refreshToken, expiresAt }
// Legacy per-tenant shape (for back-compat): { appId, appSecret }
// Global OAuth app creds come from Admin → Settings → Flipkart:
//   flipkart.appId, flipkart.appSecret
//
// Endpoint flips with CHANNEL_MODE in .env (production ↔ sandbox).
//
// Order Management API v3 is SHIPMENT-centric (docs: seller.flipkart.com/api-docs):
//   search   POST /v3/shipments/filter       (preDispatch / postDispatch / cancelled)
//   details  GET  /v3/shipments?shipmentIds=
//   pack     POST /v3/shipments/labels       (moves to Packed, generates label + invoice)
//   label    GET  /v3/shipments/{id}/labels  (PDF)
//   RTD      POST /v3/shipments/dispatch     (ready to dispatch)
//   stock    POST /listings/v3/update/inventory  (≤10 SKUs, per location)
// UNVERIFIED: these paths come from Flipkart's published reference as summarised by
// third parties; request/response field names were NOT checked against a live or
// sandbox account (Flipkart gives sandbox access only via a support ticket). Every
// shape-dependent line is in this one file — fix it here after the first sandbox run.
// For a Flipkart order, orders.channelOrderId is the SHIPMENT id and
// orders.channelFulfillmentCenter is the Flipkart location id (LOC…).

const BASE_URL = getEndpoint('FLIPKART', 'api');
const AUTH_URL = getEndpoint('FLIPKART', 'auth');

class FlipkartAdapter {
  constructor(credentials) {
    this.creds = credentials || {};
    this._accessToken = credentials?.accessToken || null;
    this._tokenExpiry = credentials?.expiresAt ? Date.parse(credentials.expiresAt) : null;
  }

  async _getAppCreds() {
    const appId     = this.creds.appId     || (await settings.get('flipkart.appId'));
    const appSecret = this.creds.appSecret || (await settings.get('flipkart.appSecret'));
    if (!appId || !appSecret) throw new Error('Flipkart app credentials not configured. Set flipkart.appId + flipkart.appSecret in Admin → Settings.');
    return { appId, appSecret };
  }

  async _getAccessToken() {
    if (this._accessToken && this._tokenExpiry && this._tokenExpiry > Date.now()) {
      return this._accessToken;
    }
    const { appId, appSecret } = await this._getAppCreds();

    // If the tenant authorised via OAuth we have a refreshToken — use it.
    // Otherwise fall back to client_credentials (legacy private-app flow).
    const grant = this.creds.refreshToken
      ? { grant_type: 'refresh_token', refresh_token: this.creds.refreshToken }
      : { grant_type: 'client_credentials', scope: 'Seller_Api' };

    const { data } = await axios.post(AUTH_URL, null, {
      params: grant,
      auth: { username: appId, password: appSecret },
    });
    this._accessToken = data.access_token;
    this._tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this._accessToken;
  }

  async _request(method, path, data = null, params = {}) {
    const token = await this._getAccessToken();
    const resp = await axios({
      method,
      url: `${BASE_URL}${path}`,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      params,
      data,
    });
    return resp.data;
  }

  get locationId() { return this.creds.locationId || null; }

  async testConnection() {
    await this._getAccessToken(); // proves the Application ID / Secret
    const data = await this._request('POST', '/v3/shipments/filter/', {
      filter: { type: 'preDispatch' }, pagination: { pageSize: 1 },
    });
    return { success: true, openShipments: (data.shipments || []).length, locationConfigured: !!this.locationId };
  }

  // Seller-fulfilled shipments that still need work (pack / dispatch), newest page(s) first.
  async fetchOrders(sinceDate) {
    const body = {
      filter: {
        type: 'preDispatch',
        ...(sinceDate ? { orderDate: { from: new Date(sinceDate).toISOString() } } : {}),
      },
      pagination: { pageSize: 20 },
      sort: { field: 'dispatchByDate', order: 'asc' },
    };
    const out = [];
    let data = await this._request('POST', '/v3/shipments/filter/', body);
    for (let page = 0; page < 5; page++) { // ≤100 shipments per sync; the next sync continues
      for (const sh of data.shipments || []) out.push(this._transformShipment(sh));
      if (!data.hasMore || !data.nextPageUrl) break;
      data = await this._request('GET', String(data.nextPageUrl).replace(/^https?:\/\/[^/]+/, '').replace(/^\/?sellers/, ''));
    }
    return out;
  }

  async getShipments(ids) {
    const list = Array.isArray(ids) ? ids : [ids];
    const data = await this._request('GET', '/v3/shipments', null, { shipmentIds: list.join(',') });
    return data.shipments || [];
  }

  // Current Flipkart status text + tracking for one shipment.
  async getShipmentStatus(shipmentId) {
    const [sh] = await this.getShipments(shipmentId);
    if (!sh) throw new Error(`Flipkart has no shipment ${shipmentId}`);
    const item = (sh.orderItems || [])[0] || {};
    return {
      status: sh.status || item.status || null,
      trackingNumber: sh.trackingId || sh.trackingNumber || sh.packageDetails?.trackingId || item.trackingId || null,
      courier: sh.courierName || sh.serviceProfile || sh.packageDetails?.courierName || null,
    };
  }

  // Confirm step 1+2: "labels" packs the shipment and generates label + invoice;
  // then the PDF is downloaded. Safe to repeat for an already-packed shipment.
  async packAndGetLabel(shipmentId, locationId = null) {
    const loc = locationId || this.locationId;
    if (!loc) throw new Error('Flipkart location id is missing — add it (LOC…) in Manage channel');
    await this._request('POST', '/v3/shipments/labels', { shipments: [{ shipmentId, locationId: loc }] });
    const label = await this.getLabel(shipmentId);
    const st = await this.getShipmentStatus(shipmentId).catch(() => ({}));
    return { ...st, label };
  }

  async getLabel(shipmentId) {
    const token = await this._getAccessToken();
    const resp = await axios({
      method: 'GET', url: `${BASE_URL}/v3/shipments/${encodeURIComponent(shipmentId)}/labels`,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' }, responseType: 'arraybuffer',
    });
    const buf = Buffer.from(resp.data);
    if (!buf.length) throw new Error('Flipkart returned an empty label');
    return { contentBase64: buf.toString('base64'), mime: String(resp.headers?.['content-type'] || 'application/pdf').split(';')[0] };
  }

  // Confirm step 3: tell Flipkart the parcel is packed and ready for its courier.
  async markReadyToDispatch(shipmentId, locationId = null) {
    const loc = locationId || this.locationId;
    if (!loc) throw new Error('Flipkart location id is missing — add it (LOC…) in Manage channel');
    await this._request('POST', '/v3/shipments/dispatch', { shipments: [{ shipmentId, locationId: loc }] });
    return { dispatched: true };
  }

  // Stock per SKU. Flipkart takes ≤10 SKUs per call and needs the location id.
  async updateInventoryLevel(sku, quantity) {
    if (!this.locationId) throw new Error('Flipkart location id is missing — add it (LOC…) in Manage channel');
    await this._request('POST', '/listings/v3/update/inventory', {
      [sku]: { locations: [{ id: this.locationId, inventory: Math.max(0, Math.floor(Number(quantity) || 0)) }] },
    });
    return { updated: true, sku };
  }

  // Update listing — Flipkart v3 Listings API
  async updateListing(sku, fields) {
    const payload = { skuId: sku };
    if (fields.qty !== undefined) payload.available = { inventory_count: fields.qty };
    if (fields.price !== undefined) payload.price = { mrp: fields.mrp || fields.price, selling_price: fields.price };
    if (fields.title !== undefined) payload.description = { title: fields.title };
    if (fields.images !== undefined) payload.images = fields.images.map(url => ({ url }));
    const data = await this._request('PUT', `/v3/listings/${sku}`, payload);
    return { channel: 'FLIPKART', sku, response: data };
  }

  // Flipkart Ratings & Reviews — request a review for a delivered order.
  // UNVERIFIED: no public documentation for this endpoint was found.
  async requestReview(orderItemId) {
    const data = await this._request('POST', `/v3/orders/${orderItemId}/request-review`, {});
    return { channel: 'FLIPKART', orderId: orderItemId, response: data };
  }

  // One Flipkart shipment (1+ order items) → one Kartriq order.
  _transformShipment(sh) {
    const items = sh.orderItems || [];
    const first = items[0] || {};
    const buyer = sh.buyerDetails || first.buyerDetails || {};
    const addr = sh.deliveryAddress || first.deliveryAddress || {};
    const amt = (it) => {
      const pc = it.priceComponents || {};
      const v = pc.totalPrice ?? pc.sellingPrice ?? it.selling_price?.amount ?? it.sellingPrice ?? 0;
      return parseFloat(v) || 0;
    };
    const lines = items.map((it) => {
      const qty = Number(it.quantity) || 1;
      const total = amt(it);
      return { channelSku: it.sku || it.skuId, name: it.title || it.product_title, qty, unitPrice: total / qty, discount: 0, tax: 0 };
    });
    const total = lines.reduce((n, l) => n + l.unitPrice * l.qty, 0);
    const fbf = [first.fulfilmentType, first.fulfilment_source, sh.shipmentType, sh.fulfilmentType].some((v) => /FBF|SMART|FLIPKART_FULFIL|FLIPKART$/i.test(String(v || '')));
    return {
      channelOrderId: String(sh.shipmentId),
      channelOrderNumber: first.orderId || sh.orderId || String(sh.shipmentId),
      customer: {
        name: [buyer.firstName, buyer.lastName].filter(Boolean).join(' ') || [addr.firstName, addr.lastName].filter(Boolean).join(' ') || 'Flipkart Customer',
        email: null,
        phone: buyer.contactNumber || addr.contactNumber || null,
      },
      shippingAddress: {
        line1: addr.addressLine1 || addr.address1 || null, line2: addr.addressLine2 || addr.address2 || null,
        city: addr.city || null, state: addr.state || null, pincode: addr.pinCode || addr.pincode || null, country: 'India',
      },
      items: lines,
      subtotal: total, shippingCharge: 0, tax: 0, total, discount: 0,
      paymentMethod: /cod|cash/i.test(String(first.paymentType || sh.paymentType || '')) ? 'COD' : 'Flipkart',
      paymentStatus: 'PAID',
      status: 'PENDING',
      orderedAt: new Date(first.orderDate || sh.orderDate || Date.now()),
      fulfillmentType: fbf ? 'CHANNEL' : 'SELF',
      fulfillmentCenter: sh.locationId || this.locationId || null,
    };
  }
}

module.exports = FlipkartAdapter;
