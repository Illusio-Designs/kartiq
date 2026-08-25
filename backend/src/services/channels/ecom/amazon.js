const axios = require('axios');
const settings = require('../../settings.service');
const {
  LWA_TOKEN_URL: LWA_URL,
  AMAZON_MARKETPLACE_IDS: MARKETPLACE_IDS,
  getEndpoint,
} = require('../../../config/channel-endpoints');

// Amazon OrderStatus → Kartriq order status. Amazon reports more states than a
// naive Shipped/Pending split: Unshipped/PartiallyShipped are in-progress,
// Canceled must not linger as PENDING, InvoiceUnconfirmed is effectively
// pending. Anything unknown falls back to PENDING so a new Amazon status never
// silently maps to SHIPPED.
const AMAZON_ORDER_STATUS = {
  Pending: 'PENDING',
  PendingAvailability: 'PENDING',
  InvoiceUnconfirmed: 'PENDING',
  Unshipped: 'PROCESSING',
  PartiallyShipped: 'PROCESSING',
  Shipped: 'SHIPPED',
  Canceled: 'CANCELLED',
  Cancelled: 'CANCELLED',
  Unfulfillable: 'CANCELLED',
};

// Region → Amazon storefront domain, for building a buyer-facing order URL that
// points at the right marketplace instead of hardcoding amazon.in.
const AMAZON_DOMAIN = {
  IN: 'amazon.in', US: 'amazon.com', CA: 'amazon.ca', MX: 'amazon.com.mx',
  BR: 'amazon.com.br', UK: 'amazon.co.uk', DE: 'amazon.de', FR: 'amazon.fr',
  IT: 'amazon.it', ES: 'amazon.es', NL: 'amazon.nl', SE: 'amazon.se',
  PL: 'amazon.pl', TR: 'amazon.com.tr', AE: 'amazon.ae', SA: 'amazon.sa',
  EG: 'amazon.eg', ZA: 'amazon.co.za', JP: 'amazon.co.jp', AU: 'amazon.com.au',
  SG: 'amazon.sg',
};

// When a legacy connection stored a zone code (EU/NA/FE) as its region instead
// of a country code, pick the primary marketplace for that zone so we don't
// fall back to India's marketplace for a US or Japan seller.
const ZONE_DEFAULT_REGION = { EU: 'IN', NA: 'US', FE: 'JP' };

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
    // Normalize the stored region. Historically some connections saved a zone
    // code (EU/NA/FE) here rather than a country code; map those to that zone's
    // primary marketplace so we don't misroute the marketplaceId to India.
    let region = this.creds.region || 'IN';
    if (!MARKETPLACE_IDS[region]) region = ZONE_DEFAULT_REGION[region] || 'IN';
    this.region = region;
    this.endpoint = getEndpoint('AMAZON', this.region);
    this.marketplaceId = MARKETPLACE_IDS[this.region] || MARKETPLACE_IDS.IN;
    this._accessToken = null;
    this._tokenExpiry = null;
  }

  // Amazon's getOrderItems is rate-limited (~0.5 req/s with a small burst).
  // A tiny delay between per-order item pulls keeps a multi-order sync under
  // the throttle instead of tripping 429s partway through.
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  // A Restricted Data Token (RDT) unlocks buyer PII (name, email, shipping
  // address) on the orders endpoints — but only if the seller has authorized
  // the app for the PII role. Request one scoped to exactly the resources we
  // need; callers fall back to the normal token when this throws (no role).
  async _getRestrictedToken(restrictedResources) {
    const token = await this._getAccessToken();
    const { data } = await axios.post(
      `${this.endpoint}/tokens/2021-03-01/restrictedDataToken`,
      { restrictedResources },
      { headers: { 'x-amz-access-token': token, 'Content-Type': 'application/json' } }
    );
    return data.restrictedDataToken;
  }

  async _request(method, path, params = {}, tokenOverride = null) {
    const MAX_RETRIES = 4;
    let attempt = 0;
    let refreshedOn403 = false;
    for (;;) {
      const token = tokenOverride || await this._getAccessToken();
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

        // 429 — throttled. SP-API publishes a per-operation rate; honour
        // Retry-After when present, otherwise exponential backoff, and retry
        // instead of dropping the order/SKU mid-sync.
        if (status === 429 && attempt < MAX_RETRIES) {
          const retryAfter = parseFloat(err.response?.headers?.['retry-after']);
          const waitMs = Number.isFinite(retryAfter)
            ? Math.min(30000, retryAfter * 1000)
            : Math.min(8000, 500 * 2 ** attempt);
          attempt += 1;
          await this._sleep(waitMs);
          continue;
        }

        // 403 with our own (non-RDT) token — the cached access token may be
        // stale/rotated; force one refresh and retry before giving up. (A
        // genuine authorization 403 will simply 403 again and fall through.)
        if (status === 403 && !tokenOverride && !refreshedOn403) {
          refreshedOn403 = true;
          this._accessToken = null;
          this._tokenExpiry = 0;
          continue;
        }

        const body  = err.response?.data;
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
  }

  async testConnection() {
    const data = await this._request('GET', '/sellers/v1/marketplaceParticipations');
    const participations = data.payload || [];
    return { success: true, marketplaces: participations.map(p => p.marketplace?.name) };
  }

  async fetchOrders(sinceDate) {
    // Amazon's Orders API REQUIRES CreatedAfter or LastUpdatedAfter (exactly
    // one); calling it without either returns 400. On a first sync there is no
    // lastSyncAt, so default to the last 30 days. Accept a Date, an ISO string,
    // or the { since } wrapper the cron passes, and always send ISO-8601.
    let since = sinceDate;
    if (since && typeof since === 'object' && !(since instanceof Date)) since = since.since;
    if (!since) since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sinceIso = since instanceof Date ? since.toISOString() : new Date(since).toISOString();

    // Use LastUpdatedAfter (not CreatedAfter) so an incremental sync also
    // re-fetches orders that were created earlier but have since changed —
    // shipped, cancelled, delivered — letting importOrders advance their local
    // status. CreatedAfter would only ever return brand-new orders and miss
    // every subsequent state change. (LastUpdatedAfter can't be combined with a
    // CreatedBefore/After window, which is why we send it alone.)
    const params = {
      MarketplaceIds: this.marketplaceId,
      OrderStatuses: 'Unshipped,PartiallyShipped,Shipped,Pending,Canceled',
      LastUpdatedAfter: sinceIso,
    };
    // Try to include buyer PII + shipping address via a Restricted Data Token.
    // If the seller hasn't granted the PII role, the RDT request throws and we
    // silently fall back to the plain token (orders arrive without buyer name/
    // email/address, same as before — no hard failure).
    let ordersToken = null;
    try {
      ordersToken = await this._getRestrictedToken([
        { method: 'GET', path: '/orders/v0/orders', dataElements: ['buyerInfo', 'shippingAddress'] },
      ]);
    } catch (_) { /* no PII role — proceed without buyer data */ }
    // Paginate. The Orders API returns at most ~100 orders per page and a
    // NextToken for the rest — without following it, any sync window with more
    // than one page SILENTLY DROPS the remaining orders. The first call carries
    // the LastUpdatedAfter filter; every subsequent call must send NextToken
    // alone (plus MarketplaceIds) — the filter can't be combined with the token.
    const rawOrders = [];
    let nextToken = null;
    let page = 0;
    const MAX_PAGES = 100; // safety cap (~10k orders per window) against a runaway loop
    do {
      if (page > 0) await this._sleep(700); // stay under the getOrders throttle
      const reqParams = nextToken
        ? { MarketplaceIds: this.marketplaceId, NextToken: nextToken }
        : params;
      const data = await this._request('GET', '/orders/v0/orders', reqParams, ordersToken);
      const pageOrders = data.payload?.Orders || [];
      rawOrders.push(...pageOrders);
      nextToken = data.payload?.NextToken || null;
      page += 1;
    } while (nextToken && page < MAX_PAGES);

    const mapped = rawOrders.map(o => this._transformOrder(o));
    // getOrders returns order headers only — pull each order's line items so
    // orders arrive with their real products/SKUs (and the catalog can fill
    // itself). The item pull also carries the money breakdown (item price, tax,
    // shipping, discount) that the header alone doesn't split out, so we use it
    // to replace the transformed order's subtotal/tax/shipping/discount.
    // Best-effort per order: a failure (e.g. Amazon rate limit) leaves that
    // order's items empty, and the next sync backfills them.
    for (let i = 0; i < rawOrders.length; i++) {
      if (i > 0) await this._sleep(600); // stay under the getOrderItems throttle
      try {
        const { items, totals } = await this._getOrderItems(rawOrders[i].AmazonOrderId);
        mapped[i].items = items;
        // Only override the header total split when the item pull actually
        // returned money; an empty result keeps the header fallback.
        if (items.length) {
          mapped[i].subtotal = totals.subtotal;
          mapped[i].tax = totals.tax;
          mapped[i].shippingCharge = totals.shipping;
          mapped[i].discount = totals.discount;
        }
      } catch (_) { /* keep items empty; retried on the next sync */ }
    }
    return mapped;
  }

  // Amazon SP-API Orders — line items for one order (a separate endpoint from
  // getOrders). Returns { items, totals } where items match what importOrders
  // expects (qty + unitPrice) and totals split the order's money into
  // subtotal / tax / shipping / discount (the order header lumps them into one
  // OrderTotal). SP-API money fields are line totals, not per-unit.
  async _getOrderItems(amazonOrderId) {
    const data = await this._request('GET', `/orders/v0/orders/${encodeURIComponent(amazonOrderId)}/orderItems`);
    const raw = data.payload?.OrderItems || [];
    const num = (m) => parseFloat(m?.Amount || 0) || 0;
    const totals = { subtotal: 0, tax: 0, shipping: 0, discount: 0 };
    const items = raw.map((it) => {
      const qty = Number(it.QuantityOrdered || 1) || 1;
      const itemPrice = num(it.ItemPrice);          // line total for the item(s), pre-tax
      const itemTax = num(it.ItemTax);
      const shipping = num(it.ShippingPrice);
      const shippingTax = num(it.ShippingTax);
      const promo = num(it.PromotionDiscount);
      const shipPromo = num(it.ShippingDiscount);
      totals.subtotal += itemPrice;
      totals.tax += itemTax + shippingTax;
      totals.shipping += shipping;
      totals.discount += promo + shipPromo;
      return {
        channelSku: it.SellerSKU || it.ASIN || null,
        name: it.Title || it.SellerSKU || 'Amazon item',
        qty,
        unitPrice: qty > 0 ? itemPrice / qty : itemPrice,
      };
    });
    // Round to 2dp to avoid float drift accumulating across many lines.
    for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 100) / 100;
    return { items, totals };
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

  // Confirm a merchant-fulfilled (MFN) shipment back to Amazon so the buyer
  // sees tracking and Amazon marks the order Shipped instead of auto-cancelling
  // it. FBA orders ship themselves and must NOT be confirmed here.
  // Docs: Orders API confirmShipment.
  async confirmShipment(amazonOrderId, { trackingNumber, carrierCode, carrierName, shipDate } = {}) {
    if (!trackingNumber) throw new Error('confirmShipment requires a trackingNumber');
    // Amazon wants each line as { orderItemId, quantity } — fetch the item ids.
    const itemsData = await this._request('GET', `/orders/v0/orders/${encodeURIComponent(amazonOrderId)}/orderItems`);
    const orderItems = (itemsData.payload?.OrderItems || []).map((it) => ({
      orderItemId: it.OrderItemId,
      quantity: Number(it.QuantityOrdered || 1) || 1,
    }));
    if (!orderItems.length) throw new Error('confirmShipment: order has no items to confirm');

    const packageDetail = {
      packageReferenceId: `${amazonOrderId}-1`,
      trackingNumber,
      shipDate: (shipDate ? new Date(shipDate) : new Date()).toISOString(),
      orderItems,
    };
    // Amazon needs a carrier: prefer the standardized carrierCode, else the
    // free-text carrierName.
    if (carrierCode) packageDetail.carrierCode = carrierCode;
    else if (carrierName) packageDetail.carrierName = carrierName;
    else packageDetail.carrierName = 'Other';

    const token = await this._getAccessToken();
    const { data } = await axios.post(
      `${this.endpoint}/orders/v0/orders/${encodeURIComponent(amazonOrderId)}/shipmentConfirmation`,
      { marketplaceId: this.marketplaceId, packageDetail },
      { headers: { 'x-amz-access-token': token, 'Content-Type': 'application/json' } }
    );
    return { channel: 'AMAZON', orderId: amazonOrderId, confirmed: true, response: data };
  }

  // Pull the seller's FBA catalog + on-hand stock (SKU, title, quantity) in one
  // shot so a first-time tenant can seed products/inventory. FBA only — MFN
  // stock lives in Kartriq. Paginated via nextToken.
  async fetchInventorySummaries() {
    const base = {
      details: true,
      granularityType: 'Marketplace',
      granularityId: this.marketplaceId,
      marketplaceIds: this.marketplaceId,
    };
    const out = [];
    let nextToken = null;
    let guard = 0;
    do {
      const params = nextToken ? { ...base, nextToken } : base;
      const data = await this._request('GET', '/fba/inventory/v1/summaries', params);
      const summaries = data.payload?.inventorySummaries || data.inventorySummaries || [];
      for (const s of summaries) {
        const sku = s.sellerSku || s.asin;
        if (!sku) continue;
        out.push({ channelSku: sku, name: s.productName || sku, quantity: Number(s.totalQuantity || 0) });
      }
      nextToken = data.pagination?.nextToken || null;
    } while (nextToken && ++guard < 50 && out.length < 5000);
    return out;
  }

  // Pull the seller's ENTIRE catalog — every active listing, FBA *and*
  // merchant-fulfilled, with price + quantity — in one shot via the Reports
  // API. fetchInventorySummaries (above) only sees FBA items that currently
  // hold stock; this is the "all products at once" path. Flow: request a
  // GET_MERCHANT_LISTINGS_ALL_DATA report, poll until DONE, download the
  // (optionally gzipped) flat file, and parse its tab-separated rows.
  //
  // Requires the app + seller authorization to include the Amazon "Product
  // Listing" / Reports role; without it the createReport call 403s.
  async fetchAllListings() {
    const zlib = require('zlib');
    const REPORTS = '/reports/2021-06-30';

    // 1. Ask Amazon to build the listings report.
    const token = await this._getAccessToken();
    let reportId;
    try {
      const { data } = await axios({
        method: 'POST',
        url: `${this.endpoint}${REPORTS}/reports`,
        headers: { 'x-amz-access-token': token, 'Content-Type': 'application/json' },
        data: { reportType: 'GET_MERCHANT_LISTINGS_ALL_DATA', marketplaceIds: [this.marketplaceId] },
      });
      reportId = data.reportId;
    } catch (err) {
      const status = err.response?.status;
      const apiMsg = err.response?.data?.errors?.[0]?.message || err.message;
      const hint = status === 403
        ? ' — the seller/app must be authorized for the Amazon Product Listing (Reports) role.'
        : '';
      throw new Error(`Amazon createReport failed (${status || '?'}): ${apiMsg}${hint}`);
    }
    if (!reportId) throw new Error('Amazon createReport returned no reportId');

    // 2. Poll until the report finishes (usually seconds; cap ~80s so the
    //    request can't hang forever — a very large catalog can be moved to a
    //    background job later).
    let documentId = null;
    for (let i = 0; i < 20; i++) {
      await this._sleep(i === 0 ? 3000 : 4000);
      const r = await this._request('GET', `${REPORTS}/reports/${reportId}`);
      const st = r.processingStatus;
      if (st === 'DONE') { documentId = r.reportDocumentId; break; }
      if (st === 'CANCELLED') return [];               // nothing to report
      if (st === 'FATAL') throw new Error('Amazon listings report failed (FATAL) — check the seller authorization/roles.');
    }
    if (!documentId) throw new Error('Amazon listings report is still processing — try Pull Catalog again in a moment.');

    // 3. Fetch the document handle (presigned URL + optional gzip) and download.
    const meta = await this._request('GET', `${REPORTS}/documents/${documentId}`);
    const resp = await axios.get(meta.url, { responseType: 'arraybuffer' });
    let buf = Buffer.from(resp.data);
    if (meta.compressionAlgorithm === 'GZIP') buf = zlib.gunzipSync(buf);
    // Amazon flat files are Latin-1 unless the handle says otherwise.
    const enc = /utf-?8/i.test(meta.reportDocumentEncoding || '') ? 'utf-8' : 'latin1';
    return this._parseListingsReport(buf.toString(enc));
  }

  // Parse a GET_MERCHANT_LISTINGS_ALL_DATA flat file (tab-separated, header
  // row) into the shape importCatalogFromChannel expects. Column order varies
  // by marketplace, so we index by header name (and tolerate the British
  // "fulfilment-channel" spelling). fulfillment-channel "DEFAULT" = merchant
  // fulfilled (SELF); anything else (AMAZON_*) = FBA (CHANNEL).
  _parseListingsReport(text) {
    const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const header = lines[0].split('\t').map((h) => h.trim().toLowerCase());
    const col = (name) => header.indexOf(name);
    const iSku   = col('seller-sku');
    const iName  = col('item-name');
    const iPrice = col('price');
    const iQty   = col('quantity');
    const iAsin  = col('asin1') !== -1 ? col('asin1') : col('product-id');
    const iFulfil = col('fulfillment-channel') !== -1 ? col('fulfillment-channel') : col('fulfilment-channel');
    const iStatus = col('status');
    if (iSku === -1) return [];

    const out = [];
    for (let r = 1; r < lines.length; r++) {
      const c = lines[r].split('\t');
      const sku = (c[iSku] || '').trim();
      if (!sku) continue;
      if (iStatus !== -1 && /inactive/i.test(c[iStatus] || '')) continue; // skip inactive listings
      const fulfil = (iFulfil !== -1 ? c[iFulfil] : '').trim().toUpperCase();
      out.push({
        channelSku: sku,
        name: (iName !== -1 && c[iName] ? c[iName] : sku).trim(),
        quantity: iQty !== -1 ? Number(c[iQty]) || 0 : 0,
        unitPrice: iPrice !== -1 ? Number(c[iPrice]) || 0 : 0,
        asin: iAsin !== -1 ? (c[iAsin] || '').trim() : undefined,
        // DEFAULT / '' = merchant-fulfilled; AMAZON_* = FBA.
        fulfillmentType: fulfil && fulfil !== 'DEFAULT' ? 'CHANNEL' : 'SELF',
      });
    }
    return out;
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
      status: AMAZON_ORDER_STATUS[o.OrderStatus] || 'PENDING',
      orderedAt: new Date(o.PurchaseDate),
      // Fulfillment model: AFN = Amazon FBA, MFN = Merchant Fulfilled
      fulfillment_channel: o.FulfillmentChannel,
      fulfillmentCenter: o.ShippingAddress?.CountryCode
        ? `${o.FulfillmentChannel}-${o.ShippingAddress?.StateOrRegion || ''}`
        : null,
      // ShipmentServiceLevelCategory is the shipping speed (e.g. "Standard"),
      // NOT a tracking number — leave awb null. The real carrier + tracking#
      // arrive via a shipment-confirmation feed we don't yet consume, so we
      // stash the service level separately for reference rather than
      // masquerading it as an AWB.
      awb: null,
      shipmentServiceLevel: o.ShipmentServiceLevelCategory || null,
      trackingUrl: o.AmazonOrderId
        ? `https://www.${AMAZON_DOMAIN[this.region] || 'amazon.in'}/gp/your-account/order-details?orderID=${o.AmazonOrderId}`
        : null,
    };
  }
}

module.exports = AmazonAdapter;
