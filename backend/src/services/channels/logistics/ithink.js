const axios = require('axios');

// iThink Logistics — multi-courier shipping aggregator
// Credentials: { accessToken, secretKey }
// Apply at: https://www.ithinklogistics.com
// Docs: https://www.ithinklogistics.com/developer

// Production host; the pre-alpha host is iThink's sandbox (CHANNEL_MODE=sandbox).
// Requests are { data: { access_token, secret_key, ...fields } } and endpoints end
// in .json (iThink API v3: order/add, order/track, shipping/label, order/cancel).
const BASE = String(process.env.CHANNEL_MODE || '').toLowerCase() === 'sandbox'
  ? 'https://pre-alpha.ithinklogistics.com/api_v3'
  : 'https://my.ithinklogistics.com/api_v3';

class IThinkAdapter {
  constructor(credentials) {
    this.accessToken = credentials.accessToken;
    this.secretKey = credentials.secretKey;
    this.pickupAddressId = credentials.pickupAddressId || '';
    this.client = axios.create({
      baseURL: BASE,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  _auth(extra = {}) {
    return {
      access_token: this.accessToken,
      secret_key: this.secretKey,
      ...extra,
    };
  }

  // POST { data: {...} } and surface iThink's own error text.
  async _post(path, fields = {}) {
    let res;
    try { ({ data: res } = await this.client.post(path, { data: this._auth(fields) })); }
    catch (err) { throw new Error(`iThink ${path} failed (${err.response?.status || '?'}): ${err.response?.data?.message || err.message}`); }
    return res;
  }

  async testConnection() {
    // No dedicated ping endpoint: asking for the pickup warehouses proves the keys work.
    const res = await this._post('/warehouse/get.json');
    return { success: String(res.status).toLowerCase() === 'success', message: res.message || 'Connected' };
  }

  // Check serviceability & get rate estimate
  async checkServiceability({ pickupPincode, deliveryPincode, weight, cod = false, orderValue = 0 }) {
    const payload = this._auth({
      pickup_pincode: pickupPincode,
      delivery_pincode: deliveryPincode,
      weight: (weight || 0.5) * 1000,
      payment_mode: cod ? 'COD' : 'PREPAID',
      order_amount: orderValue,
    });
    const { data } = await this.client.post('/courier_serviceability/getRates', payload);
    return data.data || [];
  }

  async getRates(params) {
    return this.checkServiceability(params);
  }

  // Create a forward shipment (order/add.json). iThink assigns the AWB in the same call.
  // Needs the warehouse registered with iThink: warehouseAddress.pickupAddressId
  // (or credentials.pickupAddressId).
  async createShipment(order, channel, warehouseAddress = {}) {
    const addr = order.shippingAddress || {};
    const parcel = order.parcel || {};
    const shipment = {
      waybill: '',
      order: order.orderNumber,
      sub_order: order.orderNumber,
      order_date: new Date(order.orderedAt || Date.now()).toISOString().split('T')[0],
      total_amount: String(parseFloat(order.total)),
      name: order.customer?.name || '',
      company_name: '',
      add: addr.line1 || '',
      add2: addr.line2 || '',
      add3: '',
      pin: addr.pincode || '',
      city: addr.city || '',
      state: addr.state || '',
      country: addr.country === 'IN' || !addr.country ? 'India' : addr.country,
      phone: order.customer?.phone || '',
      alt_phone: '',
      email: order.customer?.email || '',
      is_billing_same_as_shipping: 'yes',
      billing_name: order.customer?.name || '',
      billing_add: addr.line1 || '',
      billing_pin: addr.pincode || '',
      billing_city: addr.city || '',
      billing_state: addr.state || '',
      billing_country: 'India',
      billing_phone: order.customer?.phone || '',
      products: (order.items || []).map((i) => ({
        product_name: i.variant?.product?.name || i.variant?.name || 'Item',
        product_sku: i.variant?.sku || '',
        product_quantity: String(i.qty),
        product_price: String(i.unitPrice),
        product_tax_rate: '0',
        product_hsn_code: '',
        product_discount: String(i.discount || 0),
      })),
      shipment_length: String(parcel.lengthCm || 10),
      shipment_width: String(parcel.widthCm || 10),
      shipment_height: String(parcel.heightCm || 10),
      weight: String(parcel.weightKg || 0.5),
      payment_mode: order.paymentStatus === 'PAID' ? 'Prepaid' : 'COD',
      cod_amount: order.paymentStatus === 'PAID' ? '0' : String(order.total),
      return_address_id: warehouseAddress.pickupAddressId || this.pickupAddressId || '',
    };
    const res = await this._post('/order/add.json', {
      shipments: [shipment],
      pickup_address_id: warehouseAddress.pickupAddressId || this.pickupAddressId || '',
      logistics: '',
      s_type: '',
      order_type: 'forward',
    });
    // data is keyed by position: { "1": { status, refnum, remark, waybill, logistic_name } }
    const first = Object.values(res.data || {})[0];
    if (!first || String(first.status).toLowerCase() !== 'success' || !first.waybill) {
      throw new Error(`iThink did not book this order: ${first?.remark || res.html_message || res.message || 'no waybill returned'}`);
    }
    return { awbCode: first.waybill, courierName: first.logistic_name || 'iThink', shipmentId: first.refnum, raw: res };
  }

  // Shipping label PDF link for an AWB (shipping/label.json).
  async getLabel(awb) {
    const res = await this._post('/shipping/label.json', { awb_numbers: awb, page_size: 'A4' });
    const url = res.file_name || res.data?.file_name || res.data?.url;
    if (!url) throw new Error(`iThink returned no label for ${awb}: ${res.message || res.status || 'unknown'}`);
    return { url };
  }

  // Track by AWB (order/track.json). data is keyed by AWB.
  async trackShipment(awb) {
    const res = await this._post('/order/track.json', { awb_number_list: String(awb) });
    const t = (res.data || {})[awb] || Object.values(res.data || {})[0];
    return {
      awbCode: awb,
      currentStatus: t?.current_status || t?.last_scan_details?.status || null,
      courierName: t?.logistic,
      activities: t?.scan_details || [],
    };
  }

  // Cancel before pickup (order/cancel.json), one or many AWBs.
  async cancelShipment(awbs) {
    const list = Array.isArray(awbs) ? awbs : [awbs];
    const res = await this._post('/order/cancel.json', { awb_numbers: list.join(',') });
    const r = Object.values(res.data || {})[0];
    if (r && String(r.status).toLowerCase() !== 'success') throw new Error(`iThink could not cancel: ${r.remark || r.message || 'rejected'}`);
    return res;
  }

  // Get configured pickup locations
  async getPickupLocations() {
    const res = await this._post('/warehouse/get.json');
    return res.data || [];
  }
}

module.exports = IThinkAdapter;
