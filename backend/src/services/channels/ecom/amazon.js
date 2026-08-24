const axios = require('axios');
const settings = require('../../settings.service');
const {
  LWA_TOKEN_URL: LWA_URL,
  AMAZON_MARKETPLACE_IDS: MARKETPLACE_IDS,
  getEndpoint,
} = require('../../../config/channel-endpoints');

// Per-channel credentials (stored encrypted per tenant):
//   { sellerId, refreshToken, region: "IN" | "US" | "EU" }
//
// Global OAuth app credentials (configured via Admin → Settings → Amazon):
//   amazon.clientId, amazon.clientSecret
//
// For backwards compat, legacy channels that stored clientId/clientSecret
// per tenant still work — per-tenant values win over platform settings.
// Docs: https://developer-docs.amazon.com/sp-api/

async function getAppCredentials(creds) {
  const clientId     = creds.clientId     || (await settings.get('amazon.clientId'));
  const clientSecret = creds.clientSecret || (await settings.get('amazon.clientSecret'));
  if (!clientId || !clientSecret) {
    throw new Error('Amazon OAuth app not configured. Set amazon.clientId and amazon.clientSecret in Admin → Settings.');
  }
  return { clientId, clientSecret };
}

// Mode (sandbox vs production) is controlled globally via CHANNEL_MODE in
// .env — see backend/src/config/channel-endpoints.js. Set CHANNEL_MODE=sandbox
// while your production app is still in Sandbox status on the Amazon
// Developer Console; switch to CHANNEL_MODE=production after approval.
class AmazonAdapter {
  constructor(credentials) {
    this.creds = credentials || {};
    this.region = this.creds.region || 'IN';
    this.endpoint = getEndpoint('AMAZON', this.region);
    this.marketplaceId = MARKETPLACE_IDS[this.region] || MARKETPLACE_IDS.IN;
    this._accessToken = null;
    this._tokenExpiry = null;
  }

  async _getAccessToken() {
    if (this._accessToken && this._tokenExpiry > Date.now()) {
      return this._accessToken;
    }
    if (!this.creds.refreshToken) {
      throw new Error('Amazon connection missing refreshToken — complete the seller OAuth flow first.');
    }
    const { clientId, clientSecret } = await getAppCredentials(this.creds);
    let data;
    try {
      ({ data } = await axios.post(LWA_URL, {
        grant_type: 'refresh_token',
        refresh_token: this.creds.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }));
    } catch (err) {
      const body = err.response?.data;
      const reason = body?.error_description || body?.error || err.message;
      throw new Error(`Amazon LWA token exchange failed (${err.response?.status || '?'}): ${reason}`);
    }
    this._accessToken = data.access_token;
    this._tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this._accessToken;
  }

  async _request(method, path, params = {}) {
    const token = await this._getAccessToken();
    try {
      const { data } = await axios({
        method,
        url: `${this.endpoint}${path}`,
        headers: { 'x-amz-access-token': token, 'Content-Type': 'application/json' },
        params,
      });
      return data;
    } catch (err) {
      const status = err.response?.status;
      const body   = err.response?.data;
      // SP-API errors: { errors: [{ code, message, details }] }
      const apiMsg = body?.errors?.[0]?.message
                  || body?.errors?.[0]?.code
                  || body?.message
                  || err.message;
      const hint = status === 403
        ? ' — common causes: (1) the seller has not authorized this SP-API role, (2) the refresh token is from a different region than the configured endpoint, or (3) the app is in Draft state and not approved for this role on Amazon Developer Console.'
        : '';
      throw new Error(`Amazon SP-API ${method} ${path} failed (${status || '?'}): ${apiMsg}${hint}`);
    }
  }

  async testConnection() {
    const data = await this._request('GET', '/sellers/v1/marketplaceParticipations');
    const participations = data.payload || [];
    return { success: true, marketplaces: participations.map(p => p.marketplace?.name) };
  }

  async fetchOrders(sinceDate) {
    // Amazon's Orders API REQUIRES CreatedAfter (or LastUpdatedAfter); calling
    // it without one returns 400. On a first sync there is no lastSyncAt, so
    // default to the last 30 days. Accept a Date, an ISO string, or the
    // { since } wrapper the cron passes, and always send an ISO-8601 value.
    let since = sinceDate;
    if (since && typeof since === 'object' && !(since instanceof Date)) since = since.since;
    if (!since) since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const createdAfter = since instanceof Date ? since.toISOString() : new Date(since).toISOString();

    const params = {
      MarketplaceIds: this.marketplaceId,
      OrderStatuses: 'Unshipped,PartiallyShipped,Shipped,Pending',
      CreatedAfter: createdAfter,
    };
    const data = await this._request('GET', '/orders/v0/orders', params);
    const rawOrders = data.payload?.Orders || [];
    const mapped = rawOrders.map(o => this._transformOrder(o));
    // getOrders returns order headers only — pull each order's line items so
    // orders arrive with their real products/SKUs (and the catalog can fill
    // itself). Best-effort per order: a failure (e.g. Amazon rate limit) leaves
    // that order's items empty, and the next sync backfills them.
    for (let i = 0; i < rawOrders.length; i++) {
      try {
        mapped[i].items = await this._getOrderItems(rawOrders[i].AmazonOrderId);
      } catch (_) { /* keep items empty; retried on the next sync */ }
    }
    return mapped;
  }

  // Amazon SP-API Orders — line items for one order (a separate endpoint from
  // getOrders). Shape matches what importOrders expects: qty + unitPrice.
  async _getOrderItems(amazonOrderId) {
    const data = await this._request('GET', `/orders/v0/orders/${encodeURIComponent(amazonOrderId)}/orderItems`);
    const items = data.payload?.OrderItems || [];
    return items.map((it) => {
      const qty = Number(it.QuantityOrdered || 1) || 1;
      const lineTotal = parseFloat(it.ItemPrice?.Amount || 0); // SP-API price is the line total
      return {
        channelSku: it.SellerSKU || it.ASIN || null,
        name: it.Title || it.SellerSKU || 'Amazon item',
        qty,
        unitPrice: qty > 0 ? lineTotal / qty : lineTotal,
      };
    });
  }

  // Amazon SP-API Solicitations: request product review & seller feedback
  // Sends the "Request a Review" button action programmatically.
  // Can only be called between 5 and 30 days after delivery.
  // Docs: https://developer-docs.amazon.com/sp-api/docs/solicitations-api-v1-reference
  async requestReview(amazonOrderId) {
    const token = await this._getAccessToken();
    const { data } = await axios.post(
      `${this.endpoint}/solicitations/v1/orders/${amazonOrderId}/solicitations/productReviewAndSellerFeedback`,
      {},
      {
        headers: { 'x-amz-access-token': token, 'Content-Type': 'application/json' },
        params: { marketplaceIds: this.marketplaceId },
      }
    );
    return { channel: 'AMAZON', orderId: amazonOrderId, response: data };
  }

  // Amazon SP-API Listings Items — partial update of an existing listing
  // fields: { price?, qty?, title?, description?, images? }
  async updateListing(sku, fields) {
    const token = await this._getAccessToken();
    const patches = [];
    if (fields.title !== undefined)
      patches.push({ op: 'replace', path: '/attributes/item_name', value: [{ value: fields.title }] });
    if (fields.description !== undefined)
      patches.push({ op: 'replace', path: '/attributes/product_description', value: [{ value: fields.description }] });
    if (fields.price !== undefined)
      patches.push({
        op: 'replace',
        path: '/attributes/purchasable_offer',
        value: [{ our_price: [{ schedule: [{ value_with_tax: fields.price }] }] }],
      });
    if (fields.qty !== undefined)
      patches.push({
        op: 'replace',
        path: '/attributes/fulfillment_availability',
        value: [{ fulfillment_channel_code: 'DEFAULT', quantity: fields.qty }],
      });
    if (fields.images !== undefined)
      patches.push({
        op: 'replace',
        path: '/attributes/main_product_image_locator',
        value: (fields.images || []).map(url => ({ media_location: url })),
      });

    const { data } = await axios.patch(
      `${this.endpoint}/listings/2021-08-01/items/${this.creds.sellerId}/${encodeURIComponent(sku)}`,
      { productType: 'PRODUCT', patches },
      {
        headers: { 'x-amz-access-token': token, 'Content-Type': 'application/json' },
        params: { marketplaceIds: this.marketplaceId },
      }
    );
    return { channel: 'AMAZON', sku, submissionId: data.submissionId, status: data.status };
  }

  async updateInventoryLevel(sku, quantity) {
    // Update seller-fulfilled (MFN) stock via the Listings Items API's
    // fulfillment_availability attribute — the modern path, no Feeds API
    // needed. Reuses updateListing's qty patch. (FBA stock is managed by
    // Amazon and can't be set this way; that call is rejected by Amazon and
    // surfaces as a sync error, which is more useful than a blanket throw.)
    return this.updateListing(sku, { qty: quantity });
  }

  _transformOrder(o) {
    return {
      channelOrderId: o.AmazonOrderId,
      channelOrderNumber: o.AmazonOrderId,
      customer: {
        name: o.BuyerInfo?.BuyerName || 'Amazon Customer',
        email: o.BuyerInfo?.BuyerEmail,
        phone: null,
      },
      shippingAddress: {
        line1: o.ShippingAddress?.AddressLine1,
        line2: o.ShippingAddress?.AddressLine2,
        city: o.ShippingAddress?.City,
        state: o.ShippingAddress?.StateOrRegion,
        pincode: o.ShippingAddress?.PostalCode,
        country: o.ShippingAddress?.CountryCode,
      },
      items: [], // Requires separate call to getOrderItems endpoint
      subtotal: parseFloat(o.OrderTotal?.Amount || 0),
      shippingCharge: 0,
      tax: 0,
      total: parseFloat(o.OrderTotal?.Amount || 0),
      discount: 0,
      paymentMethod: o.PaymentMethod,
      paymentStatus: o.PaymentExecutionDetail ? 'PAID' : 'PENDING',
      status: o.OrderStatus === 'Shipped' ? 'SHIPPED' : 'PENDING',
      orderedAt: new Date(o.PurchaseDate),
      // Fulfillment model: AFN = Amazon FBA, MFN = Merchant Fulfilled
      fulfillment_channel: o.FulfillmentChannel,
      fulfillmentCenter: o.ShippingAddress?.CountryCode
        ? `${o.FulfillmentChannel}-${o.ShippingAddress?.StateOrRegion || ''}`
        : null,
      // FBA orders ship with AWB already assigned
      awb: o.ShipmentServiceLevelCategory || null,
      trackingUrl: o.AmazonOrderId ? `https://www.amazon.in/gp/your-account/order-details?orderID=${o.AmazonOrderId}` : null,
    };
  }
}

module.exports = AmazonAdapter;
