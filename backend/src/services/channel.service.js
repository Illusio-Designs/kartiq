const prisma = require('../utils/prisma');
const { decryptCredentials } = require('../utils/crypto');
const { pickBestWarehouse } = require('./routing.service');
const { scoreOrder } = require('./rto.service');
const { resolveFulfillmentType, assessCompleteness } = require('./fulfillment.service');

// ── Adapters grouped by category ────────────────────────────────────────────

const ecomAdapters     = require('./channels/ecom');
const quickcomAdapters = require('./channels/quickcom');
const logisticsAdapters= require('./channels/logistics');
const ownstoreAdapters = require('./channels/ownstore');
const socialAdapters   = require('./channels/social');
const accountingAdapters = require('./channels/accounting');
const posSystemAdapters  = require('./channels/pos-system');
const paymentAdapters    = require('./channels/payment');
const taxAdapters        = require('./channels/tax');
const crmAdapters        = require('./channels/crm');
const returnsAdapters    = require('./channels/returns');
const fulfillmentAdapters= require('./channels/fulfillment');

const {
  AmazonAdapter, FlipkartAdapter, MeeshoAdapter, MyntraAdapter,
  NykaaAdapter, AjioAdapter, TataCliqAdapter, SnapdealAdapter,
  GlowRoadAdapter, JioMartAdapter, PaytmMallAdapter, LimeRoadAdapter,
  EbayAdapter, EtsyAdapter,
  // Pending → real ECOM
  WalmartAdapter, AmazonUSAdapter, AmazonUKAdapter, AmazonUAEAdapter,
  AmazonSAAdapter, AmazonSGAdapter, AmazonAUAdapter, AmazonDEAdapter,
  LazadaAdapter, ShopeeAdapter, NoonAdapter, MercadoLibreAdapter,
  AllegroAdapter, FruugoAdapter, OnBuyAdapter, ManoManoAdapter,
  RakutenAdapter, ZalandoAdapter, KauflandAdapter, WishAdapter,
  IndiaMartAdapter, IndustryBuyingAdapter, MoglixAdapter, PurppleAdapter,
  BewakoofAdapter, ShopCluesAdapter,
  FirstCryAdapter, PepperfryAdapter, CromaAdapter, TataNeuAdapter,
} = ecomAdapters;

const {
  BlinkitAdapter, ZeptoAdapter, SwiggyInstamartAdapter, BBNowAdapter,
  FlipkartMinutesAdapter, Tata1mgAdapter, DunzoAdapter, CountryDelightAdapter,
} = quickcomAdapters;

const {
  ShiprocketAdapter, DelhiveryAdapter, FshipAdapter, EcomExpressAdapter,
  XpressbeesAdapter, ShadowfaxAdapter, BlueDartAdapter, DTDCAdapter,
  FedExAdapter, DHLAdapter, UPSAdapter, IThinkAdapter,
  PickrrAdapter, ShipwayAdapter, NimbusPostAdapter, ClickPostAdapter,
  AramexAdapter, EkartAdapter, IndiaPostAdapter, GatiAdapter,
  SafexpressAdapter, TrackonAdapter, ProfessionalCouriersAdapter, SmartrAdapter,
  ShypliteAdapter, ICarryAdapter, DotZotAdapter, ShipDelightAdapter,
} = logisticsAdapters;

const {
  ShopifyAdapter, WooCommerceAdapter, AmazonSmartBizAdapter, MagentoAdapter,
  BigCommerceAdapter, OpenCartAdapter, CustomWebhookAdapter,
  WixAdapter, SquarespaceAdapter, SalesforceCommerceAdapter, PrestaShopAdapter,
  EcwidAdapter, ZohoCommerceAdapter, DukaanAdapter, ShoopyAdapter,
  BikayiAdapter, KartRocketAdapter, InstamojoPagesAdapter,
} = ownstoreAdapters;

const {
  InstagramAdapter, FacebookAdapter, WhatsAppBusinessAdapter,
  TikTokShopAdapter, PinterestAdapter, YouTubeShoppingAdapter, SnapchatAdapter,
} = socialAdapters;

const {
  TallyAdapter, TallyPrimeAdapter, ZohoBooksAdapter, QuickBooksAdapter,
  XeroAdapter, SapB1Adapter, SapS4HanaAdapter, ERPNextAdapter,
  Dynamics365Adapter, NetSuiteAdapter, OdooAdapter, BusyAdapter,
  MargAdapter, LogicErpAdapter,
} = accountingAdapters;

const {
  ShopifyPosAdapter, SquarePosAdapter, LightspeedPosAdapter, LoyVersePosAdapter,
  GoFrugalAdapter, PosistAdapter, PetpoojaAdapter, VyaparAdapter, ZohoPosAdapter,
} = posSystemAdapters;

const {
  RazorpayAdapter, PayUAdapter, CCAvenueAdapter, CashfreeAdapter, StripeAdapter,
  PayPalAdapter, PaytmPgAdapter, PhonePeAdapter, InstamojoAdapter,
} = paymentAdapters;

const {
  ClearTaxAdapter, GSTZenAdapter, TaxCloudIRPAdapter, AvalaraAdapter, ZohoGstAdapter,
} = taxAdapters;

const {
  HubSpotAdapter, SalesforceCrmAdapter, ZohoCrmAdapter, MailchimpAdapter,
  KlaviyoAdapter, BrevoAdapter, WebEngageAdapter, MoEngageAdapter,
  CleverTapAdapter, FreshdeskAdapter, ZendeskAdapter, GorgiasAdapter,
} = crmAdapters;

const {
  ReturnPrimeAdapter, WeReturnAdapter, AnchantoReturnsAdapter, EasyVMSAdapter,
} = returnsAdapters;

const {
  AmazonFbaAdapter, FlipkartSmartFulfillmentAdapter,
  WareIQAdapter, LogiNextAdapter, HolisolAdapter,
} = fulfillmentAdapters;

const { ManualAdapter } = require('./channels/manual');

// Channels with no external API — backed by ManualAdapter (no-op).
const MANUAL_TYPES = new Set(['OFFLINE', 'POS', 'WHOLESALE', 'DISTRIBUTOR', 'OTHER']);

// ── Channel type → category map ──────────────────────────────────────────────

const CHANNEL_CATEGORY = {
  // ECOM — Indian + global marketplaces
  AMAZON: 'ECOM', FLIPKART: 'ECOM', MYNTRA: 'ECOM', MEESHO: 'ECOM',
  SNAPDEAL: 'ECOM', PAYTM_MALL: 'ECOM', NYKAA: 'ECOM', AJIO: 'ECOM',
  TATA_CLIQ: 'ECOM', GLOWROAD: 'ECOM', JIOMART: 'ECOM',
  LIMEROAD: 'ECOM', EBAY: 'ECOM', ETSY: 'ECOM',
  WALMART: 'ECOM', AMAZON_US: 'ECOM', AMAZON_UK: 'ECOM', AMAZON_UAE: 'ECOM',
  AMAZON_SA: 'ECOM', AMAZON_SG: 'ECOM', AMAZON_AU: 'ECOM', AMAZON_DE: 'ECOM',
  LAZADA: 'ECOM', SHOPEE: 'ECOM', NOON: 'ECOM', MERCADO_LIBRE: 'ECOM',
  ALLEGRO: 'ECOM', FRUUGO: 'ECOM', ONBUY: 'ECOM', MANOMANO: 'ECOM',
  RAKUTEN: 'ECOM', ZALANDO: 'ECOM', KAUFLAND: 'ECOM', WISH: 'ECOM',
  INDIAMART: 'ECOM', INDUSTRYBUYING: 'ECOM', MOGLIX: 'ECOM', PURPLLE: 'ECOM',
  BEWAKOOF: 'ECOM', SHOPCLUES: 'ECOM',
  FIRSTCRY: 'ECOM', PEPPERFRY: 'ECOM', CROMA: 'ECOM', TATA_NEU: 'ECOM',

  // QUICKCOM
  BLINKIT: 'QUICKCOM', ZEPTO: 'QUICKCOM',
  SWIGGY_INSTAMART: 'QUICKCOM', BB_NOW: 'QUICKCOM',
  FLIPKART_MINUTES: 'QUICKCOM', TATA_1MG: 'QUICKCOM',
  DUNZO: 'QUICKCOM', COUNTRY_DELIGHT: 'QUICKCOM',

  // LOGISTICS
  SHIPROCKET: 'LOGISTICS', DELHIVERY: 'LOGISTICS', FSHIP: 'LOGISTICS',
  BLUEDART: 'LOGISTICS', DTDC: 'LOGISTICS', ECOMEXPRESS: 'LOGISTICS',
  XPRESSBEES: 'LOGISTICS', SHADOWFAX: 'LOGISTICS',
  FEDEX: 'LOGISTICS', DHL: 'LOGISTICS', UPS: 'LOGISTICS', ITHINK: 'LOGISTICS',
  PICKRR: 'LOGISTICS', SHIPWAY: 'LOGISTICS', NIMBUSPOST: 'LOGISTICS', CLICKPOST: 'LOGISTICS',
  ARAMEX: 'LOGISTICS', EKART: 'LOGISTICS', INDIA_POST: 'LOGISTICS',
  GATI: 'LOGISTICS', SAFEXPRESS: 'LOGISTICS', TRACKON: 'LOGISTICS',
  PROFESSIONAL_COURIERS: 'LOGISTICS', SMARTR: 'LOGISTICS',
  SHYPLITE: 'LOGISTICS', ICARRY: 'LOGISTICS', DOTZOT: 'LOGISTICS', SHIPDELIGHT: 'LOGISTICS',

  // OWNSTORE
  AMAZON_SMARTBIZ: 'OWNSTORE',
  SHOPIFY: 'OWNSTORE', WOOCOMMERCE: 'OWNSTORE', MAGENTO: 'OWNSTORE',
  BIGCOMMERCE: 'OWNSTORE', OPENCART: 'OWNSTORE',
  WEBSITE: 'OWNSTORE', OFFLINE: 'OWNSTORE', POS: 'OWNSTORE',
  WIX: 'OWNSTORE', SQUARESPACE: 'OWNSTORE', SALESFORCE_COMMERCE: 'OWNSTORE',
  PRESTASHOP: 'OWNSTORE', ECWID: 'OWNSTORE', ZOHO_COMMERCE: 'OWNSTORE',
  DUKAAN: 'OWNSTORE', SHOOPY: 'OWNSTORE', BIKAYI: 'OWNSTORE',
  KARTROCKET: 'OWNSTORE', INSTAMOJO_PAGES: 'OWNSTORE',

  // SOCIAL
  INSTAGRAM: 'SOCIAL', FACEBOOK: 'SOCIAL', WHATSAPP_BUSINESS: 'SOCIAL',
  TIKTOK_SHOP: 'SOCIAL', PINTEREST: 'SOCIAL',
  YOUTUBE_SHOPPING: 'SOCIAL', SNAPCHAT: 'SOCIAL',

  // B2B
  B2B_PORTAL: 'B2B', WHOLESALE: 'B2B', DISTRIBUTOR: 'B2B',

  // CUSTOM
  CUSTOM_WEBHOOK: 'CUSTOM', OTHER: 'CUSTOM',

  // ACCOUNTING
  TALLY: 'ACCOUNTING', TALLY_PRIME: 'ACCOUNTING', ZOHO_BOOKS: 'ACCOUNTING',
  QUICKBOOKS: 'ACCOUNTING', XERO: 'ACCOUNTING', SAP_B1: 'ACCOUNTING',
  SAP_S4HANA: 'ACCOUNTING', ERPNEXT: 'ACCOUNTING', DYNAMICS_365: 'ACCOUNTING',
  NETSUITE: 'ACCOUNTING', ODOO: 'ACCOUNTING', BUSY: 'ACCOUNTING',
  MARG_ERP: 'ACCOUNTING', LOGIC_ERP: 'ACCOUNTING',

  // POS_SYSTEM
  SHOPIFY_POS: 'POS_SYSTEM', SQUARE_POS: 'POS_SYSTEM',
  LIGHTSPEED_POS: 'POS_SYSTEM', LOYVERSE_POS: 'POS_SYSTEM',
  GOFRUGAL: 'POS_SYSTEM', POSIST: 'POS_SYSTEM',
  PETPOOJA: 'POS_SYSTEM', VYAPAR: 'POS_SYSTEM', ZOHO_POS: 'POS_SYSTEM',

  // PAYMENT
  RAZORPAY: 'PAYMENT', PAYU: 'PAYMENT', CCAVENUE: 'PAYMENT',
  CASHFREE: 'PAYMENT', STRIPE: 'PAYMENT', PAYPAL: 'PAYMENT',
  PAYTM_PG: 'PAYMENT', PHONEPE_BUSINESS: 'PAYMENT', INSTAMOJO: 'PAYMENT',

  // TAX
  CLEARTAX: 'TAX', GSTZEN: 'TAX', TAXCLOUD_IRP: 'TAX',
  AVALARA: 'TAX', ZOHO_GST: 'TAX',

  // CRM
  HUBSPOT: 'CRM', SALESFORCE_CRM: 'CRM', ZOHO_CRM: 'CRM',
  MAILCHIMP: 'CRM', KLAVIYO: 'CRM', SENDINBLUE: 'CRM',
  WEBENGAGE: 'CRM', MOENGAGE: 'CRM', CLEVERTAP: 'CRM',
  FRESHDESK: 'CRM', ZENDESK: 'CRM', GORGIAS: 'CRM',

  // RETURNS
  RETURN_PRIME: 'RETURNS', WERETURN: 'RETURNS',
  ANCHANTO_RETURNS: 'RETURNS', EASYVMS: 'RETURNS',

  // FULFILLMENT
  AMAZON_FBA: 'FULFILLMENT', FLIPKART_SMART_FULFILLMENT: 'FULFILLMENT',
  WAREIQ: 'FULFILLMENT', LOGINEXT: 'FULFILLMENT', HOLISOL: 'FULFILLMENT',
};

function getCategoryForType(type) {
  return CHANNEL_CATEGORY[type] || 'CUSTOM';
}

// ── Adapter factory ──────────────────────────────────────────────────────────

function getAdapter(channel) {
  let creds = channel.credentials;

  // Manual channels (OFFLINE/POS/WHOLESALE/DISTRIBUTOR/OTHER) need no
  // credentials — return a no-op adapter immediately.
  if (MANUAL_TYPES.has(channel.type)) {
    return new ManualAdapter(creds || {});
  }

  // CUSTOM_WEBHOOK works without credentials (signature validation optional)
  const webhookTypes = ['CUSTOM_WEBHOOK', 'WEBSITE', 'B2B_PORTAL'];
  if (!creds && !webhookTypes.includes(channel.type)) {
    throw new Error('Channel has no credentials. Connect it first via POST /channels/:id/connect');
  }

  // Decrypt if stored encrypted
  if (creds && creds.iv && creds.data) creds = decryptCredentials(creds);

  switch (channel.type) {

    // ── ECOM ──────────────────────────────────────────────
    case 'AMAZON':    return new AmazonAdapter(creds);
    case 'FLIPKART':  return new FlipkartAdapter(creds);
    case 'MEESHO':    return new MeeshoAdapter(creds);
    case 'MYNTRA':    return new MyntraAdapter(creds);
    case 'NYKAA':     return new NykaaAdapter(creds);
    case 'AJIO':      return new AjioAdapter(creds);
    case 'TATA_CLIQ': return new TataCliqAdapter(creds);
    case 'SNAPDEAL':  return new SnapdealAdapter(creds);
    case 'GLOWROAD':  return new GlowRoadAdapter(creds);
    case 'JIOMART':   return new JioMartAdapter(creds);
    case 'PAYTM_MALL':return new PaytmMallAdapter(creds);
    case 'LIMEROAD':  return new LimeRoadAdapter(creds);
    case 'EBAY':      return new EbayAdapter(creds);
    case 'ETSY':      return new EtsyAdapter(creds);

    // ── QUICKCOM ──────────────────────────────────────────
    case 'BLINKIT':          return new BlinkitAdapter(creds);
    case 'ZEPTO':            return new ZeptoAdapter(creds);
    case 'SWIGGY_INSTAMART': return new SwiggyInstamartAdapter(creds);
    case 'BB_NOW':           return new BBNowAdapter(creds);

    // ── LOGISTICS ─────────────────────────────────────────
    case 'SHIPROCKET':  return new ShiprocketAdapter(creds);
    case 'DELHIVERY':   return new DelhiveryAdapter(creds);
    case 'FSHIP':       return new FshipAdapter(creds);
    case 'ECOMEXPRESS': return new EcomExpressAdapter(creds);
    case 'XPRESSBEES':  return new XpressbeesAdapter(creds);
    case 'SHADOWFAX':   return new ShadowfaxAdapter(creds);
    case 'BLUEDART':    return new BlueDartAdapter(creds);
    case 'DTDC':        return new DTDCAdapter(creds);
    case 'FEDEX':       return new FedExAdapter(creds);
    case 'DHL':         return new DHLAdapter(creds);
    case 'UPS':         return new UPSAdapter(creds);
    case 'ITHINK':      return new IThinkAdapter(creds);
    case 'PICKRR':      return new PickrrAdapter(creds);
    case 'SHIPWAY':     return new ShipwayAdapter(creds);
    case 'NIMBUSPOST':  return new NimbusPostAdapter(creds);
    case 'CLICKPOST':   return new ClickPostAdapter(creds);

    // ── OWNSTORE ──────────────────────────────────────────
    case 'AMAZON_SMARTBIZ': return new AmazonSmartBizAdapter(creds);
    case 'SHOPIFY':         return new ShopifyAdapter(creds);
    case 'WOOCOMMERCE':     return new WooCommerceAdapter(creds);
    case 'MAGENTO':         return new MagentoAdapter(creds);
    case 'BIGCOMMERCE':     return new BigCommerceAdapter(creds);
    case 'OPENCART':        return new OpenCartAdapter(creds);

    case 'WEBSITE':
      // Custom website uses the webhook adapter
      return new CustomWebhookAdapter(creds || {});

    // OFFLINE/POS handled above by MANUAL_TYPES early-return.

    // ── SOCIAL ────────────────────────────────────────────
    case 'INSTAGRAM':         return new InstagramAdapter(creds);
    case 'FACEBOOK':          return new FacebookAdapter(creds);
    case 'WHATSAPP_BUSINESS': return new WhatsAppBusinessAdapter(creds);

    // ── B2B ───────────────────────────────────────────────
    case 'B2B_PORTAL':
      return new CustomWebhookAdapter(creds || {});

    // WHOLESALE/DISTRIBUTOR handled above by MANUAL_TYPES early-return.

    // ── CUSTOM ────────────────────────────────────────────
    case 'CUSTOM_WEBHOOK':
      return new CustomWebhookAdapter(creds || {});

    case 'OTHER':
      throw new Error('OTHER: no adapter available. Use CUSTOM_WEBHOOK to receive orders via webhook.');

    // ── ECOM (extended) ───────────────────────────────────
    case 'WALMART':         return new WalmartAdapter(creds);
    case 'AMAZON_US':       return new AmazonUSAdapter(creds);
    case 'AMAZON_UK':       return new AmazonUKAdapter(creds);
    case 'AMAZON_UAE':      return new AmazonUAEAdapter(creds);
    case 'AMAZON_SA':       return new AmazonSAAdapter(creds);
    case 'AMAZON_SG':       return new AmazonSGAdapter(creds);
    case 'AMAZON_AU':       return new AmazonAUAdapter(creds);
    case 'AMAZON_DE':       return new AmazonDEAdapter(creds);
    case 'LAZADA':          return new LazadaAdapter(creds);
    case 'SHOPEE':          return new ShopeeAdapter(creds);
    case 'NOON':            return new NoonAdapter(creds);
    case 'MERCADO_LIBRE':   return new MercadoLibreAdapter(creds);
    case 'ALLEGRO':         return new AllegroAdapter(creds);
    case 'FRUUGO':          return new FruugoAdapter(creds);
    case 'ONBUY':           return new OnBuyAdapter(creds);
    case 'MANOMANO':        return new ManoManoAdapter(creds);
    case 'RAKUTEN':         return new RakutenAdapter(creds);
    case 'ZALANDO':         return new ZalandoAdapter(creds);
    case 'KAUFLAND':        return new KauflandAdapter(creds);
    case 'WISH':            return new WishAdapter(creds);
    case 'INDIAMART':       return new IndiaMartAdapter(creds);
    case 'INDUSTRYBUYING':  return new IndustryBuyingAdapter(creds);
    case 'MOGLIX':          return new MoglixAdapter(creds);
    case 'PURPLLE':         return new PurppleAdapter(creds);
    case 'BEWAKOOF':        return new BewakoofAdapter(creds || {});
    case 'SHOPCLUES':       return new ShopCluesAdapter(creds || {});
    case 'FIRSTCRY':        return new FirstCryAdapter(creds);
    case 'PEPPERFRY':       return new PepperfryAdapter(creds);
    case 'CROMA':           return new CromaAdapter(creds);
    case 'TATA_NEU':        return new TataNeuAdapter(creds);

    // ── QUICKCOM (extended) ───────────────────────────────
    case 'FLIPKART_MINUTES': return new FlipkartMinutesAdapter(creds);
    case 'TATA_1MG':         return new Tata1mgAdapter(creds);
    case 'DUNZO':            return new DunzoAdapter(creds);
    case 'COUNTRY_DELIGHT':  return new CountryDelightAdapter(creds || {});

    // ── LOGISTICS (extended) ──────────────────────────────
    case 'ARAMEX':                return new AramexAdapter(creds);
    case 'EKART':                 return new EkartAdapter(creds);
    case 'INDIA_POST':            return new IndiaPostAdapter(creds);
    case 'GATI':                  return new GatiAdapter(creds);
    case 'SAFEXPRESS':            return new SafexpressAdapter(creds);
    case 'TRACKON':               return new TrackonAdapter(creds);
    case 'PROFESSIONAL_COURIERS': return new ProfessionalCouriersAdapter(creds);
    case 'SMARTR':                return new SmartrAdapter(creds);
    case 'SHYPLITE':              return new ShypliteAdapter(creds);
    case 'ICARRY':                return new ICarryAdapter(creds);
    case 'DOTZOT':                return new DotZotAdapter(creds);
    case 'SHIPDELIGHT':           return new ShipDelightAdapter(creds);

    // ── OWNSTORE (extended) ───────────────────────────────
    case 'WIX':                 return new WixAdapter(creds);
    case 'SQUARESPACE':         return new SquarespaceAdapter(creds);
    case 'SALESFORCE_COMMERCE': return new SalesforceCommerceAdapter(creds);
    case 'PRESTASHOP':          return new PrestaShopAdapter(creds);
    case 'ECWID':               return new EcwidAdapter(creds);
    case 'ZOHO_COMMERCE':       return new ZohoCommerceAdapter(creds);
    case 'DUKAAN':              return new DukaanAdapter(creds);
    case 'SHOOPY':              return new ShoopyAdapter(creds);
    case 'BIKAYI':              return new BikayiAdapter(creds);
    case 'KARTROCKET':          return new KartRocketAdapter(creds);
    case 'INSTAMOJO_PAGES':     return new InstamojoPagesAdapter(creds);

    // ── SOCIAL (extended) ─────────────────────────────────
    case 'TIKTOK_SHOP':       return new TikTokShopAdapter(creds);
    case 'PINTEREST':         return new PinterestAdapter(creds);
    case 'YOUTUBE_SHOPPING':  return new YouTubeShoppingAdapter(creds);
    case 'SNAPCHAT':          return new SnapchatAdapter(creds);

    // ── ACCOUNTING ────────────────────────────────────────
    case 'TALLY':         return new TallyAdapter(creds);
    case 'TALLY_PRIME':   return new TallyPrimeAdapter(creds);
    case 'ZOHO_BOOKS':    return new ZohoBooksAdapter(creds);
    case 'QUICKBOOKS':    return new QuickBooksAdapter(creds);
    case 'XERO':          return new XeroAdapter(creds);
    case 'SAP_B1':        return new SapB1Adapter(creds);
    case 'SAP_S4HANA':    return new SapS4HanaAdapter(creds);
    case 'ERPNEXT':       return new ERPNextAdapter(creds);
    case 'DYNAMICS_365':  return new Dynamics365Adapter(creds);
    case 'NETSUITE':      return new NetSuiteAdapter(creds);
    case 'ODOO':          return new OdooAdapter(creds);
    case 'BUSY':          return new BusyAdapter(creds);
    case 'MARG_ERP':      return new MargAdapter(creds);
    case 'LOGIC_ERP':     return new LogicErpAdapter(creds);

    // ── POS_SYSTEM ────────────────────────────────────────
    case 'SHOPIFY_POS':     return new ShopifyPosAdapter(creds);
    case 'SQUARE_POS':      return new SquarePosAdapter(creds);
    case 'LIGHTSPEED_POS':  return new LightspeedPosAdapter(creds);
    case 'LOYVERSE_POS':    return new LoyVersePosAdapter(creds);
    case 'GOFRUGAL':        return new GoFrugalAdapter(creds);
    case 'POSIST':          return new PosistAdapter(creds);
    case 'PETPOOJA':        return new PetpoojaAdapter(creds);
    case 'VYAPAR':          return new VyaparAdapter(creds);
    case 'ZOHO_POS':        return new ZohoPosAdapter(creds);

    // ── PAYMENT ───────────────────────────────────────────
    case 'RAZORPAY':         return new RazorpayAdapter(creds);
    case 'PAYU':             return new PayUAdapter(creds);
    case 'CCAVENUE':         return new CCAvenueAdapter(creds);
    case 'CASHFREE':         return new CashfreeAdapter(creds);
    case 'STRIPE':           return new StripeAdapter(creds);
    case 'PAYPAL':           return new PayPalAdapter(creds);
    case 'PAYTM_PG':         return new PaytmPgAdapter(creds);
    case 'PHONEPE_BUSINESS': return new PhonePeAdapter(creds);
    case 'INSTAMOJO':        return new InstamojoAdapter(creds);

    // ── TAX ───────────────────────────────────────────────
    case 'CLEARTAX':      return new ClearTaxAdapter(creds);
    case 'GSTZEN':        return new GSTZenAdapter(creds);
    case 'TAXCLOUD_IRP':  return new TaxCloudIRPAdapter(creds);
    case 'AVALARA':       return new AvalaraAdapter(creds);
    case 'ZOHO_GST':      return new ZohoGstAdapter(creds);

    // ── CRM ───────────────────────────────────────────────
    case 'HUBSPOT':         return new HubSpotAdapter(creds);
    case 'SALESFORCE_CRM':  return new SalesforceCrmAdapter(creds);
    case 'ZOHO_CRM':        return new ZohoCrmAdapter(creds);
    case 'MAILCHIMP':       return new MailchimpAdapter(creds);
    case 'KLAVIYO':         return new KlaviyoAdapter(creds);
    case 'SENDINBLUE':      return new BrevoAdapter(creds);
    case 'WEBENGAGE':       return new WebEngageAdapter(creds);
    case 'MOENGAGE':        return new MoEngageAdapter(creds);
    case 'CLEVERTAP':       return new CleverTapAdapter(creds);
    case 'FRESHDESK':       return new FreshdeskAdapter(creds);
    case 'ZENDESK':         return new ZendeskAdapter(creds);
    case 'GORGIAS':         return new GorgiasAdapter(creds);

    // ── RETURNS ───────────────────────────────────────────
    case 'RETURN_PRIME':     return new ReturnPrimeAdapter(creds);
    case 'WERETURN':         return new WeReturnAdapter(creds);
    case 'ANCHANTO_RETURNS': return new AnchantoReturnsAdapter(creds);
    case 'EASYVMS':          return new EasyVMSAdapter(creds);

    // ── FULFILLMENT ───────────────────────────────────────
    case 'AMAZON_FBA':                return new AmazonFbaAdapter(creds);
    case 'FLIPKART_SMART_FULFILLMENT':return new FlipkartSmartFulfillmentAdapter(creds);
    case 'WAREIQ':                    return new WareIQAdapter(creds);
    case 'LOGINEXT':                  return new LogiNextAdapter(creds);
    case 'HOLISOL':                   return new HolisolAdapter(creds);

    default:
      throw new Error(`No adapter for channel type: ${channel.type}`);
  }
}

// ── Order import ─────────────────────────────────────────────────────────────

// Find-or-create a product + variant + channel listing for a channel order
// item whose SKU isn't mapped yet. Lets orders import without any manual SKU
// setup and auto-populates the catalog straight from the channel.
async function ensureListingForItem({ tenantId, channelId, item }) {
  const sku = String(item.channelSku);
  const price = Number(item.unitPrice || 0) || 0;
  // SELF (merchant/MFN) vs CHANNEL (FBA/AFN) — only trust an explicit value.
  const listingFulfillment = item.fulfillmentType === 'CHANNEL' || item.fulfillmentType === 'SELF'
    ? item.fulfillmentType
    : null;

  // Reuse an existing variant with the same SKU if the tenant already has one
  // (e.g. created for another channel); otherwise create the product + variant.
  let variant = await prisma.productVariant.findFirst({ where: { tenantId, sku } });
  let productId;
  let variantId;
  if (variant) {
    productId = variant.productId;
    variantId = variant.id;
  } else {
    const product = await prisma.product.create({
      data: {
        tenantId,
        name: item.name || sku,
        sku,
        description: 'Auto-imported from a channel order',
        images: [],
        tags: ['auto-imported'],
        isActive: true,
      },
    });
    const v = await prisma.productVariant.create({
      data: {
        tenantId,
        productId: product.id,
        sku,
        name: item.name || sku,
        attributes: {},
        costPrice: price,
        mrp: price,
        sellingPrice: price,
        isActive: true,
      },
    });
    productId = product.id;
    variantId = v.id;
  }

  // Map it to this channel (unique on channelId + channelSku). If a concurrent
  // item in the same batch already created it, re-fetch instead of throwing.
  let listing = await prisma.channelListing.findFirst({ where: { channelId, channelSku: sku } });
  if (!listing) {
    try {
      listing = await prisma.channelListing.create({
        data: { tenantId, channelId, productId, variantId, channelSku: sku, channelPrice: price, isActive: true, fulfillmentType: listingFulfillment },
      });
    } catch (e) {
      listing = await prisma.channelListing.findFirst({ where: { channelId, channelSku: sku } });
      if (!listing) throw e;
    }
  } else if (listingFulfillment && listing.fulfillmentType !== listingFulfillment) {
    // Backfill/refresh the fulfillment model once we learn it (e.g. an order
    // reveals a listing first seen via catalog import is actually FBA).
    await prisma.channelListing.update({ where: { id: listing.id }, data: { fulfillmentType: listingFulfillment } }).catch(() => {});
    listing.fulfillmentType = listingFulfillment;
  }
  return listing;
}

// Forward-only fulfillment states. A re-poll may only move an order along this
// path (never backwards); terminal CANCELLED/RETURNED are handled separately.
const ORDER_FLOW = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

// Advance an already-imported order from a fresh channel poll: bump its status
// forward, apply a cancellation/return, and stamp shipped/delivered times.
// Returns true if anything changed. Never regresses a status or overwrites an
// existing timestamp.
async function applyOrderProgress(existing, raw) {
  const upd = {};
  const cur = existing.status;
  const next = raw.status;
  if (next && next !== cur) {
    const ci = ORDER_FLOW.indexOf(cur);
    const ni = ORDER_FLOW.indexOf(next);
    const forward = ni !== -1 && ci !== -1 && ni > ci;
    const cancel = next === 'CANCELLED' && cur !== 'DELIVERED' && cur !== 'RETURNED';
    const ret = next === 'RETURNED' && cur === 'DELIVERED';
    if (forward || cancel || ret) upd.status = next;
  }
  const effective = upd.status || cur;
  if (!existing.shippedAt && (raw.shippedAt || effective === 'SHIPPED' || effective === 'DELIVERED')) {
    upd.shippedAt = raw.shippedAt || new Date();
  }
  if (!existing.deliveredAt && (raw.deliveredAt || effective === 'DELIVERED')) {
    upd.deliveredAt = raw.deliveredAt || new Date();
  }
  if (!Object.keys(upd).length) return false;
  await prisma.order.update({ where: { id: existing.id }, data: upd }).catch(() => {});
  return true;
}

async function importOrders(channelId, rawOrders, { tenantId } = {}) {
  // Fall back to looking up tenantId from the channel if not supplied
  if (!tenantId) {
    const ch = await prisma.channel.findUnique({ where: { id: channelId }, select: { tenantId: true } });
    if (!ch) throw new Error('Channel not found');
    tenantId = ch.tenantId;
  }

  const results = { imported: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

  for (const raw of rawOrders) {
    try {
      const existing = await prisma.order.findFirst({
        where: { tenantId, channelId, channelOrderId: raw.channelOrderId },
      });
      if (existing) {
        // A previous header-only sync may have imported this order with no line
        // items. If we now have items to add, drop the empty stub and re-import
        // it fully below; otherwise it's a genuine duplicate.
        const existingItems = await prisma.orderItem.findMany({ where: { orderId: existing.id }, take: 1 });
        if (existingItems.length > 0 || !(raw.items && raw.items.length)) {
          // Not a re-import, but a re-poll can still carry fresh fulfillment
          // progress (Pending → Shipped → Delivered, or a cancellation). Advance
          // the existing order's status/timestamps rather than treating every
          // re-poll as an inert duplicate.
          if (await applyOrderProgress(existing, raw)) results.updated++;
          else results.skipped++;
          continue;
        }
        await prisma.order.delete({ where: { id: existing.id } }).catch(() => {});
        // fall through to a full re-import with line items
      }

      let customer = raw.customer.email
        ? await prisma.customer.findFirst({ where: { tenantId, email: raw.customer.email } })
        : null;
      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            tenantId,
            name: raw.customer.name || 'Unknown',
            email: raw.customer.email || null,
            phone: raw.customer.phone || null,
          },
        });
      }

      // Classify the listing's stock model from the order's fulfillment channel:
      // AFN = Amazon FBA (CHANNEL, Amazon-managed stock), MFN = merchant-fulfilled
      // (SELF, our stock). Unknown channels leave it null.
      const fc = String(raw.fulfillment_channel || '').toUpperCase();
      const listingFulfillment = fc === 'AFN' ? 'CHANNEL' : fc === 'MFN' ? 'SELF' : null;

      const resolvedItems = [];
      for (const item of raw.items) {
        if (!item.channelSku) continue;
        let listing = await prisma.channelListing.findFirst({
          where: { tenantId, channelId, channelSku: item.channelSku },
        });
        // No mapping yet — auto-create a product + variant + channel listing
        // from the order item, so orders import without any manual SKU setup
        // and the catalog fills itself from the channel.
        if (!listing) {
          try {
            listing = await ensureListingForItem({ tenantId, channelId, item: { ...item, fulfillmentType: listingFulfillment } });
          } catch (e) {
            console.warn(`[import] auto-create product failed for SKU ${item.channelSku}: ${e.message}`);
          }
        } else if (listingFulfillment && listing.fulfillmentType !== listingFulfillment) {
          // Learned the fulfillment model from this order — backfill it.
          await prisma.channelListing.update({ where: { id: listing.id }, data: { fulfillmentType: listingFulfillment } }).catch(() => {});
        }
        if (listing) resolvedItems.push({ ...item, variantId: listing.variantId });
      }

      if (!resolvedItems.length && raw.items.length > 0) {
        results.failed++;
        results.errors.push(`Order ${raw.channelOrderId}: could not resolve any line items`);
        continue;
      }

      const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Load the channel record once to know its type + default fulfillment
      const channelRecord = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { type: true, defaultFulfillmentType: true },
      });

      // 1. Resolve fulfillment model (SELF / CHANNEL / DROPSHIP)
      const fulfillmentType = resolveFulfillmentType(raw, channelRecord);
      const channelFulfillmentCenter =
        raw.fulfillmentCenter || raw.warehouseCode || raw.fcCode || null;

      // 2. Assess data completeness
      const completeness = assessCompleteness(raw, { fulfillmentType });

      // 3. Smart routing — ONLY for orders we ship ourselves (SELF)
      let routing = null;
      if (fulfillmentType === 'SELF' && resolvedItems.length > 0) {
        try {
          routing = await pickBestWarehouse({
            tenantId,
            items: resolvedItems,
            shippingAddress: raw.shippingAddress,
          });
        } catch (e) {
          console.warn(`[import] routing failed for order ${raw.channelOrderId}: ${e.message}`);
        }
      }

      // 4. RTO risk score — skip for CHANNEL-fulfilled (channel handles fraud/RTO)
      let rto = null;
      if (fulfillmentType === 'SELF') {
        try {
          rto = await scoreOrder({
            tenantId,
            paymentMethod: raw.paymentMethod,
            total: raw.total,
            customerId: customer.id,
            customer,
            shippingAddress: raw.shippingAddress,
            orderedAt: raw.orderedAt,
            channelType: channelRecord?.type,
          });
        } catch (e) {
          console.warn(`[import] RTO scoring failed for order ${raw.channelOrderId}: ${e.message}`);
        }
      }

      // 5. Initial status — CHANNEL-fulfilled orders start already confirmed
      const initialStatus =
        raw.status ||
        (fulfillmentType === 'CHANNEL' ? 'PROCESSING' : 'PENDING');

      await prisma.$transaction(async (tx) => {
        await tx.order.create({
          data: {
            tenantId,
            orderNumber,
            channelId,
            channelOrderId: raw.channelOrderId,
            customerId: customer.id,
            warehouseId: routing?.warehouseId || null,
            shippingAddress: raw.shippingAddress,
            subtotal: raw.subtotal,
            shippingCharge: raw.shippingCharge || 0,
            tax: raw.tax || 0,
            discount: raw.discount || 0,
            total: raw.total,
            paymentMethod: raw.paymentMethod,
            paymentStatus: raw.paymentStatus || 'PENDING',
            status: initialStatus,
            orderedAt: raw.orderedAt || new Date(),
            ...(raw.shippedAt && { shippedAt: raw.shippedAt }),
            ...(raw.deliveredAt && { deliveredAt: raw.deliveredAt }),
            rtoScore: rto?.score ?? null,
            rtoRiskLevel: rto?.level ?? null,
            rtoFactors: rto?.factors ?? null,
            needsApproval: rto?.needsApproval ?? false,
            fulfillmentType,
            channelFulfillmentCenter,
            awb: raw.awb || null,
            courierTrackingUrl: raw.trackingUrl || raw.courierTrackingUrl || null,
            dataCompleteness: completeness.level,
            missingFields: completeness.missing,
            ...(resolvedItems.length > 0 && {
              items: {
                create: resolvedItems.map((i) => ({
                  tenantId,
                  variantId: i.variantId,
                  qty: i.qty,
                  unitPrice: i.unitPrice,
                  discount: i.discount || 0,
                  tax: i.tax || 0,
                  total: i.unitPrice * i.qty - (i.discount || 0) + (i.tax || 0),
                })),
              },
            }),
          },
        });

        // Bump PAYG usage meter for this tenant
        const period = new Date().toISOString().slice(0, 7);
        await tx.usageMeter.upsert({
          where: { tenantId_metric_period: { tenantId, metric: 'orders', period } },
          update: { count: { increment: 1 } },
          create: { tenantId, metric: 'orders', period, count: 1 },
        });
      });

      results.imported++;
    } catch (err) {
      results.failed++;
      results.errors.push(`Order ${raw.channelOrderId}: ${err.message}`);
    }
  }

  return results;
}

// ── Inventory push ───────────────────────────────────────────────────────────

async function pushInventoryToChannel(channel, { tenantId } = {}) {
  const adapter = getAdapter(channel);
  const scopedTenantId = tenantId || channel.tenantId;

  // Whole-channel opt-out: some channels (Amazon Smart Biz / MCF) keep stock in
  // the channel's own warehouse, so there is nothing for Kartriq to push. Skip
  // the channel rather than calling updateInventoryLevel, which throws.
  if (adapter.inventoryManagedByChannel) {
    return { updated: 0, skipped: 0, failed: 0, errors: [], note: 'inventory managed by channel — nothing to push' };
  }

  const listings = await prisma.channelListing.findMany({
    where: { tenantId: scopedTenantId, channelId: channel.id, isActive: true },
    include: { variant: { include: { inventoryItems: true } } },
  });

  const results = { updated: 0, skipped: 0, failed: 0, errors: [] };
  for (const listing of listings) {
    // FBA/AFN stock is managed by Amazon — pushing a local quantity to it is
    // rejected by the Listings API and would surface as a spurious sync error
    // every cycle. Skip CHANNEL-fulfilled listings; only merchant-fulfilled
    // (SELF, or not-yet-classified) stock is ours to push.
    if (listing.fulfillmentType === 'CHANNEL') { results.skipped++; continue; }
    try {
      const totalQty = listing.variant.inventoryItems.reduce((s, inv) => s + inv.quantityAvailable, 0);
      await adapter.updateInventoryLevel(listing.channelSku, totalQty);
      results.updated++;
    } catch (err) {
      results.failed++;
      results.errors.push(`SKU ${listing.channelSku}: ${err.message}`);
    }
  }
  return results;
}

// ── Product push ─────────────────────────────────────────────────────────────
// Push a single product (all variants) to every channel it's listed on.
// Each ChannelListing row says "this variant is listed on this channel as
// channelSku". We look up the listing, grab the variant's live fields from
// the local DB, and call adapter.updateListing(channelSku, fields).
async function pushProductToChannels(productId, { channelIds = null, tenantId = null } = {}) {
  const where = { id: productId };
  if (tenantId) where.tenantId = tenantId;
  const product = await prisma.product.findFirst({
    where,
    include: {
      variants: { include: { inventoryItems: true } },
      channelListings: { include: { channel: true, variant: true } },
    },
  });
  if (!product) throw new Error('Product not found');

  const results = { updated: 0, skipped: 0, failed: 0, perChannel: [] };
  const images = Array.isArray(product.images) ? product.images : [];

  for (const listing of product.channelListings) {
    // Allow caller to scope the push to specific channels
    if (channelIds && !channelIds.includes(listing.channelId)) continue;
    if (!listing.channel.isActive) { results.skipped++; continue; }
    if (!listing.variant) { results.skipped++; continue; }

    // Aggregate stock across all warehouses for this variant
    const variant = product.variants.find(v => v.id === listing.variantId);
    const totalQty = variant
      ? variant.inventoryItems.reduce((s, inv) => s + inv.quantityAvailable, 0)
      : 0;

    const fields = {
      title: product.name,
      description: product.description || undefined,
      images: images.length ? images : undefined,
      price: listing.channelPrice ? parseFloat(listing.channelPrice) : parseFloat(variant.sellingPrice),
      mrp: parseFloat(variant.mrp),
    };
    // Only push quantity for merchant-fulfilled (SELF/unknown) listings. FBA/AFN
    // stock is Amazon-managed and rejects a quantity patch — push the listing
    // content (title/price/images) but leave its quantity to Amazon.
    if (listing.fulfillmentType !== 'CHANNEL') fields.qty = totalQty;

    let adapter;
    try {
      adapter = getAdapter(listing.channel);
    } catch (err) {
      results.skipped++;
      results.perChannel.push({ channelId: listing.channelId, channelName: listing.channel.name, status: 'skipped', reason: err.message });
      continue;
    }

    if (typeof adapter.updateListing !== 'function') {
      results.skipped++;
      results.perChannel.push({ channelId: listing.channelId, channelName: listing.channel.name, status: 'skipped', reason: 'channel does not support product updates' });
      continue;
    }

    try {
      const result = await adapter.updateListing(listing.channelSku, fields);
      results.updated++;
      results.perChannel.push({ channelId: listing.channelId, channelName: listing.channel.name, status: 'updated', result });
    } catch (err) {
      results.failed++;
      results.perChannel.push({ channelId: listing.channelId, channelName: listing.channel.name, status: 'failed', error: err.message });
    }
  }

  return results;
}

// ── One-time catalog import: pull a channel's products + stock into Kartriq ──
// Reuses ensureListingForItem so products/variants/listings are created without
// manual setup, then seeds inventory into a warehouse (auto-created if the
// tenant has none). Requires the adapter to expose fetchInventorySummaries().
async function upsertInventory({ tenantId, warehouseId, productId, variantId, qty }) {
  const q = Math.max(0, Number(qty) || 0);
  const existing = await prisma.inventoryItem.findFirst({ where: { tenantId, warehouseId, variantId } });
  if (existing) {
    await prisma.inventoryItem.update({ where: { id: existing.id }, data: { quantityOnHand: q, quantityAvailable: q } });
  } else {
    await prisma.inventoryItem.create({
      data: { tenantId, warehouseId, productId, variantId, quantityOnHand: q, quantityReserved: 0, quantityAvailable: q },
    });
  }
}

async function importCatalogFromChannel(channel, { tenantId } = {}) {
  if (!tenantId) {
    const ch = await prisma.channel.findUnique({ where: { id: channel.id }, select: { tenantId: true } });
    tenantId = ch?.tenantId;
  }
  const adapter = getAdapter(channel);
  // Prefer a full-catalog pull (every active listing, FBA + merchant-fulfilled,
  // with price) when the adapter supports it; fall back to the FBA-only
  // on-hand summaries otherwise. `fromReport` tells the loop below to trust the
  // item's own price/fulfillment instead of the FBA defaults.
  let items;
  let fromReport = false;
  if (typeof adapter.fetchAllListings === 'function') {
    items = await adapter.fetchAllListings();
    fromReport = true;
  } else if (typeof adapter.fetchInventorySummaries === 'function') {
    items = await adapter.fetchInventorySummaries();
  } else {
    throw new Error(`${channel.type} does not support catalog import yet`);
  }
  const results = { total: items.length, products: 0, inventory: 0, failed: 0, error: null };

  // A warehouse to hold the pulled stock — reuse the tenant's first active one,
  // else create a default so first-time users get inventory without setup.
  let warehouse = await prisma.warehouse.findFirst({ where: { tenantId, isActive: true } });
  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: { tenantId, name: 'Amazon FBA', code: 'FBA', address: {}, isActive: true },
    });
  }

  for (const item of items) {
    if (!item.channelSku) continue;
    let listing;
    try {
      // From the Reports API we have each listing's real price and fulfillment
      // model (SELF vs CHANNEL) — pass them through. From the FBA-summaries
      // fallback there is no price, and every item is Amazon-fulfilled, so keep
      // the CHANNEL default (never push local quantities back for those).
      const enriched = fromReport
        ? item
        : { ...item, unitPrice: 0, fulfillmentType: 'CHANNEL' };
      listing = await ensureListingForItem({ tenantId, channelId: channel.id, item: enriched });
      results.products++;
    } catch (e) {
      results.failed++;
      if (!results.error) results.error = e.message;
      console.warn(`[catalog] product create failed for SKU ${item.channelSku}: ${e.message}`);
      continue;
    }
    try {
      if (listing?.variantId) {
        await upsertInventory({ tenantId, warehouseId: warehouse.id, productId: listing.productId, variantId: listing.variantId, qty: item.quantity });
        results.inventory++;
      }
    } catch (e) {
      if (!results.error) results.error = e.message;
      console.warn(`[catalog] inventory set failed for SKU ${item.channelSku}: ${e.message}`);
    }
  }
  await prisma.channel.update({ where: { id: channel.id }, data: { lastSyncAt: new Date(), syncError: null } }).catch(() => {});
  return results;
}

// Confirm a merchant-fulfilled shipment back to the origin channel (e.g. Amazon
// MFN) once Kartriq marks the order shipped. Best-effort: only runs for a
// channel order whose adapter supports confirmShipment, and only for
// SELF-fulfilled orders (FBA/CHANNEL orders ship themselves). Returns a result
// object; never throws — callers treat channel confirmation as non-blocking.
async function confirmChannelShipment(order, { trackingNumber, courierName, shipDate } = {}) {
  try {
    if (!order?.channelId || !order?.channelOrderId) return { skipped: 'not a channel order' };
    // Don't confirm FBA/channel-fulfilled orders — Amazon owns their shipping.
    if (order.fulfillmentType && order.fulfillmentType !== 'SELF') return { skipped: 'channel-fulfilled' };
    const track = trackingNumber || order.trackingNumber || order.awb;
    if (!track) return { skipped: 'no tracking number' };

    const channel = await prisma.channel.findFirst({ where: { id: order.channelId } });
    if (!channel) return { skipped: 'channel not found' };
    let adapter;
    try { adapter = getAdapter(channel); } catch { return { skipped: 'adapter unavailable' }; }
    if (typeof adapter.confirmShipment !== 'function') return { skipped: 'channel does not support shipment confirmation' };

    const res = await adapter.confirmShipment(order.channelOrderId, {
      trackingNumber: track,
      carrierName: courierName || order.courierName || undefined,
      shipDate,
    });
    return { confirmed: true, res };
  } catch (err) {
    // Seller may not have the fulfillment role yet, or the order may be FBA —
    // surface the reason without failing the local status update.
    return { error: err.message };
  }
}

module.exports = { getAdapter, getCategoryForType, importOrders, pushInventoryToChannel, pushProductToChannels, importCatalogFromChannel, confirmChannelShipment };
