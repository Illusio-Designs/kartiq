const axios = require('axios');

// Xpressbees API
// Credentials: { email, password }
// Apply at: https://www.xpressbees.com

const BASE = 'https://shipment.xpressbees.com/api';

class XpressbeesAdapter {
  constructor(credentials) {
    this.email = credentials.email;
    this.password = credentials.password;
    this._token = null;
    this._tokenExpiry = 0;
  }

  async _getToken() {
    if (this._token && this._tokenExpiry > Date.now()) return this._token;
    const { data } = await axios.post(`${BASE}/users/login`, {
      email: this.email,
      password: this.password,
    });
    this._token = data.data;
    this._tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
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
    const data = await this._req('GET', '/courier');
    return { success: true, availableCouriers: (data.data || []).length };
  }

  async getRates({ pickupPincode, deliveryPincode, weight, cod = false, orderValue = 0 }) {
    const data = await this._req('POST', '/courier/serviceability', {
      origin: pickupPincode,
      destination: deliveryPincode,
      weight: weight * 1000,
      payment_type: cod ? 'cod' : 'prepaid',
      order_amount: orderValue,
    });
    return data.data || [];
  }

  async createShipment(order, channel, warehouseAddress) {
    const payload = {
      order_number: order.orderNumber,
      payment_type: order.paymentStatus === 'PAID' ? 'prepaid' : 'cod',
      package_weight: order.parcel ? Math.round((order.parcel.weightKg || 0.5) * 1000) : 500,
      package_length: order.parcel?.lengthCm || 10,
      package_breadth: order.parcel?.widthCm || 10,
      package_height: order.parcel?.heightCm || 10,
      consignee: {
        name: order.customer?.name || '',
        phone: order.customer?.phone || '',
        address: order.shippingAddress?.line1 || '',
        city: order.shippingAddress?.city || '',
        state: order.shippingAddress?.state || '',
        pincode: order.shippingAddress?.pincode || '',
      },
      pickup: {
        warehouse_name: warehouseAddress.name || 'Primary',
        name: warehouseAddress.contactName || 'Warehouse',
        address: warehouseAddress.line1 || '',
        city: warehouseAddress.city || '',
        state: warehouseAddress.state || '',
        pincode: warehouseAddress.pincode || '',
        phone: warehouseAddress.phone || '',
      },
      order_items: (order.items || []).map(i => ({
        name: i.variant?.name || 'Item',
        sku: i.variant?.sku || '',
        price: parseFloat(i.unitPrice),
        quantity: i.qty,
      })),
      collectable_amount: order.paymentStatus === 'PAID' ? 0 : parseFloat(order.total),
    };
    const data = await this._req('POST', '/shipments2', payload);
    return { awbCode: data.data?.awb_number, courierName: 'Xpressbees', shipmentId: data.data?.shipment_id };
  }

  async trackShipment(awb) {
    const data = await this._req('GET', `/shipments2/track/${awb}`);
    return { awbCode: awb, currentStatus: data.data?.status, activities: data.data?.history || [] };
  }

  async cancelShipment(awb) {
    const data = await this._req('POST', '/shipments2/cancel', { awb });
    return data;
  }
}

module.exports = XpressbeesAdapter;
