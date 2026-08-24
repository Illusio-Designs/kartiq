const axios = require('axios');
const crypto = require('crypto');
const settings = require('../../settings.service');

async function getAppCredentials(creds) {
  const clientId     = creds.clientId     || (await settings.get('amazon.clientId'));
  const clientSecret = creds.clientSecret || (await settings.get('amazon.clientSecret'));
  if (!clientId || !clientSecret) {
    throw new Error('Amazon OAuth app not configured. Set amazon.clientId and amazon.clientSecret in Admin → Settings.');
  }
  return { clientId, clientSecret };
}

// Amazon Smart Biz — D2C website builder powered by Amazon MCF
// https://smartcommerce.amazon.in/smartbiz
//
// Credentials shape:
// { clientId, clientSecret, refreshToken, sellerId, webhookSecret? }
//
// Smart Biz has NO separate API — it uses Amazon SP-API with MCF endpoints.
// Two ways orders reach Kartriq:
//   1. WEBHOOK  → Smart Biz pushes order to POST /api/v1/channels/:id/webhook
//   2. POLL     → Kartriq fetches MCF fulfillment orders from SP-API
//
// Setup steps:
//   1. Log in to sellercentral.amazon.in → Apps & Services → Develop Apps
//   2. Create an SP-API application and note clientId + clientSecret
//   3. Authorize the app → get refreshToken
//   4. In Smart Biz dashboard, set your Kartriq webhook URL
//   5. Connect via POST /api/v1/channels/:id/connect with credentials above

const {
  LWA_TOKEN_URL: LWA_URL,
  AMAZON_MARKETPLACE_IDS,
  getEndpoint,
} = require('../../../config/channel-endpoints');

const IN_MARKETPLACE = AMAZON_MARKETPLACE_IDS.IN;

class AmazonSmartBizAdapter {
  constructor(credentials) {
    this.creds = credentials;
    this._token = null;
    this._tokenExpiry = null;
    // Smart Biz is India-only. Mode (sandbox vs production) comes from
    // process.env.CHANNEL_MODE — see backend/src/config/channel-endpoints.js.
    this.spApi = getEndpoint('AMAZON_SMARTBIZ', 'IN');
    // Smart Biz stock lives in Amazon's MCF warehouse — Kartriq can't set it.
    // This flag tells the inventory-push job to skip the channel entirely
    // instead of calling updateInventoryLevel (which throws) every cycle.
    this.inventoryManagedByChannel = true;
  }

  // Smart Biz uses the same SP-API Listings endpoint as Amazon proper
  async updateListing(sku, fields) {
    const token = await this._getToken();
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
        value: [{ fulfillment_channel_code: 'AMAZON_IN', quantity: fields.qty }],
      });
    if (fields.images !== undefined)
      patches.push({
        op: 'replace',
        path: '/attributes/main_product_image_locator',
        value: (fields.images || []).map(url => ({ media_location: url })),
      });

    const { data } = await axios.patch(
      `${this.spApi}/listings/2021-08-01/items/${this.creds.sellerId}/${encodeURIComponent(sku)}`,
      { productType: 'PRODUCT', patches },
      {
        headers: { 'x-amz-access-token': token, 'Content-Type': 'application/json' },
        params: { marketplaceIds: IN_MARKETPLACE },
      }
    );
    return { channel: 'AMAZON_SMARTBIZ', sku, submissionId: data.submissionId, status: data.status };
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  async _getToken() {
    if (this._token && this._tokenExpiry > Date.now()) return this._token;
    if (!this.creds.refreshToken) {
      throw new Error('Amazon Smart Biz channel missing refreshToken — complete the seller OAuth flow first.');
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
    this._token = data.access_token;
    this._tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this._token;
  }

  async _req(method, path, payload = null, params = {}) {
    const token = await this._getToken();
    try {
      const { data } = await axios({
        method,
        url: `${this.spApi}${path}`,
        headers: { 'x-amz-access-token': token, 'Content-Type': 'application/json' },
        params,
        data: payload,
      });
      return data;
    } catch (err) {
      const status = err.response?.status;
      const body   = err.response?.data;
      let apiMsg = body?.errors?.[0]?.message
                || body?.errors?.[0]?.code
                || body?.message
                || body?.error_description
                || body?.error;
      if (!apiMsg) {
        if (body && typeof body === 'object') {
          try { apiMsg = JSON.stringify(body); } catch { apiMsg = err.message; }
        } else if (typeof body === 'string' && body.length) {
          apiMsg = body.slice(0, 400);
        } else {
          apiMsg = err.message;
        }
      }
      console.error('[amazon-smartbiz._req] failed', { method, path, status, body, endpoint: this.spApi, mode: process.env.CHANNEL_MODE || 'production' });
      const hint = status === 403
        ? ' — common causes: (1) seller has not authorized this SP-API role, (2) refresh token region mismatch, (3) app in Draft state.'
        : status === 400
        ? ' — common causes: (1) sandbox/production credential mismatch, (2) wrong region for the marketplace, (3) the request body or query params are malformed for this SP-API path.'
        : '';
      throw new Error(`Amazon SP-API ${method} ${path} failed (${status || '?'}): ${apiMsg}${hint}`);
    }
  }

  // ── Connection test ─────────────────────────────────────────────────────────

  async testConnection() {
    const data = await this._req('GET', '/sellers/v1/marketplaceParticipations');
    const marketplaces = (data.payload || []).map(p => p.marketplace?.name).filter(Boolean);
    return { success: true, sellerId: this.creds.sellerId, marketplaces };
  }

  // ── MCF Order Polling ───────────────────────────────────────────────────────
  // Fetches MCF fulfillment orders created for Smart Biz sales.
  // Call this from sync/orders endpoint.

  async fetchOrders(opts = {}) {
    const since = opts instanceof Date ? opts : opts.since;
    const params = {};
    if (since) {
      const d = since instanceof Date ? since : new Date(since);
      params.queryStartDate = d.toISOString();
    }

    const data = await this._req(
      'GET',
      '/fba/outbound/2020-07-01/fulfillmentOrders',
      null,
      params
    );
    const orders = data.payload?.fulfillmentOrders || [];
    return orders.map(o => this._transformFulfillmentOrder(o));
  }

  // ── MCF Fulfillment ─────────────────────────────────────────────────────────
  // Tell Amazon to pick & ship a Smart Biz order from your FBA inventory.

  async createFulfillmentOrder(order, items) {
    const payload = {
      marketplaceId: IN_MARKETPLACE,
      sellerFulfillmentOrderId: order.orderNumber,
      displayableOrderId: order.orderNumber,
      displayableOrderDate: new Date(order.orderedAt || Date.now()).toISOString(),
      displayableOrderComment: order.notes || 'Smart Biz Order',
      shippingSpeedCategory: 'Standard',  // Standard | Expedited | Priority
      destinationAddress: {
        name: order.customer?.name || '',
        addressLine1: order.shippingAddress?.line1 || '',
        addressLine2: order.shippingAddress?.line2 || '',
        city: order.shippingAddress?.city || '',
        stateOrRegion: order.shippingAddress?.state || '',
        postalCode: order.shippingAddress?.pincode || '',
        countryCode: 'IN',
        phone: order.customer?.phone || '',
      },
      items: items.map((item, idx) => ({
        sellerSku: item.sku,
        sellerFulfillmentOrderItemId: `${order.orderNumber}-${idx + 1}`,
        quantity: item.qty,
        displayableComment: item.name || '',
      })),
    };

    const data = await this._req('POST', '/fba/outbound/2020-07-01/fulfillmentOrders', payload);
    return { success: true, sellerFulfillmentOrderId: order.orderNumber, raw: data };
  }

  // Update an existing MCF fulfillment order (e.g. address correction)
  async updateFulfillmentOrder(sellerFulfillmentOrderId, updates) {
    await this._req(
      'PUT',
      `/fba/outbound/2020-07-01/fulfillmentOrders/${sellerFulfillmentOrderId}`,
      updates
    );
    return { updated: true };
  }

  // Cancel an MCF fulfillment order (only possible before Amazon picks it)
  async cancelFulfillmentOrder(sellerFulfillmentOrderId) {
    await this._req(
      'PUT',
      `/fba/outbound/2020-07-01/fulfillmentOrders/${sellerFulfillmentOrderId}/cancel`
    );
    return { cancelled: true, orderId: sellerFulfillmentOrderId };
  }

  // ── Tracking ─────────────────────────────────────────────────────────────────

  async trackShipment(sellerFulfillmentOrderId) {
    const data = await this._req(
      'GET',
      `/fba/outbound/2020-07-01/fulfillmentOrders/${sellerFulfillmentOrderId}`
    );
    const order = data.payload?.fulfillmentOrder;
    const shipments = data.payload?.fulfillmentShipments || [];

    return {
      orderId: sellerFulfillmentOrderId,
      status: order?.fulfillmentOrderStatus,
      shipments: shipments.map(s => ({
        shipmentId: s.amazonShipmentId,
        status: s.fulfillmentShipmentStatus,
        estimatedArrival: s.estimatedArrivalDate,
        packages: (s.fulfillmentShipmentPackages || []).map(p => ({
          packageNumber: p.packageNumber,
          carrier: p.carrierCode,
          trackingNumber: p.trackingNumber,
          estimatedArrival: p.estimatedArrivalDate,
        })),
      })),
    };
  }

  // ── FBA Inventory ────────────────────────────────────────────────────────────
  // See what stock Amazon has in their warehouse for MCF fulfilment.

  async getMCFInventory() {
    const data = await this._req(
      'GET',
      '/fba/inventory/v1/summaries',
      null,
      {
        details: true,
        granularityType: 'Marketplace',
        granularityId: IN_MARKETPLACE,
        marketplaceIds: IN_MARKETPLACE,
      }
    );
    return (data.payload?.inventorySummaries || []).map(i => ({
      sku: i.sellerSku,
      fnSku: i.fnSku,
      asin: i.asin,
      productName: i.productName,
      available: i.inventoryDetails?.fulfillableQuantity || 0,
      inbound: i.inventoryDetails?.inboundWorkingQuantity || 0,
      reserved: i.inventoryDetails?.reservedQuantity?.totalReservedQuantity || 0,
    }));
  }

  // updateInventoryLevel is N/A for MCF — stock lives in Amazon's warehouse.
  // Replenish by creating an FBA Inbound Shipment via Seller Central.
  async updateInventoryLevel() {
    throw new Error(
      'Smart Biz uses Amazon MCF — inventory lives in Amazon\'s warehouse. ' +
      'Replenish stock by sending an FBA inbound shipment via Seller Central.'
    );
  }

  // ── Webhook signature validation ─────────────────────────────────────────────
  // Call this before trusting an incoming Smart Biz webhook.
  // webhookSecret should match what you set in the Smart Biz dashboard.

  validateWebhookSignature(rawBody, signatureHeader) {
    if (!this.creds.webhookSecret) return true; // skip if not configured
    const expected = crypto
      .createHmac('sha256', this.creds.webhookSecret)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader || '', 'hex'),
      Buffer.from(expected, 'hex')
    );
  }

  // Parse an incoming Smart Biz webhook body → Kartriq raw order format
  parseWebhook(body) {
    const o = body;
    return {
      channelOrderId: String(o.orderId || o.order_id || o.sellerOrderId),
      channelOrderNumber: o.orderNumber || o.order_number || o.displayableOrderId,
      customer: {
        name: o.shippingAddress?.name || o.customerName || 'Smart Biz Customer',
        email: o.buyerEmail || o.customerEmail || null,
        phone: o.shippingAddress?.phone || o.customerPhone || null,
      },
      shippingAddress: {
        line1: o.shippingAddress?.addressLine1 || o.shippingAddress?.address1 || '',
        line2: o.shippingAddress?.addressLine2 || '',
        city: o.shippingAddress?.city || '',
        state: o.shippingAddress?.stateOrRegion || o.shippingAddress?.state || '',
        pincode: o.shippingAddress?.postalCode || o.shippingAddress?.pincode || '',
        country: 'India',
      },
      items: (o.orderItems || o.items || []).map(i => ({
        channelSku: i.sellerSku || i.sku,
        name: i.title || i.name || i.sellerSku,
        qty: i.quantityOrdered || i.quantity || 1,
        unitPrice: parseFloat(i.itemPrice?.amount || i.unitPrice || 0),
        discount: parseFloat(i.promotionDiscount?.amount || i.discount || 0),
        tax: parseFloat(i.itemTax?.amount || i.tax || 0),
      })),
      subtotal: parseFloat(o.subtotal || o.orderSubtotal || 0),
      shippingCharge: parseFloat(o.shippingCharge?.amount || o.shippingCharge || 0),
      tax: parseFloat(o.taxAmount || o.tax || 0),
      total: parseFloat(o.orderTotal?.amount || o.total || o.orderAmount || 0),
      discount: parseFloat(o.totalDiscount || 0),
      paymentMethod: o.paymentMethod || 'Smart Biz',
      paymentStatus: 'PAID',
      status: 'PENDING',
      orderedAt: new Date(o.purchaseDate || o.orderDate || Date.now()),
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  _transformFulfillmentOrder(o) {
    // Map Amazon's MCF fulfillmentOrderStatus onto Kartriq's order status.
    // Statuses: New | Received | Planning | Processing | Cancelled | Complete |
    // CompletePartialled | Unfulfillable | Invalid.
    const s = o.fulfillmentOrderStatus;
    const mcfStatus = (s === 'COMPLETE' || s === 'CompletePartialled') ? 'DELIVERED'
      : s === 'Cancelled' ? 'CANCELLED'
      : (s === 'Processing' || s === 'Planning' || s === 'Received') ? 'PROCESSING'
      : 'PENDING';
    // Best-known fulfillment timestamp from the MCF order.
    const shipDate = new Date(o.statusUpdatedDate || o.receivedDate || Date.now());
    return {
      channelOrderId: o.sellerFulfillmentOrderId,
      channelOrderNumber: o.displayableOrderId,
      customer: {
        name: o.destinationAddress?.name || 'Smart Biz Customer',
        email: null,
        phone: o.destinationAddress?.phone || null,
      },
      shippingAddress: {
        line1: o.destinationAddress?.addressLine1 || '',
        line2: o.destinationAddress?.addressLine2 || '',
        city: o.destinationAddress?.city || '',
        state: o.destinationAddress?.stateOrRegion || '',
        pincode: o.destinationAddress?.postalCode || '',
        country: 'India',
      },
      items: (o.items || []).map(i => ({
        channelSku: i.sellerSku,
        name: i.displayableComment || i.sellerSku,
        qty: i.quantity,
        unitPrice: 0,
        discount: 0,
        tax: 0,
      })),
      subtotal: 0, shippingCharge: 0, tax: 0, total: 0, discount: 0,
      paymentMethod: 'Smart Biz',
      paymentStatus: 'PAID',
      // MCF (fulfillment-by-Amazon) — mark the listing as CHANNEL-managed so
      // Kartriq never tries to push stock back for these SKUs.
      fulfillment_channel: 'AFN',
      status: mcfStatus,
      // The MCF fulfillmentOrders list carries no pricing, so a poll-only order
      // has ₹0 totals; the real money arrives via the Smart Biz webhook
      // (parseWebhook). What the poll DOES know is fulfillment progress, so we
      // surface shipped/delivered timestamps to advance an existing order.
      shippedAt: (mcfStatus === 'SHIPPED' || mcfStatus === 'DELIVERED') ? shipDate : null,
      deliveredAt: mcfStatus === 'DELIVERED' ? (o.fulfillmentOrderStatus === 'COMPLETE' ? shipDate : new Date()) : null,
      orderedAt: new Date(o.receivedDate || Date.now()),
    };
  }
}

module.exports = AmazonSmartBizAdapter;
