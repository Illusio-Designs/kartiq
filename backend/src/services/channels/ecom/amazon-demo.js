// Demo Amazon adapter — a self-contained stand-in for Amazon, used ONLY by the
// demo channel on the demo tenant (channels.isDemo = 1, see demo.service.js).
//
// It makes no network calls and costs nothing: rates are computed from the
// parcel weight, "buying" produces a clearly-marked DEMO label PDF, cancelling
// always succeeds. Everything on the Kartriq side (confirm → auto-book → label →
// SHIPPED, cancel/un-ship, packing slips, bulk printing) runs the real code
// against it, so testers can click through the whole flow on a live site
// without an Amazon account.
//
// It deliberately mirrors the method names/shapes of AmazonAdapter.

const { randomUUID } = require('crypto');

const CURRENCY = 'INR';

// Orders whose Amazon order id ends with this fail at purchase time, so testers
// can see the "booking failed + Retry" experience.
const FAIL_SUFFIX = '-ERR';

function kg(weight) {
  const v = Number(weight?.value) || 500;
  const u = String(weight?.unit || 'grams').toLowerCase();
  return u.startsWith('k') ? v : u.startsWith('p') || u.startsWith('l') ? v * 0.4536 : v / 1000;
}

const round2 = (n) => Math.round(n * 100) / 100;

class AmazonDemoAdapter {
  constructor() { this.isDemo = true; }

  async testConnection() {
    return { success: true, marketplaces: ['Amazon.in (DEMO — not connected to real Amazon)'] };
  }

  // Orders are created by "Reset demo data" (not by polling) so the background
  // sync never spams the demo tenant.
  async fetchOrders() { return []; }
  async fetchAllListings() { return []; }
  async fetchInventorySummaries() { return []; }
  async fetchFinancialEventGroups() { return []; }
  async fetchReturns() { return []; }
  async updateInventoryLevel() { return { updated: true, demo: true }; }
  async updateListing() { return { updated: true, demo: true }; }
  async requestReview() { return { success: true, demo: true }; }
  async confirmShipment() { return { confirmed: true, demo: true }; }

  _requireShipFrom(opts) {
    const s = opts?.shipFrom || {};
    if (!s.pincode || !s.city) {
      throw new Error('Amazon Buy Shipping rates failed (400): ShipFromAddress needs a city and postal code (demo)');
    }
  }

  async getMfnRates(amazonOrderId, opts = {}) {
    this._requireShipFrom(opts);
    const w = kg(opts.weight);
    const today = new Date();
    const day = (n) => new Date(today.getTime() + n * 86400000).toISOString();
    return [
      { serviceId: 'DEMO-EXPRESS', serviceOfferId: 'demo-off-express', name: 'Express (1–2 days)', carrier: 'DemoExpress', amount: round2(95 + 40 * w), currency: CURRENCY, shipDate: day(0), estimatedDelivery: day(2) },
      { serviceId: 'DEMO-SURFACE', serviceOfferId: 'demo-off-surface', name: 'Surface (4–6 days)', carrier: 'DemoSurface', amount: round2(58 + 26 * w), currency: CURRENCY, shipDate: day(0), estimatedDelivery: day(6) },
      { serviceId: 'DEMO-STANDARD', serviceOfferId: 'demo-off-standard', name: 'Standard (3–4 days)', carrier: 'DemoPost', amount: round2(45 + 28 * w), currency: CURRENCY, shipDate: day(0), estimatedDelivery: day(4) },
    ];
  }

  async buyMfnShipping(amazonOrderId, opts = {}) {
    if (!opts.shippingServiceId) throw new Error('buyMfnShipping requires a shippingServiceId');
    this._requireShipFrom(opts);
    if (String(amazonOrderId).endsWith(FAIL_SUFFIX)) {
      throw new Error('Amazon Buy Shipping purchase failed (400): Address could not be verified (demo order built to fail)');
    }
    const rates = await this.getMfnRates(amazonOrderId, opts);
    const chosen = rates.find((r) => r.serviceId === opts.shippingServiceId) || rates[rates.length - 1];
    const tracking = `DEMO${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
    const shipmentId = `DEMO-SHIP-${randomUUID().slice(0, 8).toUpperCase()}`;
    const pdf = await this._labelPdf({ amazonOrderId, tracking, chosen, opts });
    return {
      shipmentId,
      trackingId: tracking,
      carrier: chosen.carrier,
      serviceName: chosen.name,
      cost: { amount: chosen.amount, currency: CURRENCY },
      status: 'Purchased',
      label: { contentBase64: pdf.toString('base64'), mime: 'application/pdf' },
    };
  }

  async cancelMfnShipping(shipmentId) {
    return { cancelled: true, shipmentId, demo: true };
  }

  // A 4×6 inch label, unmistakably marked as a demo so nobody ships with it.
  async _labelPdf({ amazonOrderId, tracking, chosen, opts }) {
    // Lazy: a server whose node_modules lacks pdf-lib must still boot.
    let PDFDocument, StandardFonts, rgb;
    try { ({ PDFDocument, StandardFonts, rgb } = require('pdf-lib')); } catch {
      throw new Error('Demo labels need the "pdf-lib" package — run "NPM install" for the backend and restart.');
    }
    const doc = await PDFDocument.create();
    const page = doc.addPage([288, 432]);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const mono = await doc.embedFont(StandardFonts.Courier);
    const s = opts.shipFrom || {};
    page.drawRectangle({ x: 8, y: 8, width: 272, height: 416, borderColor: rgb(0, 0, 0), borderWidth: 2 });
    page.drawRectangle({ x: 8, y: 372, width: 272, height: 52, color: rgb(0.85, 0.1, 0.1) });
    page.drawText('DEMO LABEL', { x: 24, y: 394, size: 26, font: bold, color: rgb(1, 1, 1) });
    page.drawText('NOT VALID FOR SHIPPING', { x: 24, y: 379, size: 11, font: bold, color: rgb(1, 1, 1) });
    page.drawText(`${chosen.carrier} · ${chosen.name}`, { x: 20, y: 350, size: 13, font: bold });
    page.drawText(`Tracking: ${tracking}`, { x: 20, y: 328, size: 13, font: mono });
    page.drawText(`Order: ${amazonOrderId}`, { x: 20, y: 308, size: 11, font });
    page.drawText('SHIP FROM', { x: 20, y: 276, size: 9, font: bold, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(String(s.name || ''), { x: 20, y: 262, size: 12, font: bold });
    page.drawText(`${s.city || ''}${s.state ? ', ' + s.state : ''} ${s.pincode || ''}`.trim(), { x: 20, y: 247, size: 11, font });
    page.drawText(`Weight: ${Math.round(kg(opts.weight) * 1000)} g`, { x: 20, y: 215, size: 11, font });
    page.drawText(`Charge: ${CURRENCY} ${chosen.amount.toFixed(2)}`, { x: 20, y: 199, size: 11, font });
    // fake barcode bars
    let x = 20;
    for (const ch of tracking) {
      const n = (ch.charCodeAt(0) % 3) + 1;
      page.drawRectangle({ x, y: 90, width: n, height: 70, color: rgb(0, 0, 0) });
      x += n + 2;
      if (x > 268) break;
    }
    page.drawText(tracking, { x: 20, y: 72, size: 10, font: mono });
    page.drawText('Generated by Kartriq demo mode — no real Amazon shipment exists.', { x: 20, y: 28, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
    return Buffer.from(await doc.save());
  }
}

// The raw orders (same shape the real AmazonAdapter produces) that "Reset demo
// data" feeds through the real importOrders(): 1 FBA, 4 normal MFN, and 1 MFN
// that is built to fail at purchase time.
function buildDemoOrders({ sku, productName = 'Demo Widget', price = 399, stamp = Date.now() }) {
  const buyer = (n, city, state, pin) => ({
    customer: { name: `Demo Buyer ${n}`, email: `demo-buyer-${n}@example.com`, phone: '9000000000' },
    shippingAddress: { line1: `${10 + n} Demo Street`, city, state, pincode: pin, country: 'IN' },
  });
  const mk = (suffix, fc, qty, who, extra = {}) => ({
    channelOrderId: `DEMO-${stamp}-${suffix}`,
    channelOrderNumber: `DEMO-${stamp}-${suffix}`,
    ...who,
    items: [{ channelSku: sku, name: productName, qty, unitPrice: price }],
    subtotal: qty * price, shippingCharge: 0, tax: 0, discount: 0, total: qty * price,
    paymentMethod: 'Other', paymentStatus: 'PAID',
    status: 'PROCESSING',
    orderedAt: new Date(),
    fulfillment_channel: fc,
    awb: null,
    ...extra,
  });
  return [
    mk('FBA', 'AFN', 1, buyer(1, 'Mumbai', 'MH', '400001')),
    mk('MFN1', 'MFN', 1, buyer(2, 'Pune', 'MH', '411001')),
    mk('MFN2', 'MFN', 2, buyer(3, 'Bengaluru', 'KA', '560001')),
    mk('MFN3', 'MFN', 3, buyer(4, 'Delhi', 'DL', '110001')),
    mk('MFN4', 'MFN', 1, buyer(5, 'Chennai', 'TN', '600001')),
    mk(`MFN5${FAIL_SUFFIX}`, 'MFN', 1, buyer(6, 'Kolkata', 'WB', '700001')),
  ];
}

module.exports = AmazonDemoAdapter;
module.exports.buildDemoOrders = buildDemoOrders;
module.exports.FAIL_SUFFIX = FAIL_SUFFIX;
