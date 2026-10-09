// Shared logo helper for channel UIs (integrations page, dashboard channels
// page, anywhere a channel needs a brand mark). The strategy is:
//
//   logo.dev (brand-grade)  →  icon.horse  →  google favicon  →  gradient initials
//
// Each step is tried only when the previous one errors out (in the
// component, via onError). All sources resolve by domain, so we never need
// to ship per-channel PNG files. Keep TYPE_DOMAIN in sync with
// backend/src/data/channel-catalog.js when new channel types ship.

export const LOGO_DEV_TOKEN = 'pk_WxT43MWfRoWxBBSZlDWHbg';

export const TYPE_DOMAIN: Record<string, string> = {
  // ── Amazon family ──
  AMAZON: 'amazon.in',
  AMAZON_US: 'amazon.com',
  AMAZON_UK: 'amazon.co.uk',
  AMAZON_UAE: 'amazon.ae',
  AMAZON_SA: 'amazon.sa',
  AMAZON_SG: 'amazon.sg',
  AMAZON_AU: 'amazon.com.au',
  AMAZON_DE: 'amazon.de',
  AMAZON_SMARTBIZ: 'business.amazon.in',

  // ── ECOM India ──
  FLIPKART: 'flipkart.com',
  MYNTRA: 'myntra.com',
  MEESHO: 'meesho.com',
  NYKAA: 'nykaa.com',
  AJIO: 'ajio.com',
  TATA_CLIQ: 'tatacliq.com',
  SNAPDEAL: 'snapdeal.com',
  JIOMART: 'jiomart.com',
  PAYTM_MALL: 'paytmmall.com',
  GLOWROAD: 'glowroad.com',
  LIMEROAD: 'limeroad.com',
  EBAY: 'ebay.com',
  ETSY: 'etsy.com',
  FIRSTCRY: 'firstcry.com',
  PEPPERFRY: 'pepperfry.com',
  CROMA: 'croma.com',
  TATA_NEU: 'tataneu.com',

  // ── ECOM international ──
  WALMART: 'walmart.com',
  LAZADA: 'lazada.com',
  SHOPEE: 'shopee.com',
  NOON: 'noon.com',
  MERCADO_LIBRE: 'mercadolibre.com',
  ALLEGRO: 'allegro.pl',
  FRUUGO: 'fruugo.com',
  ONBUY: 'onbuy.com',
  MANOMANO: 'manomano.com',
  RAKUTEN: 'rakuten.co.jp',
  ZALANDO: 'zalando.com',
  KAUFLAND: 'kaufland.com',
  WISH: 'wish.com',

  // ── ECOM India gaps ──
  INDIAMART: 'indiamart.com',
  INDUSTRYBUYING: 'industrybuying.com',
  MOGLIX: 'moglix.com',
  PURPLLE: 'purplle.com',
  BEWAKOOF: 'bewakoof.com',
  SHOPCLUES: 'shopclues.com',

  // ── QUICKCOM ──
  BLINKIT: 'blinkit.com',
  ZEPTO: 'zeptonow.com',
  SWIGGY_INSTAMART: 'swiggy.com',
  BB_NOW: 'bigbasket.com',
  FLIPKART_MINUTES: 'flipkart.com',
  TATA_1MG: '1mg.com',
  DUNZO: 'dunzo.com',
  COUNTRY_DELIGHT: 'countrydelight.in',

  // ── LOGISTICS ──
  SHIPROCKET: 'shiprocket.in',
  DELHIVERY: 'delhivery.com',
  FSHIP: 'fship.in',
  PICKRR: 'pickrr.com',
  SHIPWAY: 'shipway.com',
  NIMBUSPOST: 'nimbuspost.com',
  CLICKPOST: 'clickpost.in',
  ITHINK: 'ithinklogistics.com',
  ECOMEXPRESS: 'ecomexpress.in',
  XPRESSBEES: 'xpressbees.com',
  SHADOWFAX: 'shadowfax.in',
  BLUEDART: 'bluedart.com',
  DTDC: 'dtdc.in',
  FEDEX: 'fedex.com',
  DHL: 'dhl.com',
  UPS: 'ups.com',
  ARAMEX: 'aramex.com',
  EKART: 'ekartlogistics.com',
  INDIA_POST: 'indiapost.gov.in',
  GATI: 'gati.com',
  SAFEXPRESS: 'safexpress.com',
  TRACKON: 'trackon.in',
  PROFESSIONAL_COURIERS: 'tpcindia.com',
  SMARTR: 'smartr.in',
  SHYPLITE: 'shyplite.com',
  ICARRY: 'icarry.in',
  DOTZOT: 'dotzot.in',
  SHIPDELIGHT: 'shipdelight.com',

  // ── OWNSTORE ──
  SHOPIFY: 'shopify.com',
  WOOCOMMERCE: 'woocommerce.com',
  MAGENTO: 'magento.com',
  BIGCOMMERCE: 'bigcommerce.com',
  OPENCART: 'opencart.com',
  WIX: 'wix.com',
  SQUARESPACE: 'squarespace.com',
  SALESFORCE_COMMERCE: 'salesforce.com',
  PRESTASHOP: 'prestashop.com',
  ECWID: 'ecwid.com',
  ZOHO_COMMERCE: 'zoho.com',
  DUKAAN: 'mydukaan.io',
  SHOOPY: 'shoopy.in',
  BIKAYI: 'bikayi.com',
  KARTROCKET: 'kartrocket.com',
  INSTAMOJO_PAGES: 'instamojo.com',

  // ── SOCIAL ──
  INSTAGRAM: 'instagram.com',
  FACEBOOK: 'facebook.com',
  WHATSAPP_BUSINESS: 'whatsapp.com',
  TIKTOK_SHOP: 'tiktok.com',
  PINTEREST: 'pinterest.com',
  YOUTUBE_SHOPPING: 'youtube.com',
  SNAPCHAT: 'snapchat.com',

  // ── PAYMENT ──
  RAZORPAY: 'razorpay.com',
  PAYU: 'payu.in',
  CCAVENUE: 'ccavenue.com',
  CASHFREE: 'cashfree.com',
  STRIPE: 'stripe.com',
  PAYPAL: 'paypal.com',
  PAYTM_PG: 'business.paytm.com',
  PHONEPE_BUSINESS: 'business.phonepe.com',
  INSTAMOJO: 'instamojo.com',

  // ── ACCOUNTING / ERP ──
  TALLY: 'tallysolutions.com',
  TALLY_PRIME: 'tallysolutions.com',
  ZOHO_BOOKS: 'zoho.com',
  QUICKBOOKS: 'quickbooks.intuit.com',
  XERO: 'xero.com',
  SAP_B1: 'sap.com',
  SAP_S4HANA: 'sap.com',
  ERPNEXT: 'erpnext.com',
  DYNAMICS_365: 'dynamics.microsoft.com',
  NETSUITE: 'netsuite.com',
  ODOO: 'odoo.com',
  BUSY: 'busy.in',
  MARG_ERP: 'margcompusoft.com',
  LOGIC_ERP: 'logicerp.com',

  // ── POS ──
  SHOPIFY_POS: 'shopify.com',
  SQUARE_POS: 'squareup.com',
  LIGHTSPEED_POS: 'lightspeedhq.com',
  LOYVERSE_POS: 'loyverse.com',
  GOFRUGAL: 'gofrugal.com',
  POSIST: 'posist.com',
  PETPOOJA: 'petpooja.com',
  VYAPAR: 'vyaparapp.in',
  ZOHO_POS: 'zoho.com',

  // ── TAX ──
  CLEARTAX: 'cleartax.in',
  GSTZEN: 'gstzen.in',
  TAXCLOUD_IRP: 'einvoice1.gst.gov.in',
  AVALARA: 'avalara.com',
  ZOHO_GST: 'zoho.com',

  // ── CRM ──
  HUBSPOT: 'hubspot.com',
  SALESFORCE_CRM: 'salesforce.com',
  ZOHO_CRM: 'zoho.com',
  MAILCHIMP: 'mailchimp.com',
  KLAVIYO: 'klaviyo.com',
  SENDINBLUE: 'brevo.com',
  WEBENGAGE: 'webengage.com',
  MOENGAGE: 'moengage.com',
  CLEVERTAP: 'clevertap.com',
  FRESHDESK: 'freshworks.com',
  ZENDESK: 'zendesk.com',
  GORGIAS: 'gorgias.com',

  // ── RETURNS ──
  RETURN_PRIME: 'returnprime.com',
  WERETURN: 'wereturn.in',
  ANCHANTO_RETURNS: 'anchanto.com',
  EASYVMS: 'vms.easyecom.io',

  // ── FULFILLMENT ──
  AMAZON_FBA: 'sell.amazon.in',
  FLIPKART_SMART_FULFILLMENT: 'seller.flipkart.com',
  WAREIQ: 'wareiq.com',
  LOGINEXT: 'loginextsolutions.com',
  HOLISOL: 'holisollogistics.com',
};

// Resolve a domain for a channel type — falls back to a slug-based guess so
// the logo chain still has something to try. Used by ChannelLogo.
export function domainFor(type: string, name?: string): string {
  if (TYPE_DOMAIN[type]) return TYPE_DOMAIN[type];
  const slug = (name || type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${slug}.com`;
}

export function logoDevUrl(domain: string) {
  return `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=200&format=png&retina=true`;
}
export function iconHorseUrl(domain: string) {
  return `https://icon.horse/icon/${domain}`;
}
export function googleFaviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

export function getChannelInitials(name: string) {
  const words = (name || '?').trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return ((words[0][0] || '?') + (words[1][0] || '')).toUpperCase();
}
