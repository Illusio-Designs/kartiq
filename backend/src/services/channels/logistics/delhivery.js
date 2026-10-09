const axios = require('axios');
const { getEndpoint } = require('../../../config/channel-endpoints');

// Credentials shape: { token: "your_api_token" }
// Get your token from: https://app.delhivery.com → Settings → API
// Mode (production / sandbox/staging) is controlled globally by
// CHANNEL_MODE in .env — see backend/src/config/channel-endpoints.js.

class DelhiveryAdapter {
  constructor(credentials) {
    this.baseUrl = getEndpoint('DELHIVERY');
    this.headers = {
      Authorization: `Token ${credentials.token}`,
      'Content-Type': 'application/json',
    };
  }

  async _req(method, path, payload = null, params = {}) {
    const { data } = await axios({
      method,
      url: `${this.baseUrl}${path}`,
      headers: this.headers,
      params,
      data: payload,
    });
    return data;
  }

  async testConnection() {
    const data = await this._req('GET', '/api/p/edit-plan/');
    return { success: true, plan: data?.plan };
  }

  // Check serviceability between two pincodes
  async checkServiceability({ pickupPincode, deliveryPincode, weight, cod = false }) {
    const data = await this._req('GET', '/c/api/v1/serviceability/', null, {
      md: 'E',       // Express mode
      ss: 'Delivered',
      d_pin: deliveryPincode,
      o_pin: pickupPincode,
      cgm: weight * 1000, // grams
      pt: cod ? 'COD' : 'Pre-paid',
      cod: cod ? 1 : 0,
    });
    return data?.data?.map(s => ({
      courier: s.courier_name,
      serviceability: s.serviceability,
      tat: s.tat,
      chargedWeight: s.charged_weight,
      codCharges: s.cod_charges,
      totalCharge: s.total_charge,
    })) || [];
  }

  // Create a forward shipment waybill
  // Accepts (order, warehouse) or (order, channel, warehouse) like the other couriers.
  async createShipment(order, a2, a3) {
    const warehouseAddress = a3 !== undefined ? a3 : a2;
    const shipmentData = {
      format: 'json',
      data: JSON.stringify({
        shipments: [{
          name: order.customer?.name || 'Customer',
          add: `${order.shippingAddress?.line1 || ''} ${order.shippingAddress?.line2 || ''}`.trim(),
          pin: order.shippingAddress?.pincode || '',
          city: order.shippingAddress?.city || '',
          state: order.shippingAddress?.state || '',
          country: 'India',
          phone: order.customer?.phone || '',
          order: order.orderNumber,
          payment_mode: order.paymentStatus === 'PAID' ? 'Prepaid' : 'COD',
          return_pin: warehouseAddress?.pincode || '',
          return_city: warehouseAddress?.city || '',
          return_phone: warehouseAddress?.phone || '',
          return_name: warehouseAddress?.name || 'Kartriq',
          return_add: warehouseAddress?.line1 || '',
          return_state: warehouseAddress?.state || '',
          return_country: 'India',
          products_desc: order.items?.map(i => i.variant?.name || 'Item').join(', ') || 'Items',
          hsn_code: '',
          cod_amount: order.paymentStatus !== 'PAID' ? parseFloat(order.total) : 0,
          order_date: new Date(order.orderedAt).toISOString(),
          total_amount: parseFloat(order.total),
          seller_add: warehouseAddress?.line1 || '',
          seller_name: warehouseAddress?.name || 'Kartriq',
          seller_inv: order.orderNumber,
          quantity: order.items?.reduce((s, i) => s + i.qty, 0) || 1,
          weight: order.parcel ? Math.round((order.parcel.weightKg || 0.5) * 1000) : 500, // grams
          shipment_length: order.parcel?.lengthCm || 10,
          shipment_width: order.parcel?.widthCm || 10,
          shipment_height: order.parcel?.heightCm || 10,
          waybill: '',        // leave blank; Delhivery will assign
          seller_gst_tin: warehouseAddress?.gstin || '',
          shipping_mode: 'Surface',
        }],
        pickup_location: { name: warehouseAddress?.pickupLocationName || 'Primary' },
      }),
    };

    const formData = new URLSearchParams(shipmentData);
    const { data } = await axios.post(`${this.baseUrl}/api/cmu/create.json`, formData, {
      headers: { ...this.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const pkg = data?.packages?.[0];
    if (!pkg?.waybill || String(pkg.status).toLowerCase() === 'fail') {
      throw new Error(`Delhivery did not book this order: ${(pkg?.remarks || []).join?.('; ') || pkg?.remarks || data?.rmk || 'no waybill returned'}`);
    }
    return {
      waybill: pkg.waybill,
      awbCode: pkg.waybill,
      courierName: 'Delhivery',
      status: pkg.status,
      remarks: pkg.remarks,
    };
  }

  // Track one or more waybills
  async trackShipment(waybill) {
    const data = await this._req('GET', '/api/v1/packages/json/', null, {
      waybill,
      verbose: 1,
    });
    const pkg = data?.ShipmentData?.[0]?.Shipment;
    if (!pkg) return { waybill, status: null, currentStatus: null };
    return {
      waybill,
      status: pkg.Status?.Status,
      // Delhivery's Status is e.g. "In Transit"/"Dispatched"/"Delivered"; StatusType UD/DL/RT/PP is the family.
      currentStatus: pkg.Status?.Status || null,
      statusType: pkg.Status?.StatusType,
      expectedDelivery: pkg.ExpectedDeliveryDate,
      destination: pkg.Destination,
      origin: pkg.Origin,
      scans: pkg.Scans?.map(s => ({
        date: s.ScanDetail?.ScanDateTime,
        activity: s.ScanDetail?.Scan,
        location: s.ScanDetail?.ScannedLocation,
      })) || [],
    };
  }

  // Cancel a waybill
  async cancelShipment(waybill) {
    const data = await this._req('POST', '/api/p/edit-plan/', {
      waybill,
      cancel: true,
    });
    return data;
  }

  // Get pickup locations
  async getPickupLocations() {
    const data = await this._req('GET', '/api/backend/clientwarehouse/pickup/');
    return data?.data || [];
  }
}

module.exports = DelhiveryAdapter;
