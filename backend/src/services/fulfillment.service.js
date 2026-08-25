// Fulfillment model + data completeness handling
//
// Not all channels ship the same way:
//   SELF      — tenant ships from their own warehouse (most marketplaces, D2C)
//   CHANNEL   — channel ships from their FC (Amazon FBA, Flipkart SF, quick commerce)
//   DROPSHIP  — vendor ships directly, tenant never touches goods
//
// Not all channels give complete order data:
//   COMPLETE  — everything: name, phone, pincode, full address, items, payment
//   PARTIAL   — missing one or two fields (e.g. no phone, no email)
//   MINIMAL   — just items + contact handle (WhatsApp, some FB orders)
//
// This service classifies each inbound order so downstream routing/shipping logic
// can do the right thing.

// Channel-type → default fulfillment hint. BOTH means per-listing, so we default
// to SELF unless the raw order payload explicitly signals otherwise.
const CHANNEL_FULFILLMENT_HINT = {
  AMAZON:          'BOTH',   // FBA + MFN
  AMAZON_SMARTBIZ: 'CHANNEL',// Smart Biz is FBA-only
  FLIPKART:        'BOTH',   // Smart Fulfillment + Self
  MYNTRA:          'CHANNEL',// Mostly Myntra-fulfilled
  MEESHO:          'SELF',
  NYKAA:           'CHANNEL',// Nykaa Fulfillment
  AJIO:            'BOTH',
  TATA_CLIQ:       'BOTH',
  SNAPDEAL:        'SELF',
  JIOMART:         'BOTH',
  PAYTM_MALL:      'SELF',
  LIMEROAD:        'SELF',
  EBAY:            'SELF',
  ETSY:            'SELF',
  GLOWROAD:        'SELF',

  SHOPIFY:         'SELF',
  WOOCOMMERCE:     'SELF',
  MAGENTO:         'SELF',
  BIGCOMMERCE:     'SELF',
  WIX:             'SELF',
  SQUARESPACE:     'SELF',
  PRESTASHOP:      'SELF',
  OPENCART:        'SELF',
  SHOPWARE:        'SELF',

  BLINKIT:           'CHANNEL', // dark store inventory
  SWIGGY_INSTAMART:  'CHANNEL',
  BB_NOW:            'CHANNEL',

  FACEBOOK:          'SELF',
  INSTAGRAM:         'SELF',
  WHATSAPP_BUSINESS: 'SELF',

  B2B_PORTAL:    'SELF',
  WHOLESALE:     'SELF',
  DISTRIBUTOR:   'DROPSHIP',

  WEBSITE:           'SELF',
  CUSTOM_WEBHOOK:    'SELF',
  OFFLINE:           'SELF',
};

// Pick the effective fulfillment type for a specific order.
// Priority:
//   1. Explicit signal from the raw order (e.g. Amazon's `fulfillment_channel: AFN`)
//   2. Channel record's `defaultFulfillmentType` (tenant override)
//   3. Channel-type default (above)
function resolveFulfillmentType(raw, channel) {
  // Explicit from adapter's normalised payload
  if (raw?.fulfillmentType && ['SELF', 'CHANNEL', 'DROPSHIP'].includes(raw.fulfillmentType)) {
    return raw.fulfillmentType;
  }
  // Amazon sends fulfillment_channel in SP-API orders
  const fc = raw?.fulfillmentChannel || raw?.fulfillment_channel;
  if (fc === 'AFN') return 'CHANNEL';  // Amazon FBA
  if (fc === 'MFN') return 'SELF';     // Merchant Fulfilled

  if (channel?.defaultFulfillmentType && ['SELF', 'CHANNEL', 'DROPSHIP'].includes(channel.defaultFulfillmentType)) {
    return channel.defaultFulfillmentType;
  }

  const hint = CHANNEL_FULFILLMENT_HINT[channel?.type] || 'SELF';
  return hint === 'BOTH' ? 'SELF' : hint; // default to SELF when ambiguous
}

// Inspect an order and return { level, missing: [...] } so the UI can show
// a badge and optionally offer an enrichment form.
function assessCompleteness(raw, { fulfillmentType } = {}) {
  const missing = [];

  const customer = raw?.customer || {};
  if (!customer.name || customer.name.trim() === '') missing.push('customer.name');
  if (!customer.phone && !customer.email) missing.push('customer.contact');

  // Address only required when the tenant ships the order themselves
  if (fulfillmentType !== 'CHANNEL') {
    const addr = raw?.shippingAddress || {};
    if (!addr.line1) missing.push('shippingAddress.line1');
    if (!addr.city) missing.push('shippingAddress.city');
    if (!addr.pincode) missing.push('shippingAddress.pincode');
  }

  const items = Array.isArray(raw?.items) ? raw.items : [];
  if (items.length === 0) missing.push('items');

  let level = 'COMPLETE';
  if (missing.length > 0) level = missing.length > 2 ? 'MINIMAL' : 'PARTIAL';
  return { level, missing };
}

module.exports = {
  resolveFulfillmentType,
  assessCompleteness,
  CHANNEL_FULFILLMENT_HINT,
};
