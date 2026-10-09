const axios = require('axios');

// Credentials shape: { email: "you@domain.com", password: "yourpassword" }
// Sign up at: https://app.shiprocket.in/register
// Tokens are valid for 10 days.

const BASE = 'https://apiv2.shiprocket.in/v1/external';

class ShiprocketAdapter {
  constructor(credentials) {
    this.email = credentials.email;
    this.password = credentials.password;
    this._token = null;
    this._tokenExpiry = null;
  }

  async _getToken() {
    if (this._token && this._tokenExpiry > Date.now()) return this._token;
    const { data } = await axios.post(`${BASE}/auth/login`, {
      email: this.email,
      password: this.password,
    });
    this._token = data.token;
    // Tokens last 10 days; refresh after 9
    this._tokenExpiry = Date.now() + 9 * 24 * 60 * 60 * 1000;
    return this._token;
  }

  async _req(method, path, payload = null, params = {}) {
    const token = await this._getToken();
    const { data } = await axios({
      method,
      url: `${BASE}${path}`,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      params,
      data: payload,
    });
    return data;
  }

  async testConnection() {
    const data = await this._req('GET', '/settings/company/info');
    return { success: true, company: data.data?.company_name, id: data.data?.id };
  }

  // Get serviceability & rates for a shipment
  // params: { pickupPincode, deliveryPincode, weight (kg), cod (bool), orderValue }
  async getRates({ pickupPincode, deliveryPincode, weight, cod = false, orderValue = 0 }) {
    const data = await this._req('GET', '/courier/serviceability/', null, {
      pickup_postcode: pickupPincode,
      delivery_postcode: deliveryPincode,
      weight,
      cod: cod ? 1 : 0,
      declared_value: orderValue,
    });
    const couriers = data.data?.available_courier_companies || [];
    return couriers.map(c => ({
      courierId: c.courier_company_id,
      courierName: c.courier_name,
      deliveryDays: c.estimated_delivery_days,
      rate: c.rate,
      codCharges: c.cod_charges,
      minWeight: c.min_weight,
      rating: c.rating,
    }));
  }

  // Create a forward shipment for an Kartriq order
  async createShipment(order, channel, warehouseAddress) {
    const payload = {
      order_id: order.orderNumber,
      order_date: new Date(order.orderedAt).toISOString().split('T')[0],
      pickup_location: warehouseAddress.pickupLocationName || 'Primary',
      channel_id: channel.credentials?.shiprocketChannelId || '',
      comment: order.notes || '',
      billing_customer_name: order.customer?.name || '',
      billing_last_name: '',
      billing_address: order.shippingAddress?.line1 || '',
      billing_address_2: order.shippingAddress?.line2 || '',
      billing_city: order.shippingAddress?.city || '',
      billing_pincode: order.shippingAddress?.pincode || '',
      billing_state: order.shippingAddress?.state || '',
      billing_country: order.shippingAddress?.country || 'India',
      billing_email: order.customer?.email || '',
      billing_phone: order.customer?.phone || '',
      shipping_is_billing: true,
      order_items: order.items?.map(i => ({
        name: i.variant?.product?.name || i.variant?.name || 'Item',
        sku: i.variant?.sku || '',
        units: i.qty,
        selling_price: parseFloat(i.unitPrice),
      })) || [],
      payment_method: order.paymentStatus === 'PAID' ? 'Prepaid' : 'COD',
      sub_total: parseFloat(order.subtotal),
      length: order.parcel?.lengthCm || 10,
      breadth: order.parcel?.widthCm || 10,
      height: order.parcel?.heightCm || 10,
      weight: order.parcel?.weightKg || 0.5,
    };
    const data = await this._req('POST', '/orders/create/adhoc', payload);
    return {
      shiprocketOrderId: data.order_id,
      shipmentId: data.shipment_id,
      awbCode: data.awb_code,
      courierName: data.courier_name,
      pickupDate: data.pickup_scheduled_date,
    };
  }

  // Full booking in Shiprocket's three steps: create the order, assign a courier
  // (no courier_id → Shiprocket picks by your rules) so an AWB exists, then ask
  // for the pickup. A pickup that fails to schedule does not undo the booking.
  async bookShipment(order, channel, warehouseAddress = {}) {
    const created = await this.createShipment(order, channel, warehouseAddress);
    if (!created.shipmentId) throw new Error('Shiprocket did not create the order');
    let awbCode = created.awbCode;
    let courierName = created.courierName;
    if (!awbCode) {
      const a = await this.assignCourier(created.shipmentId);
      awbCode = a.awbCode; courierName = a.courierName || courierName;
    }
    if (!awbCode) throw new Error('Shiprocket could not assign a courier (check serviceability and wallet balance)');
    let pickup = null;
    try { pickup = await this.schedulePickup(created.shipmentId); } catch (e) { pickup = { error: e.message }; }
    return { ...created, awbCode, courierName, pickup };
  }

  // Label PDF link (courier/generate/label takes SHIPMENT ids, not AWBs).
  async getLabel(shipmentId) {
    const data = await this._req('POST', '/courier/generate/label', { shipment_id: [shipmentId] });
    const url = data.label_url || data.response?.label_url;
    if (!url) throw new Error(`Shiprocket returned no label${data.message ? ': ' + data.message : ''}`);
    return { url };
  }

  // Assign a courier and generate AWB
  async assignCourier(shipmentId, courierId) {
    const data = await this._req('POST', '/courier/assign/awb', {
      shipment_id: [shipmentId],
      courier_id: courierId,
    });
    return { awbCode: data.response?.data?.awb_code, courierName: data.response?.data?.courier_name };
  }

  // Schedule pickup
  async schedulePickup(shipmentId) {
    const data = await this._req('POST', '/courier/generate/pickup', {
      shipment_id: [shipmentId],
    });
    return { pickupDate: data.response?.pickup_scheduled_date, status: data.response?.pickup_status };
  }

  // Track by AWB code
  async trackShipment(awbCode) {
    const data = await this._req('GET', `/courier/track/awb/${awbCode}`);
    const track = data.tracking_data;
    return {
      awbCode,
      // The readable status ('Pickup Scheduled', 'In Transit', …) sits on the first tracking entry;
      // track_status / shipment_status are numeric codes.
      currentStatus: track?.shipment_track?.[0]?.current_status || (typeof track?.track_status === 'string' ? track.track_status : null),
      estimatedDelivery: track?.etd,
      courierName: track?.shipment_track?.[0]?.courier_name,
      activities: track?.shipment_track_activities?.map(a => ({
        date: a.date,
        activity: a.activity,
        location: a.location,
      })) || [],
    };
  }

  // Cancel a shipment
  async cancelShipment(awbCodes) {
    const data = await this._req('POST', '/orders/cancel/shipment/awbs', {
      awbs: Array.isArray(awbCodes) ? awbCodes : [awbCodes],
    });
    return data;
  }

  // Get all pickup locations configured in Shiprocket
  async getPickupLocations() {
    const data = await this._req('GET', '/settings/company/pickup');
    return data.data?.shipping_address || [];
  }
}

module.exports = ShiprocketAdapter;
