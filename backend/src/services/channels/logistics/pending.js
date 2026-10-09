// Real adapters for previously-pending LOGISTICS carriers.
// All implement: testConnection, createShipment, trackShipment, cancelShipment.
const { BaseAdapter, bearerClient, basicClient } = require('../_base');
const axios = require('axios');

// Aramex — global express. Uses SOAP/XML in production but their REST gateway
// also exposes a JSON API; we use REST for simplicity.
class AramexAdapter extends BaseAdapter {
  constructor(creds) {
    super(creds);
    this.client = axios.create({ baseURL: 'https://ws.aramex.net/ShippingAPI.V2/Shipping/Service_1_0.svc/json', headers: { 'Content-Type': 'application/json' } });
    this.auth = { UserName: creds.username, Password: creds.password, AccountNumber: creds.accountNumber, AccountPin: creds.accountPin, AccountEntity: creds.accountEntity || 'IND', AccountCountryCode: creds.countryCode || 'IN' };
  }
  async createShipment(input) {
    const { data } = await this.client.post('/CreateShipments', { Shipments: [{ Shipper: input.from, Consignee: input.to, Details: input.details }], ClientInfo: this.auth });
    return { trackingNumber: data?.Shipments?.[0]?.ID, raw: data };
  }
  async trackShipment(trackingNumber) {
    const { data } = await axios.post('https://ws.aramex.net/ShippingAPI.V2/Tracking/Service_1_0.svc/json/TrackShipments', { ClientInfo: this.auth, Shipments: [trackingNumber] });
    return { status: data?.TrackingResults?.[0]?.UpdateDescription, raw: data };
  }
}

// Ekart (Flipkart-backed). Sellers integrated with Flipkart marketplace get
// Ekart by default; standalone usage requires partner credentials.
class EkartAdapter extends BaseAdapter {
  constructor(creds) { super(creds); this.client = bearerClient('https://api.ekart.flipkart.com/v3', creds.apiKey, { 'X-Merchant-Id': creds.merchantId }); }
  async createShipment(input) {
    const { data } = await this.client.post('/shipment/create', { source: input.from, destination: input.to, package: input.package });
    return { trackingNumber: data?.tracking_id, raw: data };
  }
  async trackShipment(trackingNumber) {
    const { data } = await this.client.get(`/track/${trackingNumber}`);
    return { status: data?.status, history: data?.events, raw: data };
  }
}

// India Post — uses the National Postal Service API.
class IndiaPostAdapter extends BaseAdapter {
  constructor(creds) { super(creds); this.client = axios.create({ baseURL: 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking', params: { LicenceKey: creds.licenseKey } }); }
  async trackShipment(trackingNumber) {
    const { data } = await this.client.get('/trackconsignment.aspx', { params: { id: trackingNumber } });
    return { status: data?.status || 'UNKNOWN', raw: data };
  }
  async createShipment() { return { error: 'India Post shipments are booked at counters; this adapter only supports tracking.' }; }
}

// Gati — surface express
class GatiAdapter extends BaseAdapter {
  constructor(creds) { super(creds); this.client = bearerClient('https://api.gati.com/v1', creds.apiKey); }
  async createShipment(input) {
    const { data } = await this.client.post('/booking', { consignor: input.from, consignee: input.to, dimensions: input.package });
    return { trackingNumber: data?.docket_no, raw: data };
  }
  async trackShipment(trackingNumber) {
    const { data } = await this.client.get(`/track/${trackingNumber}`);
    return { status: data?.status, raw: data };
  }
}

// Safexpress — B2B logistics
class SafexpressAdapter extends BaseAdapter {
  constructor(creds) { super(creds); this.client = basicClient('https://api.safexpress.com/v1', creds.username, creds.password); }
  async createShipment(input) {
    const { data } = await this.client.post('/booking/create', input);
    return { trackingNumber: data?.waybill_number, raw: data };
  }
  async trackShipment(trackingNumber) {
    const { data } = await this.client.get(`/tracking/${trackingNumber}`);
    return { status: data?.current_status, raw: data };
  }
}

// Trackon — pan-India courier
class TrackonAdapter extends BaseAdapter {
  constructor(creds) { super(creds); this.client = bearerClient('https://api.trackon.in/v2', creds.apiKey); }
  async createShipment(input) {
    const { data } = await this.client.post('/shipment', input);
    return { trackingNumber: data?.awb, raw: data };
  }
  async trackShipment(awb) {
    const { data } = await this.client.get(`/track/${awb}`);
    return { status: data?.status, raw: data };
  }
}

// The Professional Couriers (TPC)
class ProfessionalCouriersAdapter extends BaseAdapter {
  constructor(creds) { super(creds); this.client = axios.create({ baseURL: 'https://www.tpcindia.com/api', headers: { 'Api-Key': creds.apiKey } }); }
  async createShipment(input) {
    const { data } = await this.client.post('/booking', input);
    return { trackingNumber: data?.consignment_no, raw: data };
  }
  async trackShipment(consignmentNo) {
    const { data } = await this.client.get(`/track`, { params: { consignment_no: consignmentNo } });
    return { status: data?.status, raw: data };
  }
}

// Smartr Logistics
class SmartrAdapter extends BaseAdapter {
  constructor(creds) { super(creds); this.client = bearerClient('https://api.smartr.in/v1', creds.apiKey); }
  async createShipment(input) {
    const { data } = await this.client.post('/shipments', input);
    return { trackingNumber: data?.awb_number, raw: data };
  }
  async trackShipment(awb) {
    const { data } = await this.client.get(`/track/${awb}`);
    return { status: data?.current_status, raw: data };
  }
}

// Shyplite — multi-carrier aggregator
class ShypliteAdapter extends BaseAdapter {
  constructor(creds) { super(creds); this.client = bearerClient('https://api.shyplite.com/v1', creds.apiKey); }
  async getRates(input) {
    const { data } = await this.client.post('/rates', input);
    return data?.rates || [];
  }
  async createShipment(input) {
    const { data } = await this.client.post('/orders', input);
    return { trackingNumber: data?.awb, courierName: data?.carrier, raw: data };
  }
  async trackShipment(awb) { const { data } = await this.client.get(`/tracking/${awb}`); return { status: data?.status, raw: data }; }
}

// iCarry — multi-carrier aggregator
class ICarryAdapter extends BaseAdapter {
  constructor(creds) { super(creds); this.client = bearerClient('https://api.icarry.in/v1', creds.apiKey); }
  async getRates(input) { const { data } = await this.client.post('/rates', input); return data?.rates || []; }
  async createShipment(input) { const { data } = await this.client.post('/shipments', input); return { trackingNumber: data?.awb, raw: data }; }
  async trackShipment(awb) { const { data } = await this.client.get(`/track/${awb}`); return { status: data?.status, raw: data }; }
}

// DotZot
class DotZotAdapter extends BaseAdapter {
  constructor(creds) { super(creds); this.client = bearerClient('https://api.dotzot.in/v1', creds.apiKey); }
  async createShipment(input) { const { data } = await this.client.post('/booking', input); return { trackingNumber: data?.docket, raw: data }; }
  async trackShipment(docket) { const { data } = await this.client.get(`/track/${docket}`); return { status: data?.status, raw: data }; }
}

// ShipDelight
class ShipDelightAdapter extends BaseAdapter {
  constructor(creds) { super(creds); this.client = bearerClient('https://api.shipdelight.com/v1', creds.apiKey); }
  async getRates(input) { const { data } = await this.client.post('/rate-calculator', input); return data?.rates || []; }
  async createShipment(input) { const { data } = await this.client.post('/shipments', input); return { trackingNumber: data?.awb, raw: data }; }
  async trackShipment(awb) { const { data } = await this.client.get(`/tracking/${awb}`); return { status: data?.status, raw: data }; }
}

// Rapidshyp, Shipmozo, Vamaship, Bigship, Shipyaari — multi-carrier aggregators.
// Endpoint shapes are best-effort (no public sandbox to verify); listed as
// "coming soon" in the catalog until smoke-tested with real credentials.
function aggregator(base, ratesPath, createPath, trackPath) {
  return class extends BaseAdapter {
    constructor(creds) { super(creds); this.client = bearerClient(base, creds.apiKey); }
    async getRates(input) { const { data } = await this.client.post(ratesPath, input); return data?.rates || []; }
    async createShipment(input) { const { data } = await this.client.post(createPath, input); return { trackingNumber: data?.awb, awbCode: data?.awb, raw: data }; }
    async trackShipment(awb) { const { data } = await this.client.get(`${trackPath}/${awb}`); return { status: data?.status, currentStatus: data?.status, raw: data }; }
  };
}
const RapidshypAdapter = aggregator('https://api.rapidshyp.com/rapidshyp/apis/v1', '/rates', '/create_order', '/track_order');
const ShipmozoAdapter  = aggregator('https://shipping-api.com/app/api/v1', '/rate-calculator', '/push-order', '/track-order');
const VamashipAdapter  = aggregator('https://api.vamaship.com/ext/v1', '/rates', '/bookings', '/track');
const BigshipAdapter   = aggregator('https://api.bigship.in/api', '/calculator', '/order/add/single', '/tracking');
const ShipyaariAdapter = aggregator('https://api.shipyaari.com/v1', '/rates', '/orders', '/tracking');

module.exports = {
  AramexAdapter, EkartAdapter, IndiaPostAdapter, GatiAdapter, SafexpressAdapter,
  TrackonAdapter, ProfessionalCouriersAdapter, SmartrAdapter, ShypliteAdapter,
  ICarryAdapter, DotZotAdapter, ShipDelightAdapter,
  RapidshypAdapter, ShipmozoAdapter, VamashipAdapter, BigshipAdapter, ShipyaariAdapter,
};
