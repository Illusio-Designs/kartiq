// Fulfillment / 3PL adapters.
// Primary methods: createFulfillment, syncStock, fetchInventory.

const { BaseAdapter, bearerClient } = require('../_base');
const axios = require('axios');

class FulfillmentBase extends BaseAdapter {
  async fetchOrders() { return []; }
  async updateInventoryLevel() { return { success: true, skipped: true, reason: '3PL fulfillment — push via createFulfillment' }; }
}

// Amazon FBA — uses SP-API FBA Inventory & Fulfillment (Outbound) endpoints.
// Extends the real AmazonAdapter and reuses its auth/endpoint/marketplace and
// the paginated FBA-inventory method. (The base adapter talks via `_request`
// and `axios` with a per-tenant access token — it has no `this.client`, and
// the marketplace is resolved from the channel's own region, never hardcoded.)
const AmazonAdapter = require('../ecom/amazon');
class AmazonFbaAdapter extends AmazonAdapter {
  // FBA orders are pulled by the main Amazon channel, not this fulfilment view.
  async fetchOrders() { return []; }

  // Real, paginated FBA on-hand summaries via /fba/inventory/v1/summaries.
  async fetchInventory() {
    return this.fetchInventorySummaries();
  }

  // Create an FBA multi-channel fulfilment order (FBA Outbound 2020-07-01) so
  // stock held in Amazon fulfils an order placed on another channel.
  async createFulfillment(order) {
    const token = await this._getAccessToken();
    const { data } = await axios.post(
      `${this.endpoint}/fba/outbound/2020-07-01/fulfillmentOrders`,
      {
        sellerFulfillmentOrderId: order.orderId,
        displayableOrderId: order.orderNumber || order.orderId,
        displayableOrderDate: new Date().toISOString(),
        displayableOrderComment: order.comment || 'Fulfilled via Kartriq',
        shippingSpeedCategory: order.shippingSpeed || 'Standard',
        destinationAddress: order.shipAddress,
        items: order.items,
      },
      {
        headers: { 'x-amz-access-token': token, 'Content-Type': 'application/json' },
        params: { marketplaceIds: this.marketplaceId },
      }
    );
    return { fulfillmentId: order.orderId, raw: data };
  }
}

// Flipkart Smart Fulfillment
const FlipkartAdapter = require('../ecom/flipkart');
class FlipkartSmartFulfillmentAdapter extends FlipkartAdapter {
  async createFulfillment(order) {
    const { data } = await this.client.post('/sellers/listings/v3/fulfillment/sf/orders', { orderId: order.orderId, items: order.items });
    return { fulfillmentId: data?.fulfillment_id, raw: data };
  }
}

// WareIQ
class WareIQAdapter extends FulfillmentBase {
  constructor(creds) { super(creds); this.client = bearerClient('https://api.wareiq.com/v1', creds.apiKey); }
  async createFulfillment(order) {
    const { data } = await this.client.post('/fulfillment-orders', order);
    return { fulfillmentId: data?.id, raw: data };
  }
  async fetchInventory() {
    const { data } = await this.client.get('/inventory');
    return data?.items || [];
  }
}

// LogiNext
class LogiNextAdapter extends FulfillmentBase {
  constructor(creds) { super(creds); this.client = bearerClient('https://api.loginextsolutions.com/Track/v2', creds.apiKey, { 'X-Account-Id': creds.accountId }); }
  async createFulfillment(order) {
    const { data } = await this.client.post('/orders', order);
    return { fulfillmentId: data?.orderId, raw: data };
  }
}

// Holisol Logistics
class HolisolAdapter extends FulfillmentBase {
  constructor(creds) { super(creds); this.client = bearerClient('https://api.holisollogistics.com/v1', creds.apiKey); }
  async createFulfillment(order) {
    const { data } = await this.client.post('/orders', order);
    return { fulfillmentId: data?.id, raw: data };
  }
  async fetchInventory() {
    const { data } = await this.client.get('/inventory');
    return data?.inventory || [];
  }
}

module.exports = { AmazonFbaAdapter, FlipkartSmartFulfillmentAdapter, WareIQAdapter, LogiNextAdapter, HolisolAdapter };
