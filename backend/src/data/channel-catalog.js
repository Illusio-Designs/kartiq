// Master catalog of every channel Kartriq supports.
// `integrated`  → adapter file exists in the codebase
// `comingSoon`  → adapter exists but has NOT been smoke-tested against live
//                  seller credentials yet — do not advertise as production-ready
// `requiresApproval` → needs seller/partner approval from the platform
// `credentialsSchema` → fields the frontend shows in the "Connect" form
//
// Public stats endpoint (`/api/v1/public/stats`) reports two counts:
//   channelsCount     = integrated && !comingSoon  (production-ready)
//   comingSoonCount   = comingSoon                  (on the roadmap)

const CATALOG = [

  // ═══════════════════════════════════════════════════════════════
  // ECOM — Indian Marketplaces
  // ═══════════════════════════════════════════════════════════════
  {
    type: 'AMAZON',
    category: 'ECOM',
    name: 'Amazon India',
    tagline: "India's largest e-commerce marketplace",
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory', 'tracking'],
    // LWA Client ID + Client Secret are auto-pulled from platform settings
    // (amazon.clientId / amazon.clientSecret) and so do not appear on the
    // tenant-facing credentials form. Tenants either run OAuth (preferred)
    // or paste a Self-Authorized refresh token for fast testing.
    credentialsSchema: [
      { key: 'sellerId',     label: 'Seller ID',          type: 'text',     required: true,  help: 'Seller Central → Settings → Account Info. For sandbox, paste the sandbox seller ID from Developer Central → "View sandbox credentials".' },
      { key: 'refreshToken', label: 'Refresh Token',      type: 'password', required: false, help: 'Skip if using OAuth. Otherwise: Develop Apps → your app → click "Self Authorize" to generate; begins with Atzr|.' },
      { key: 'region',       label: 'Region',             type: 'select',   required: true,  options: ['IN','US','CA','MX','BR','UK','DE','FR','IT','ES','NL','SE','PL','TR','AE','SA','EG','ZA','JP','AU','SG'], default: 'IN' },
    ],
    applyUrl: 'https://sellercentral.amazon.in',
    docsUrl:  'https://developer-docs.amazon.com/sp-api/',
  },
  {
    type: 'FLIPKART',
    category: 'ECOM',
    name: 'Flipkart',
    tagline: "India's second largest marketplace",
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'appId',     label: 'App ID',     type: 'text',     required: true },
      { key: 'appSecret', label: 'App Secret', type: 'password', required: true },
    ],
    applyUrl: 'https://seller.flipkart.com',
    docsUrl:  'https://seller.flipkart.com/api-docs/',
  },
  {
    type: 'MYNTRA',
    category: 'ECOM',
    name: 'Myntra',
    tagline: "India's leading fashion marketplace",
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'supplierId', label: 'Supplier ID', type: 'text',     required: true },
      { key: 'apiKey',     label: 'API Key',     type: 'text',     required: true },
      { key: 'secretKey',  label: 'Secret Key',  type: 'password', required: true },
    ],
    applyUrl: 'https://vendorhub.myntra.com',
  },
  {
    type: 'MEESHO',
    category: 'ECOM',
    name: 'Meesho',
    tagline: 'Social commerce platform for resellers',
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'apiKey', label: 'API Key', type: 'text', required: true },
    ],
    applyUrl: 'https://supplier.meesho.com',
    docsUrl:  'https://supplier.meesho.com/api',
  },
  {
    type: 'NYKAA',
    category: 'ECOM',
    name: 'Nykaa',
    tagline: 'Beauty & lifestyle marketplace',
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'sellerId', label: 'Seller ID', type: 'text',     required: true },
      { key: 'apiKey',   label: 'API Key',   type: 'password', required: true },
    ],
    applyUrl: 'https://seller.nykaa.com',
  },
  {
    type: 'AJIO',
    category: 'ECOM',
    name: 'Ajio',
    tagline: 'Reliance fashion & lifestyle marketplace',
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'supplierId', label: 'Supplier ID', type: 'text',     required: true },
      { key: 'apiKey',     label: 'API Key',     type: 'password', required: true },
    ],
    applyUrl: 'https://www.ajio.com/seller',
  },
  {
    type: 'TATA_CLIQ',
    category: 'ECOM',
    name: 'Tata Cliq',
    tagline: 'Tata Group premium marketplace',
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'sellerId', label: 'Seller ID', type: 'text',     required: true },
      { key: 'apiKey',   label: 'API Key',   type: 'password', required: true },
    ],
    applyUrl: 'https://seller.tatacliq.com',
  },
  {
    type: 'SNAPDEAL',
    category: 'ECOM',
    name: 'Snapdeal',
    tagline: 'Value e-commerce marketplace',
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'username', label: 'Username', type: 'text',     required: true },
      { key: 'apiKey',   label: 'API Key',  type: 'password', required: true },
    ],
    applyUrl: 'https://seller.snapdeal.com',
  },
  {
    type: 'GLOWROAD',
    category: 'ECOM',
    name: 'GlowRoad',
    tagline: 'Reseller marketplace (Amazon-owned)',
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
    applyUrl: 'https://supplier.glowroad.com',
  },
  {
    type: 'JIOMART',
    category: 'ECOM',
    name: 'JioMart',
    tagline: "Reliance's grocery & general merchandise marketplace",
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'sellerId', label: 'Seller ID', type: 'text',     required: true },
      { key: 'apiKey',   label: 'API Key',   type: 'password', required: true },
    ],
    applyUrl: 'https://www.jiomart.com/seller',
  },
  {
    type: 'PAYTM_MALL',
    category: 'ECOM',
    name: 'Paytm Mall',
    tagline: 'Paytm commerce marketplace',
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'sellerId', label: 'Seller ID', type: 'text',     required: true },
      { key: 'apiKey',   label: 'API Key',   type: 'password', required: true },
    ],
    applyUrl: 'https://seller.paytmmall.com',
  },
  {
    type: 'LIMEROAD',
    category: 'ECOM',
    name: 'LimeRoad',
    tagline: 'Fashion & lifestyle marketplace',
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
    applyUrl: 'https://www.limeroad.com/seller',
  },
  {
    type: 'EBAY',
    category: 'ECOM',
    name: 'eBay',
    tagline: 'Global auction & fixed-price marketplace',
    integrated: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'clientId',     label: 'Client ID',     type: 'text',     required: true },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
      { key: 'refreshToken', label: 'Refresh Token', type: 'password', required: true },
    ],
    applyUrl: 'https://developer.ebay.com',
    docsUrl:  'https://developer.ebay.com/docs',
  },
  {
    type: 'ETSY',
    category: 'ECOM',
    name: 'Etsy',
    tagline: 'Global marketplace for handmade & vintage items',
    integrated: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'apiKey',       label: 'API Key',      type: 'text',     required: true },
      { key: 'accessToken',  label: 'Access Token', type: 'password', required: true },
      { key: 'shopId',       label: 'Shop ID',      type: 'text',     required: true },
    ],
    applyUrl: 'https://www.etsy.com/developers',
    docsUrl:  'https://developers.etsy.com/documentation',
  },
  {
    type: 'FIRSTCRY',
    category: 'ECOM',
    name: 'FirstCry',
    tagline: "India's largest baby, kids & maternity store",
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'sellerId', label: 'Seller ID', type: 'text',     required: true },
      { key: 'apiKey',   label: 'API Key',   type: 'password', required: true },
    ],
    applyUrl: 'https://supplier.firstcry.com',
  },
  {
    type: 'PEPPERFRY',
    category: 'ECOM',
    name: 'Pepperfry',
    tagline: 'Online furniture & home décor marketplace',
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'sellerId', label: 'Seller ID', type: 'text',     required: true },
      { key: 'apiKey',   label: 'API Key',   type: 'password', required: true },
    ],
    applyUrl: 'https://merchant.pepperfry.com',
  },
  {
    type: 'CROMA',
    category: 'ECOM',
    name: 'Croma',
    tagline: 'Tata-backed consumer electronics marketplace',
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'sellerId', label: 'Seller ID', type: 'text',     required: true },
      { key: 'apiKey',   label: 'API Key',   type: 'password', required: true },
    ],
    applyUrl: 'https://www.croma.com',
  },
  {
    type: 'TATA_NEU',
    category: 'ECOM',
    name: 'Tata Neu',
    tagline: 'Tata Group super-app for everyday shopping',
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'sellerId', label: 'Seller ID', type: 'text',     required: true },
      { key: 'apiKey',   label: 'API Key',   type: 'password', required: true },
    ],
    applyUrl: 'https://www.tataneu.com',
  },

  // ═══════════════════════════════════════════════════════════════
  // QUICKCOM — Quick Commerce
  // ═══════════════════════════════════════════════════════════════
  {
    type: 'BLINKIT',
    category: 'QUICKCOM',
    name: 'Blinkit',
    tagline: '10-minute delivery, formerly Grofers',
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'apiKey',   label: 'API Key',   type: 'text',     required: true },
      { key: 'sellerId', label: 'Seller ID', type: 'text',     required: true },
    ],
    applyUrl: 'https://partners.blinkit.com',
  },
  {
    type: 'SWIGGY_INSTAMART',
    category: 'QUICKCOM',
    name: 'Swiggy Instamart',
    tagline: 'Partner API (approval-gated via Swiggy Builders Club)',
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'clientId',     label: 'Client ID',     type: 'text',     required: true },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
      { key: 'sellerId',     label: 'Seller ID',     type: 'text',     required: true },
    ],
    // Not self-serve: production credentials are issued only after Swiggy
    // reviews your integration via Builders Club (mcp.swiggy.com/builders).
    applyUrl: 'https://mcp.swiggy.com/builders',
  },
  {
    type: 'BB_NOW',
    category: 'QUICKCOM',
    name: 'BB Now',
    tagline: 'Instant delivery by BigBasket (Tata)',
    integrated: true,
    requiresApproval: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'apiKey',    label: 'API Key',    type: 'password', required: true },
      { key: 'vendorId',  label: 'Vendor ID',  type: 'text',     required: true },
    ],
    applyUrl: 'https://www.bigbasket.com/sell/',
  },
  {
    type: 'COUNTRY_DELIGHT',
    category: 'QUICKCOM',
    name: 'Country Delight',
    tagline: 'Daily essentials & dairy quick delivery',
    integrated: true,
    features: ['webhook', 'hmac_validation', 'field_mapping'],
    credentialsSchema: [
      { key: 'webhookSecret', label: 'Webhook Secret (HMAC-SHA256)', type: 'password', required: false },
      { key: 'fieldMap',      label: 'Field Map (JSON)',              type: 'textarea', required: false },
    ],
    applyUrl: 'https://www.countrydelight.in',
    note: 'Webhook-only: no public pull API. Country Delight\'s integration team posts orders to /api/v1/channels/:id/webhook (HMAC-SHA256 signed via webhookSecret).',
  },

  // ═══════════════════════════════════════════════════════════════
  // LOGISTICS — Shipping & Couriers
  // ═══════════════════════════════════════════════════════════════
  {
    type: 'SHIPROCKET',
    category: 'LOGISTICS',
    name: 'Shiprocket',
    tagline: '17+ couriers in one API — most popular aggregator',
    integrated: true,
    features: ['rates', 'shipment', 'tracking', 'pickup', 'cancel'],
    credentialsSchema: [
      { key: 'email',    label: 'Shiprocket Email',    type: 'email',    required: true },
      { key: 'password', label: 'Shiprocket Password', type: 'password', required: true },
    ],
    applyUrl: 'https://app.shiprocket.in/register',
    docsUrl:  'https://apidocs.shiprocket.in/',
  },
  {
    type: 'DELHIVERY',
    category: 'LOGISTICS',
    name: 'Delhivery',
    tagline: "India's largest logistics network",
    integrated: true,
    features: ['rates', 'shipment', 'tracking', 'pickup', 'cancel'],
    credentialsSchema: [
      { key: 'token', label: 'API Token', type: 'password', required: true },
    ],
    applyUrl: 'https://app.delhivery.com',
    docsUrl:  'https://dev.delhivery.com/docs',
  },
  {
    type: 'FSHIP',
    category: 'LOGISTICS',
    name: 'Fship',
    tagline: 'Multi-carrier shipping aggregator',
    integrated: true,
    features: ['rates', 'shipment', 'tracking', 'pickup', 'cancel'],
    credentialsSchema: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
    applyUrl: 'https://fship.in',
  },
  {
    type: 'PICKRR',
    category: 'LOGISTICS',
    name: 'Pickrr',
    tagline: 'Multi-carrier shipping aggregator (Shiprocket group)',
    integrated: true,
    features: ['rates', 'shipment', 'tracking', 'pickup', 'cancel'],
    credentialsSchema: [
      { key: 'authToken', label: 'Auth Token', type: 'password', required: true },
    ],
    applyUrl: 'https://www.pickrr.com',
  },
  {
    type: 'SHIPWAY',
    category: 'LOGISTICS',
    name: 'Shipway',
    tagline: 'Shipping + post-ship customer experience platform',
    integrated: true,
    features: ['rates', 'shipment', 'tracking', 'pickup', 'cancel'],
    credentialsSchema: [
      { key: 'username',   label: 'Username',    type: 'text',     required: true },
      { key: 'licenseKey', label: 'License Key', type: 'password', required: true },
    ],
    applyUrl: 'https://shipway.com',
  },
  {
    type: 'NIMBUSPOST',
    category: 'LOGISTICS',
    name: 'NimbusPost',
    tagline: 'Shipping aggregator for D2C brands',
    integrated: true,
    features: ['rates', 'shipment', 'tracking', 'pickup', 'cancel'],
    credentialsSchema: [
      { key: 'email',    label: 'Email',    type: 'email',    required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
    ],
    applyUrl: 'https://nimbuspost.com',
  },
  {
    type: 'CLICKPOST',
    category: 'LOGISTICS',
    name: 'ClickPost',
    tagline: 'Multi-carrier shipping & post-ship tracking',
    integrated: true,
    features: ['rates', 'shipment', 'tracking', 'cancel'],
    credentialsSchema: [
      { key: 'username', label: 'Username', type: 'text',     required: true },
      { key: 'apiKey',   label: 'API Key',  type: 'password', required: true },
    ],
    applyUrl: 'https://www.clickpost.ai',
  },
  {
    type: 'ITHINK',
    category: 'LOGISTICS',
    name: 'iThink Logistics',
    tagline: 'Multi-courier shipping aggregator — 20+ couriers in one API',
    integrated: true,
    features: ['rates', 'shipment', 'tracking', 'pickup', 'cancel'],
    credentialsSchema: [
      { key: 'accessToken', label: 'Access Token', type: 'password', required: true },
      { key: 'secretKey',   label: 'Secret Key',   type: 'password', required: true },
    ],
    applyUrl: 'https://www.ithinklogistics.com',
    docsUrl:  'https://www.ithinklogistics.com/developer',
  },
  {
    type: 'ECOMEXPRESS',
    category: 'LOGISTICS',
    name: 'Ecom Express',
    tagline: 'End-to-end logistics for e-commerce',
    integrated: true,
    features: ['shipment', 'tracking'],
    credentialsSchema: [
      { key: 'username', label: 'Username', type: 'text',     required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
    ],
    applyUrl: 'https://ecomexpress.in',
    note: 'Also accessible via Shiprocket aggregator.',
  },
  {
    type: 'XPRESSBEES',
    category: 'LOGISTICS',
    name: 'Xpressbees',
    tagline: 'Tech-first logistics for D2C brands',
    integrated: true,
    features: ['shipment', 'tracking'],
    credentialsSchema: [
      { key: 'email',    label: 'Email',    type: 'email',    required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
    ],
    applyUrl: 'https://www.xpressbees.com',
    note: 'Also accessible via Shiprocket aggregator.',
  },
  {
    type: 'SHADOWFAX',
    category: 'LOGISTICS',
    name: 'Shadowfax',
    tagline: 'Last-mile & hyperlocal delivery',
    integrated: true,
    features: ['shipment', 'tracking'],
    credentialsSchema: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
    applyUrl: 'https://shadowfax.in/business',
    note: 'Also accessible via Shiprocket aggregator.',
  },
  {
    type: 'BLUEDART',
    category: 'LOGISTICS',
    name: 'BlueDart',
    tagline: 'DHL Group — premium express delivery',
    integrated: true,
    features: ['shipment', 'tracking'],
    credentialsSchema: [
      { key: 'loginId',  label: 'Login ID',  type: 'text',     required: true },
      { key: 'password', label: 'Password',  type: 'password', required: true },
      { key: 'licenseKey', label: 'License Key', type: 'password', required: true },
    ],
    applyUrl: 'https://www.bluedart.com/api',
    note: 'Also accessible via Shiprocket & Delhivery aggregators.',
  },
  {
    type: 'DTDC',
    category: 'LOGISTICS',
    name: 'DTDC',
    tagline: 'Pan-India courier & cargo network',
    integrated: true,
    features: ['shipment', 'tracking'],
    credentialsSchema: [
      { key: 'apiKey',     label: 'API Key',     type: 'text',     required: true },
      { key: 'customerId', label: 'Customer ID', type: 'text',     required: true },
    ],
    applyUrl: 'https://www.dtdc.in/dtdc-api',
    note: 'Also accessible via Shiprocket & Delhivery aggregators.',
  },
  {
    type: 'FEDEX',
    category: 'LOGISTICS',
    name: 'FedEx',
    tagline: 'Global express delivery',
    integrated: true,
    features: ['shipment', 'tracking', 'rates'],
    credentialsSchema: [
      { key: 'apiKey',    label: 'API Key',    type: 'text',     required: true },
      { key: 'secretKey', label: 'Secret Key', type: 'password', required: true },
      { key: 'accountNo', label: 'Account No', type: 'text',     required: true },
    ],
    applyUrl: 'https://developer.fedex.com',
    docsUrl:  'https://developer.fedex.com/api/en-in/catalog.html',
  },
  {
    type: 'DHL',
    category: 'LOGISTICS',
    name: 'DHL',
    tagline: 'International express & logistics',
    integrated: true,
    features: ['shipment', 'tracking', 'rates'],
    credentialsSchema: [
      { key: 'apiKey',    label: 'API Key',    type: 'password', required: true },
      { key: 'accountNo', label: 'Account No', type: 'text',     required: true },
    ],
    applyUrl: 'https://developer.dhl.com',
    docsUrl:  'https://developer.dhl.com/api-reference',
  },
  {
    type: 'UPS',
    category: 'LOGISTICS',
    name: 'UPS',
    tagline: 'Global package delivery',
    integrated: true,
    features: ['shipment', 'tracking', 'rates'],
    credentialsSchema: [
      { key: 'clientId',     label: 'Client ID',     type: 'text',     required: true },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
      { key: 'accountNo',    label: 'Account No',    type: 'text',     required: true },
    ],
    applyUrl: 'https://developer.ups.com',
    docsUrl:  'https://developer.ups.com/api/reference',
  },

  // ═══════════════════════════════════════════════════════════════
  // OWNSTORE — Own Website / Store Platforms
  // ═══════════════════════════════════════════════════════════════
  {
    type: 'AMAZON_SMARTBIZ',
    category: 'OWNSTORE',
    name: 'Amazon Smart Biz',
    tagline: 'D2C website builder powered by Amazon MCF',
    integrated: true,
    features: ['orders', 'webhook', 'mcf_fulfillment', 'mcf_tracking', 'fba_inventory'],
    // LWA Client ID / Client Secret are auto-pulled from amazon.clientId /
    // amazon.clientSecret platform settings. Tenants only need to provide
    // their seller-specific values.
    credentialsSchema: [
      { key: 'sellerId',     label: 'Seller ID',         type: 'text',     required: true,  help: 'Seller Central → Settings → Account Info. For sandbox, paste the sandbox seller ID from Developer Central → "View sandbox credentials".' },
      { key: 'refreshToken', label: 'Refresh Token',     type: 'password', required: false, help: 'Skip if using OAuth. Otherwise: Develop Apps → your app → "Self Authorize"; begins with Atzr|.' },
      { key: 'webhookSecret',label: 'Webhook Secret (optional)', type: 'password', required: false, help: 'Optional. Only needed if you want SmartBiz to push order events to Kartriq in real time (instead of polling every 5 minutes). Set the same shared secret in your SmartBiz dashboard → Webhooks. Leave blank to use SP-API polling only.' },
    ],
    applyUrl: 'https://smartcommerce.amazon.in/smartbiz',
    docsUrl:  'https://developer-docs.amazon.com/sp-api/',
  },
  {
    type: 'SHOPIFY',
    category: 'OWNSTORE',
    name: 'Shopify',
    tagline: 'World\'s leading e-commerce platform',
    integrated: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'shopUrl',     label: 'Shop URL (e.g. mystore.myshopify.com)', type: 'text',     required: true },
      { key: 'accessToken', label: 'Admin API Access Token',                type: 'password', required: true },
    ],
    applyUrl: 'https://www.shopify.com/partners',
    docsUrl:  'https://shopify.dev/docs/api/admin-rest',
  },
  {
    type: 'WOOCOMMERCE',
    category: 'OWNSTORE',
    name: 'WooCommerce',
    tagline: 'WordPress-based e-commerce store',
    integrated: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'siteUrl',        label: 'Store URL (e.g. https://mystore.com)', type: 'text',     required: true },
      { key: 'consumerKey',    label: 'Consumer Key',                         type: 'text',     required: true },
      { key: 'consumerSecret', label: 'Consumer Secret',                      type: 'password', required: true },
    ],
    docsUrl: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
  },
  {
    type: 'MAGENTO',
    category: 'OWNSTORE',
    name: 'Magento / Adobe Commerce',
    tagline: 'Enterprise open-source commerce platform',
    integrated: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'baseUrl',     label: 'Store Base URL',   type: 'text',     required: true },
      { key: 'accessToken', label: 'REST Access Token', type: 'password', required: true },
    ],
    docsUrl: 'https://developer.adobe.com/commerce/webapi/rest/',
  },
  {
    type: 'BIGCOMMERCE',
    category: 'OWNSTORE',
    name: 'BigCommerce',
    tagline: 'Cloud-based e-commerce platform',
    integrated: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'storeHash',   label: 'Store Hash',   type: 'text',     required: true },
      { key: 'accessToken', label: 'Access Token', type: 'password', required: true },
    ],
    docsUrl: 'https://developer.bigcommerce.com/docs/rest-management',
  },
  {
    type: 'OPENCART',
    category: 'OWNSTORE',
    name: 'OpenCart',
    tagline: 'Free open-source e-commerce platform',
    integrated: true,
    features: ['orders', 'inventory'],
    credentialsSchema: [
      { key: 'storeUrl',  label: 'Store URL',  type: 'text',     required: true },
      { key: 'username',  label: 'Username',   type: 'text',     required: true },
      { key: 'apiKey',    label: 'API Key',    type: 'password', required: true },
    ],
  },
  {
    type: 'WEBSITE',
    category: 'OWNSTORE',
    name: 'Custom Website',
    tagline: 'Your own website via HMAC-signed webhook',
    integrated: true,
    features: ['webhook', 'hmac_validation', 'field_mapping'],
    credentialsSchema: [
      { key: 'webhookSecret', label: 'Webhook Secret (HMAC-SHA256)', type: 'password', required: false },
      { key: 'fieldMap',      label: 'Field Map (JSON)',              type: 'textarea', required: false },
    ],
    note: 'Uses the same universal webhook adapter as CUSTOM_WEBHOOK. POST orders to /api/v1/channels/:id/webhook.',
  },
  {
    type: 'OFFLINE',
    category: 'OWNSTORE',
    name: 'Offline / Retail Store',
    tagline: 'Walk-in customers, manual order entry',
    integrated: true,
    manualOnly: true,
    features: ['manual'],
    credentialsSchema: [],
    note: 'No API connection needed. Connect once; then enter orders via the New Order form.',
  },
  {
    type: 'POS',
    category: 'OWNSTORE',
    name: 'POS System',
    tagline: 'Point of sale — physical billing counter',
    integrated: true,
    manualOnly: true,
    features: ['manual'],
    credentialsSchema: [],
    note: 'No API connection needed. Enter orders manually or import via CSV.',
  },

  // ═══════════════════════════════════════════════════════════════
  // SOCIAL — Social Commerce
  // ═══════════════════════════════════════════════════════════════
  {
    type: 'INSTAGRAM',
    category: 'SOCIAL',
    name: 'Instagram Shopping',
    tagline: 'Sell via Instagram posts & stories',
    integrated: true,
    features: ['orders'],
    credentialsSchema: [
      { key: 'accessToken', label: 'Access Token', type: 'password', required: true },
      { key: 'pageId',      label: 'Page ID',      type: 'text',     required: true },
    ],
    applyUrl: 'https://developers.facebook.com/docs/commerce-platform',
  },
  {
    type: 'FACEBOOK',
    category: 'SOCIAL',
    name: 'Facebook Shop',
    tagline: 'Sell via Facebook Marketplace & Shops',
    integrated: true,
    features: ['orders'],
    credentialsSchema: [
      { key: 'accessToken', label: 'Access Token', type: 'password', required: true },
      { key: 'pageId',      label: 'Page ID',      type: 'text',     required: true },
    ],
    applyUrl: 'https://developers.facebook.com/docs/commerce-platform',
  },
  {
    type: 'WHATSAPP_BUSINESS',
    category: 'SOCIAL',
    name: 'WhatsApp Business',
    tagline: 'Conversational commerce via WhatsApp',
    integrated: true,
    features: ['orders', 'webhook'],
    credentialsSchema: [
      { key: 'phoneNumberId', label: 'Phone Number ID', type: 'text',     required: true },
      { key: 'accessToken',   label: 'Access Token',    type: 'password', required: true },
    ],
    applyUrl: 'https://developers.facebook.com/docs/whatsapp',
  },

  // ═══════════════════════════════════════════════════════════════
  // B2B
  // ═══════════════════════════════════════════════════════════════
  {
    type: 'B2B_PORTAL',
    category: 'B2B',
    name: 'B2B Portal',
    tagline: 'Custom B2B ordering portal',
    integrated: true,
    features: ['webhook', 'manual'],
    credentialsSchema: [
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', required: false },
    ],
    note: 'Receives orders via webhook (CustomWebhook adapter). Optional HMAC secret for signature validation.',
  },
  {
    type: 'WHOLESALE',
    category: 'B2B',
    name: 'Wholesale Channel',
    tagline: 'Bulk orders from wholesale buyers',
    integrated: true,
    manualOnly: true,
    features: ['manual'],
    credentialsSchema: [],
    note: 'Manual entry. Connect once; create wholesale orders via the New Order form.',
  },
  {
    type: 'DISTRIBUTOR',
    category: 'B2B',
    name: 'Distributor',
    tagline: 'Orders from distributors and stockists',
    integrated: true,
    manualOnly: true,
    features: ['manual'],
    credentialsSchema: [],
    note: 'Manual entry. Connect once; record distributor orders via the New Order form.',
  },

  // ═══════════════════════════════════════════════════════════════
  // CUSTOM
  // ═══════════════════════════════════════════════════════════════
  {
    type: 'CUSTOM_WEBHOOK',
    category: 'CUSTOM',
    name: 'Custom Webhook',
    tagline: 'Receive orders from any system via HMAC-signed webhook',
    integrated: true,
    features: ['webhook', 'hmac_validation', 'field_mapping'],
    credentialsSchema: [
      { key: 'webhookSecret', label: 'Webhook Secret (HMAC-SHA256)', type: 'password', required: false },
      { key: 'fieldMap',      label: 'Field Map (JSON)',              type: 'textarea', required: false },
    ],
    note: 'Point your system to POST /api/v1/channels/:id/webhook. If a secret is set, send x-kartriq-signature header with hex HMAC-SHA256 of the raw body.',
  },
  {
    type: 'OTHER',
    category: 'CUSTOM',
    name: 'Other',
    tagline: 'Catch-all for any channel not in the catalog',
    integrated: true,
    manualOnly: true,
    features: ['manual'],
    credentialsSchema: [],
    note: 'Manual entry. Use this for one-off or experimental channels not yet in the catalog.',
  },

  // ═══════════════════════════════════════════════════════════════
  // PENDING — coming-soon entries (adapter not yet built)
  // Helper:  pending(type, category, name, tagline, opts?)
  //   opts.requiresApproval / opts.features / opts.applyUrl /
  //   opts.docsUrl / opts.note
  // ═══════════════════════════════════════════════════════════════
  ...(() => {
    const pending = (type, category, name, tagline, opts = {}) => ({
      type,
      category,
      name,
      tagline,
      integrated: true,
      comingSoon: true,
      requiresApproval: opts.requiresApproval ?? true,
      features: opts.features || ['orders', 'inventory'],
      credentialsSchema: opts.credentialsSchema || [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
      ],
      ...(opts.applyUrl ? { applyUrl: opts.applyUrl } : {}),
      ...(opts.docsUrl  ? { docsUrl:  opts.docsUrl  } : {}),
      ...(opts.note     ? { note:     opts.note     } : {}),
    });

    return [
      // ── ECOM (international expansion) ─────────────────────────
      pending('WALMART',         'ECOM', 'Walmart',                "US's largest retail marketplace", {
        applyUrl: 'https://marketplace.walmart.com',
        docsUrl:  'https://developer.walmart.com/api/us/mp/orders',
        credentialsSchema: [
          { key: 'partnerId', label: 'Walmart Partner ID', type: 'text',   required: true,  help: 'Found in Seller Center → Settings → Partner Profile.' },
          { key: 'region',    label: 'Region',             type: 'select', required: true,  options: ['US','CA','MX'], default: 'US' },
        ],
        note: 'Founder-app pattern. Register a Solution Provider app at https://developer.walmart.com and store walmart.clientId / walmart.clientSecret in Admin → Settings. Sellers only paste their partnerId.',
      }),
      pending('AMAZON_US',       'ECOM', 'Amazon US',              'Amazon.com — US marketplace', {
        applyUrl: 'https://sellercentral.amazon.com',
        docsUrl:  'https://developer-docs.amazon.com/sp-api/',
        credentialsSchema: [
          { key: 'sellerId', label: 'Seller ID', type: 'text', required: false, help: 'Auto-filled if you use OAuth.' },
          { key: 'refreshToken', label: 'Refresh Token', type: 'password', required: false, help: 'Skip if using OAuth. Otherwise: Self Authorize from Develop Apps; begins with Atzr|.' },
        ], // OAuth-driven by default — fields are only used when pasting a Self-Authorized refresh token
        note: 'Reuses the platform Amazon SP-API app (amazon.appId / amazon.clientId / amazon.clientSecret). Region is fixed to US (marketplace ATVPDKIKX0DER, NA SP-API host). Smoke-test by registering the SP-API app for the North America region in Seller Central.',
      }),
      pending('AMAZON_UK',  'ECOM', 'Amazon UK',           'Amazon.co.uk — UK marketplace', {
        applyUrl: 'https://sellercentral.amazon.co.uk',
        docsUrl:  'https://developer-docs.amazon.com/sp-api/',
        credentialsSchema: [
          { key: 'sellerId', label: 'Seller ID', type: 'text', required: false, help: 'Auto-filled if you use OAuth.' },
          { key: 'refreshToken', label: 'Refresh Token', type: 'password', required: false, help: 'Skip if using OAuth. Otherwise: Self Authorize from Develop Apps; begins with Atzr|.' },
        ],
        note: 'Reuses the platform Amazon SP-API app. Region locked to UK (marketplace A1F83G8C2ARO7P, EU SP-API host). Smoke-test against a UK sandbox seller.',
      }),
      pending('AMAZON_UAE', 'ECOM', 'Amazon UAE',          'Amazon.ae — UAE marketplace', {
        applyUrl: 'https://sellercentral.amazon.ae',
        docsUrl:  'https://developer-docs.amazon.com/sp-api/',
        credentialsSchema: [
          { key: 'sellerId', label: 'Seller ID', type: 'text', required: false, help: 'Auto-filled if you use OAuth.' },
          { key: 'refreshToken', label: 'Refresh Token', type: 'password', required: false, help: 'Skip if using OAuth. Otherwise: Self Authorize from Develop Apps; begins with Atzr|.' },
        ],
        note: 'Reuses the platform Amazon SP-API app. Region locked to AE (marketplace A2VIGQ35RCS4UG, EU SP-API host). Smoke-test against a UAE sandbox seller.',
      }),
      pending('AMAZON_SA',  'ECOM', 'Amazon Saudi Arabia', 'Amazon.sa — Saudi marketplace', {
        applyUrl: 'https://sellercentral.amazon.sa',
        docsUrl:  'https://developer-docs.amazon.com/sp-api/',
        credentialsSchema: [
          { key: 'sellerId', label: 'Seller ID', type: 'text', required: false, help: 'Auto-filled if you use OAuth.' },
          { key: 'refreshToken', label: 'Refresh Token', type: 'password', required: false, help: 'Skip if using OAuth. Otherwise: Self Authorize from Develop Apps; begins with Atzr|.' },
        ],
        note: 'Reuses the platform Amazon SP-API app. Region locked to SA (marketplace A17E79C6D8DWNP, EU SP-API host). Smoke-test against a Saudi sandbox seller.',
      }),
      pending('AMAZON_SG',  'ECOM', 'Amazon Singapore',    'Amazon.sg — Singapore marketplace', {
        applyUrl: 'https://sellercentral.amazon.sg',
        docsUrl:  'https://developer-docs.amazon.com/sp-api/',
        credentialsSchema: [
          { key: 'sellerId', label: 'Seller ID', type: 'text', required: false, help: 'Auto-filled if you use OAuth.' },
          { key: 'refreshToken', label: 'Refresh Token', type: 'password', required: false, help: 'Skip if using OAuth. Otherwise: Self Authorize from Develop Apps; begins with Atzr|.' },
        ],
        note: 'Reuses the platform Amazon SP-API app. Region locked to SG (marketplace A19VAU5U5O7RUS, FE SP-API host). Smoke-test against a Singapore sandbox seller.',
      }),
      pending('AMAZON_AU',  'ECOM', 'Amazon Australia',    'Amazon.com.au — AU marketplace', {
        applyUrl: 'https://sellercentral.amazon.com.au',
        docsUrl:  'https://developer-docs.amazon.com/sp-api/',
        credentialsSchema: [
          { key: 'sellerId', label: 'Seller ID', type: 'text', required: false, help: 'Auto-filled if you use OAuth.' },
          { key: 'refreshToken', label: 'Refresh Token', type: 'password', required: false, help: 'Skip if using OAuth. Otherwise: Self Authorize from Develop Apps; begins with Atzr|.' },
        ],
        note: 'Reuses the platform Amazon SP-API app. Region locked to AU (marketplace A39IBJ37TRP1C6, FE SP-API host). Smoke-test against an Australian sandbox seller.',
      }),
      pending('AMAZON_DE',  'ECOM', 'Amazon Germany',      'Amazon.de — Germany marketplace', {
        applyUrl: 'https://sellercentral.amazon.de',
        docsUrl:  'https://developer-docs.amazon.com/sp-api/',
        credentialsSchema: [
          { key: 'sellerId', label: 'Seller ID', type: 'text', required: false, help: 'Auto-filled if you use OAuth.' },
          { key: 'refreshToken', label: 'Refresh Token', type: 'password', required: false, help: 'Skip if using OAuth. Otherwise: Self Authorize from Develop Apps; begins with Atzr|.' },
        ],
        note: 'Reuses the platform Amazon SP-API app. Region locked to DE (marketplace A1PA6795UKMFR9, EU SP-API host). Smoke-test against a German sandbox seller.',
      }),
      pending('LAZADA', 'ECOM', 'Lazada', 'Southeast Asia marketplace', {
        applyUrl: 'https://open.lazada.com/apps',
        docsUrl:  'https://open.lazada.com/apps/doc/api',
        credentialsSchema: [
          { key: 'region', label: 'Country', type: 'select', required: true, options: ['SG','TH','PH','MY','VN','ID'], default: 'SG' },
        ],
        note: 'Founder-app pattern. Register a Lazada Open Platform app at https://open.lazada.com/apps and store lazada.appKey / lazada.appSecret / lazada.redirectUri in Admin → Settings. Sellers pick a country then click Authorize — OAuth callback exchanges the code for access/refresh tokens.',
      }),
      pending('SHOPEE', 'ECOM', 'Shopee', 'Southeast Asia, Taiwan & Latin America marketplace', {
        applyUrl: 'https://open.shopee.com',
        docsUrl:  'https://open.shopee.com/documents?module=63&type=2&id=51',
        credentialsSchema: [
          { key: 'region', label: 'Country', type: 'select', required: true, options: ['SG','MY','TH','ID','VN','PH','TW','BR','MX','CO','CL','PL'], default: 'SG' },
        ],
        note: 'Founder-app pattern. Register a Shopee Open Platform app at https://open.shopee.com and store shopee.partnerId / shopee.partnerKey / shopee.redirectUri in Admin → Settings. Sellers pick a country then click Authorize — OAuth callback exchanges the code + shop_id for access/refresh tokens.',
      }),
      pending('NOON', 'ECOM', 'Noon', 'Middle East marketplace (UAE, KSA, Egypt)', {
        applyUrl: 'https://partners.noon.com',
        docsUrl:  'https://docs.noon.partners/',
        credentialsSchema: [
          { key: 'apiKey',      label: 'API Key',      type: 'password', required: true,  help: 'Noon Partners → Settings → API.' },
          { key: 'partnerCode', label: 'Partner Code', type: 'text',     required: true,  help: 'Noon Partners → Account.' },
          { key: 'region',      label: 'Country',      type: 'select',   required: true,  options: ['AE','SA','EG'], default: 'AE' },
        ],
        note: 'Per-merchant API key — no founder app needed. Each seller gets their own apiKey + partnerCode from Noon Partners and selects a country (AE/SA/EG).',
      }),
      pending('MERCADO_LIBRE', 'ECOM', 'Mercado Libre', "Latin America's largest marketplace", {
        applyUrl: 'https://developers.mercadolibre.com',
        docsUrl:  'https://developers.mercadolibre.com.ar/en_us/orders-management',
        credentialsSchema: [
          { key: 'region', label: 'Country', type: 'select', required: true, options: ['AR','BR','MX','CL','CO','UY','PE','VE'], default: 'AR' },
        ],
        note: 'Founder-app pattern. Register a Mercado Libre app at https://developers.mercadolibre.com and store mercadolibre.clientId / mercadolibre.clientSecret / mercadolibre.redirectUri in Admin → Settings. One app covers all 8 LATAM markets — sellers pick a country and click Authorize, OAuth callback exchanges the code for access/refresh tokens + numeric user_id.',
      }),
      pending('ALLEGRO', 'ECOM', 'Allegro', "Poland's leading marketplace", {
        applyUrl: 'https://apps.developer.allegro.pl',
        docsUrl:  'https://developer.allegro.pl/auth/',
        credentialsSchema: [
          { key: 'sandbox', label: 'Use Allegro Sandbox', type: 'select', required: false, options: ['false','true'], default: 'false', help: 'Switch to sandbox to test against allegro.pl.allegrosandbox.pl.' },
        ],
        note: 'Founder-app pattern. Register an Allegro app at https://apps.developer.allegro.pl and store allegro.clientId / allegro.clientSecret / allegro.redirectUri in Admin → Settings. Sellers click Authorize — OAuth callback exchanges the code for a 12h access_token + sliding refresh_token. Sandbox mode (allegro.pl.allegrosandbox.pl) is supported via the toggle.',
      }),
      pending('FRUUGO', 'ECOM', 'Fruugo', 'Global cross-border marketplace', {
        applyUrl: 'https://www.fruugo.com/sell',
        docsUrl:  'https://faq.fruugo.com/hc/en-gb/categories/360001212580-API',
        credentialsSchema: [
          { key: 'username', label: 'Fruugo Username', type: 'text',     required: true,  help: 'From your Fruugo merchant dashboard.' },
          { key: 'password', label: 'Fruugo Password', type: 'password', required: true,  help: 'HTTP Basic-auth password issued by Fruugo.' },
        ],
        note: 'Per-merchant HTTP Basic auth — no founder app. Each retailer gets credentials when onboarded by Fruugo. Adapter polls /api/orders/new and acknowledges orders so they are removed from the queue.',
      }),
      pending('ONBUY', 'ECOM', 'OnBuy', 'UK & European marketplace', {
        applyUrl: 'https://www.onbuy.com/gb/sell-on-onbuy',
        docsUrl:  'https://docs.api.onbuy.com/',
        credentialsSchema: [
          { key: 'consumerKey', label: 'OnBuy Consumer Key', type: 'text',     required: true },
          { key: 'secretKey',   label: 'OnBuy Secret Key',   type: 'password', required: true },
          { key: 'siteId',      label: 'OnBuy Site',         type: 'select',   required: false, options: ['2000','2001','2002','2003','2004','2005'], default: '2000', help: '2000 = UK; other site IDs unlock European country-specific endpoints.' },
        ],
        note: 'Per-seller credentials — no founder app. Adapter exchanges consumer_key + secret_key for a 1-hour access_token via /v2/auth/request-token and refreshes transparently. Site ID 2000 = OnBuy GB.',
      }),
      pending('MANOMANO', 'ECOM', 'ManoMano', 'European DIY & home marketplace', {
        applyUrl: 'https://www.manomano.com/seller',
        docsUrl:  'https://developer.manomano.com/',
        credentialsSchema: [
          { key: 'accessToken', label: 'ManoMano API Token', type: 'password', required: true,  help: 'Generate from your ManoMano seller hub.' },
          { key: 'region',      label: 'Country',            type: 'select',   required: true,  options: ['FR','UK','DE','IT','ES','BE'], default: 'FR' },
        ],
        note: 'Per-seller API token (no founder app). Each retailer is onboarded into ManoMano and issued a bearer-style token. The X-Mano-Country header scopes calls to the chosen marketplace.',
      }),
      pending('RAKUTEN', 'ECOM', 'Rakuten Ichiba', 'Japanese e-commerce giant', {
        applyUrl: 'https://www.rakuten.co.jp/ec/',
        docsUrl:  'https://webservice.rakuten.co.jp/documentation',
        credentialsSchema: [
          { key: 'serviceSecret', label: 'Service Secret', type: 'password', required: true, help: 'From R-Login → API settings.' },
          { key: 'licenseKey',    label: 'License Key',    type: 'password', required: true, help: 'From R-Login → API settings.' },
        ],
        note: 'Per-seller credentials (no founder app). Rakuten Merchant Server (RMS) uses ESA-scheme auth: serviceSecret + licenseKey base64-encoded into the Authorization header. Order pull is two-step (searchOrder → getOrder in chunks of 50).',
      }),
      pending('ZALANDO', 'ECOM', 'Zalando', 'European fashion marketplace', {
        applyUrl: 'https://corporate.zalando.com/en/partner-hub',
        docsUrl:  'https://api.merchants.zalandoapis.com/docs',
        credentialsSchema: [
          { key: 'clientId',     label: 'zDirect Client ID',     type: 'text',     required: true },
          { key: 'clientSecret', label: 'zDirect Client Secret', type: 'password', required: true },
          { key: 'merchantId',   label: 'Merchant ID',           type: 'text',     required: true, help: 'Found in zDirect under your merchant account.' },
        ],
        note: 'Per-merchant client_credentials (no founder app). Each Zalando merchant registers their own API client in zDirect and gets clientId + clientSecret + merchantId. Adapter exchanges them for short-lived bearer tokens against api.merchants.zalandoapis.com and refreshes transparently.',
      }),
      pending('KAUFLAND', 'ECOM', 'Kaufland', 'European general merchandise marketplace (Kaufland Global Marketplace)', {
        applyUrl: 'https://www.kaufland.de/seller-portal',
        docsUrl:  'https://docs.kaufland.com/',
        credentialsSchema: [
          { key: 'clientKey',  label: 'Client Key',  type: 'text',     required: true },
          { key: 'secretKey',  label: 'Secret Key',  type: 'password', required: true,  help: 'Used to HMAC-sign each request — never sent over the wire.' },
          { key: 'storefront', label: 'Storefront', type: 'select',   required: true,  options: ['de','at','sk','cz','pl','hr'], default: 'de' },
        ],
        note: 'Per-merchant credentials — no founder app. Each request is HMAC-SHA256 signed (Shop-Signature header). The previous adapter incorrectly sent the secret key as a header; the rewrite signs locally and only sends the signature + timestamp.',
      }),
      pending('WISH', 'ECOM', 'Wish', 'Mobile-first global marketplace', {
        applyUrl: 'https://merchant.wish.com',
        docsUrl:  'https://merchant.wish.com/documentation/api/v3',
        credentialsSchema: [], // OAuth-driven — sellers click "Authorize with Wish"
        note: 'Founder-app pattern. Register a Wish Merchant Platform app at https://merchant.wish.com/api-partner and store wish.clientId / wish.clientSecret / wish.redirectUri in Admin → Settings. Sellers click Authorize — OAuth callback exchanges the code for a 30-day access_token + refresh_token.',
      }),

      // ── ECOM (India gaps) ──────────────────────────────────────
      pending('INDIAMART',       'ECOM', 'IndiaMART',              "India's largest B2B marketplace & lead source", { applyUrl: 'https://seller.indiamart.com' }),
      pending('INDUSTRYBUYING',  'ECOM', 'Industrybuying',         'B2B industrial supplies marketplace', { applyUrl: 'https://seller.industrybuying.com' }),
      pending('MOGLIX',          'ECOM', 'Moglix',                 'B2B industrial & MRO marketplace',    { applyUrl: 'https://supplier.moglix.com' }),
      pending('PURPLLE',         'ECOM', 'Purplle',                'Beauty & personal care marketplace',  { applyUrl: 'https://seller.purplle.com' }),
      pending('BEWAKOOF',        'ECOM', 'Bewakoof',               'Casual fashion marketplace',          { applyUrl: 'https://seller.bewakoof.com' }),
      pending('SHOPCLUES',       'ECOM', 'ShopClues',              'Value e-commerce marketplace',        { applyUrl: 'https://seller.shopclues.com' }),

      // ── QUICKCOM additions ─────────────────────────────────────
      // Removed DUNZO (service discontinued in 2024) — adapter retained as
      // a no-op stub in services/channels/quickcom/pending.js for safety.
      pending('FLIPKART_MINUTES','QUICKCOM', 'Flipkart Minutes',   "Flipkart's quick commerce service",   { applyUrl: 'https://seller.flipkart.com', note: 'Subclasses Flipkart adapter; filters orders by service_profile=QUICK_COMMERCE on the raw response. Needs Flipkart seller account with Minutes onboarding to smoke-test.' }),
      pending('TATA_1MG',        'QUICKCOM', 'Tata 1mg',           'Quick pharmacy & wellness delivery',  { applyUrl: 'https://www.1mg.com', note: 'No public seller API — partnership-only. URL/field shapes in adapter are best-effort and may need correction once real credentials are issued.' }),

      // ── LOGISTICS additions ────────────────────────────────────
      pending('ARAMEX',          'LOGISTICS', 'Aramex',            'Global express & logistics network', { features: ['shipment','tracking','rates'], requiresApproval: false, applyUrl: 'https://www.aramex.com' }),
      pending('EKART',           'LOGISTICS', 'Ekart',             "Flipkart's logistics arm",          { features: ['shipment','tracking'], applyUrl: 'https://ekartlogistics.com' }),
      pending('INDIA_POST',      'LOGISTICS', 'India Post',        'Government postal & courier service',{ features: ['shipment','tracking'], applyUrl: 'https://www.indiapost.gov.in' }),
      pending('GATI',            'LOGISTICS', 'Gati',              'Surface express logistics',          { features: ['shipment','tracking'], applyUrl: 'https://www.gati.com' }),
      pending('SAFEXPRESS',      'LOGISTICS', 'Safexpress',        'B2B logistics & supply chain',       { features: ['shipment','tracking'], applyUrl: 'https://www.safexpress.com' }),
      pending('TRACKON',         'LOGISTICS', 'Trackon',           'Pan-India courier service',          { features: ['shipment','tracking'], applyUrl: 'https://www.trackon.in' }),
      pending('PROFESSIONAL_COURIERS','LOGISTICS','The Professional Couriers','Pan-India courier network', { features: ['shipment','tracking'], applyUrl: 'https://www.tpcindia.com' }),
      pending('SMARTR',          'LOGISTICS', 'Smartr Logistics',  'Tech-driven express logistics',      { features: ['shipment','tracking'], applyUrl: 'https://smartr.in' }),
      pending('SHYPLITE',        'LOGISTICS', 'Shyplite',          'Multi-carrier shipping aggregator',  { features: ['rates','shipment','tracking'], applyUrl: 'https://shyplite.com' }),
      pending('ICARRY',          'LOGISTICS', 'iCarry',            'Multi-carrier shipping aggregator',  { features: ['rates','shipment','tracking'], applyUrl: 'https://icarry.in' }),
      pending('DOTZOT',          'LOGISTICS', 'DotZot',            'B2B & B2C express delivery',         { features: ['shipment','tracking'], applyUrl: 'https://www.dotzot.in' }),
      pending('SHIPDELIGHT',     'LOGISTICS', 'ShipDelight',       'Shipping & post-ship engagement',    { features: ['rates','shipment','tracking'], applyUrl: 'https://www.shipdelight.com' }),

      // ── OWNSTORE additions ─────────────────────────────────────
      pending('WIX',                'OWNSTORE','Wix Stores',           'Drag-and-drop e-commerce builder',   { requiresApproval: false, applyUrl: 'https://www.wix.com/ecommerce' }),
      pending('SQUARESPACE',        'OWNSTORE','Squarespace Commerce', 'Designer e-commerce platform',       { requiresApproval: false, applyUrl: 'https://www.squarespace.com/ecommerce' }),
      pending('SALESFORCE_COMMERCE','OWNSTORE','Salesforce Commerce Cloud', 'Enterprise commerce cloud',     { applyUrl: 'https://www.salesforce.com/commerce' }),
      pending('PRESTASHOP',         'OWNSTORE','PrestaShop',           'Open-source e-commerce platform',    { requiresApproval: false }),
      pending('ECWID',              'OWNSTORE','Ecwid',                'Embedded e-commerce widget',         { requiresApproval: false, applyUrl: 'https://www.ecwid.com' }),
      pending('ZOHO_COMMERCE',      'OWNSTORE','Zoho Commerce',        'All-in-one e-commerce platform',     { requiresApproval: false, applyUrl: 'https://www.zoho.com/commerce' }),
      pending('DUKAAN',             'OWNSTORE','Dukaan',               'D2C store builder for Indian SMBs',  { requiresApproval: false, applyUrl: 'https://mydukaan.io' }),
      pending('SHOOPY',             'OWNSTORE','Shoopy',               'Mobile-first online store builder',  { requiresApproval: false, applyUrl: 'https://shoopy.in' }),
      pending('BIKAYI',             'OWNSTORE','Bikayi',               'Mobile WhatsApp store builder',      { requiresApproval: false, applyUrl: 'https://bikayi.com' }),
      pending('KARTROCKET',         'OWNSTORE','KartRocket',           'Indian D2C e-commerce platform',     { requiresApproval: false, applyUrl: 'https://www.kartrocket.com' }),
      pending('INSTAMOJO_PAGES',    'OWNSTORE','Instamojo Smart Pages','Online store + payments by Instamojo',{ requiresApproval: false, applyUrl: 'https://www.instamojo.com' }),

      // ── SOCIAL additions ───────────────────────────────────────
      pending('TIKTOK_SHOP',     'SOCIAL', 'TikTok Shop',          'In-app shopping on TikTok',           { features: ['orders','inventory'], applyUrl: 'https://seller-us.tiktok.com' }),
      pending('PINTEREST',       'SOCIAL', 'Pinterest Shopping',   'Pinnable product catalog & checkout', { features: ['orders'], applyUrl: 'https://business.pinterest.com' }),
      pending('YOUTUBE_SHOPPING','SOCIAL', 'YouTube Shopping',     'Tag products in videos & shorts',     { features: ['orders'], applyUrl: 'https://www.youtube.com/creators/shopping' }),
      pending('SNAPCHAT',        'SOCIAL', 'Snapchat Ads & Catalog','Catalog-driven ads on Snapchat',     { features: ['orders'], applyUrl: 'https://forbusiness.snapchat.com' }),

      // ── ACCOUNTING & ERP (new category) ────────────────────────
      pending('TALLY',           'ACCOUNTING', 'Tally',            'Tally accounting (legacy ERP 9)',     { features: ['invoices','vouchers','ledger'], requiresApproval: false, applyUrl: 'https://tallysolutions.com' }),
      pending('TALLY_PRIME',     'ACCOUNTING', 'Tally Prime',      'Modern Tally accounting & GST',       { features: ['invoices','vouchers','ledger','gst'], requiresApproval: false, applyUrl: 'https://tallysolutions.com/tally-prime' }),
      pending('ZOHO_BOOKS',      'ACCOUNTING', 'Zoho Books',       'Online accounting for SMBs',          { features: ['invoices','expenses','gst'], requiresApproval: false, applyUrl: 'https://www.zoho.com/books' }),
      pending('QUICKBOOKS',      'ACCOUNTING', 'QuickBooks',       'Intuit accounting for SMBs',          { features: ['invoices','expenses'], requiresApproval: false, applyUrl: 'https://quickbooks.intuit.com' }),
      pending('XERO',            'ACCOUNTING', 'Xero',             'Cloud accounting platform',           { features: ['invoices','expenses'], requiresApproval: false, applyUrl: 'https://www.xero.com' }),
      pending('SAP_B1',          'ACCOUNTING', 'SAP Business One',  'ERP for small & midsize businesses',  { features: ['invoices','vouchers','inventory_sync'], applyUrl: 'https://www.sap.com/products/business-one.html' }),
      pending('SAP_S4HANA',      'ACCOUNTING', 'SAP S/4HANA',      'SAP enterprise ERP suite',            { features: ['invoices','vouchers','inventory_sync'], applyUrl: 'https://www.sap.com/products/s4hana-erp.html' }),
      pending('ERPNEXT',         'ACCOUNTING', 'ERPNext',          'Open-source ERP & accounting',        { features: ['invoices','vouchers','inventory_sync'], requiresApproval: false, applyUrl: 'https://erpnext.com' }),
      pending('DYNAMICS_365',    'ACCOUNTING', 'Microsoft Dynamics 365', 'Business Central / F&O',         { features: ['invoices','vouchers','inventory_sync'], applyUrl: 'https://dynamics.microsoft.com' }),
      pending('NETSUITE',        'ACCOUNTING', 'NetSuite',         'Oracle cloud ERP',                    { features: ['invoices','vouchers','inventory_sync'], applyUrl: 'https://www.netsuite.com' }),
      pending('ODOO',            'ACCOUNTING', 'Odoo',             'Open-source business apps & ERP',     { features: ['invoices','vouchers','inventory_sync'], requiresApproval: false, applyUrl: 'https://www.odoo.com' }),
      pending('BUSY',            'ACCOUNTING', 'Busy Accounting',  'Indian SMB accounting + GST',         { features: ['invoices','gst'], requiresApproval: false, applyUrl: 'https://www.busy.in' }),
      pending('MARG_ERP',        'ACCOUNTING', 'Marg ERP',         'Distribution & retail ERP',           { features: ['invoices','inventory_sync'], requiresApproval: false, applyUrl: 'https://margcompusoft.com' }),
      pending('LOGIC_ERP',       'ACCOUNTING', 'LOGIC ERP',        'Retail, manufacturing & distribution ERP', { features: ['invoices','inventory_sync','pos'], applyUrl: 'https://logicerp.com' }),

      // ── POS_SYSTEM (new category — real POS, not the manual placeholder) ──
      pending('SHOPIFY_POS',     'POS_SYSTEM', 'Shopify POS',      "Shopify's in-store point of sale",    { features: ['orders','inventory_sync'], requiresApproval: false, applyUrl: 'https://www.shopify.com/pos' }),
      pending('SQUARE_POS',      'POS_SYSTEM', 'Square POS',       "Square's all-in-one POS",             { features: ['orders','inventory_sync'], requiresApproval: false, applyUrl: 'https://squareup.com/pos' }),
      pending('LIGHTSPEED_POS',  'POS_SYSTEM', 'Lightspeed POS',   'Cloud POS for retail & restaurants',  { features: ['orders','inventory_sync'], requiresApproval: false, applyUrl: 'https://www.lightspeedhq.com' }),
      pending('LOYVERSE_POS',    'POS_SYSTEM', 'LoyVerse POS',     'Free POS for small business',         { features: ['orders','inventory_sync'], requiresApproval: false, applyUrl: 'https://loyverse.com' }),
      pending('GOFRUGAL',        'POS_SYSTEM', 'GoFrugal',         'Retail & distribution POS',           { features: ['orders','inventory_sync'], applyUrl: 'https://www.gofrugal.com' }),
      pending('POSIST',          'POS_SYSTEM', 'Posist (UrbanPiper)','Restaurant POS & ops',              { features: ['orders','inventory_sync'], applyUrl: 'https://www.posist.com' }),
      pending('PETPOOJA',        'POS_SYSTEM', 'Petpooja',         'F&B POS & restaurant management',     { features: ['orders','inventory_sync'], applyUrl: 'https://petpooja.com' }),
      pending('VYAPAR',          'POS_SYSTEM', 'Vyapar',           'GST billing & POS for SMBs',          { features: ['orders','invoices','gst'], requiresApproval: false, applyUrl: 'https://vyaparapp.in' }),
      pending('ZOHO_POS',        'POS_SYSTEM', 'Zoho Inventory POS','Zoho retail POS',                    { features: ['orders','inventory_sync'], requiresApproval: false, applyUrl: 'https://www.zoho.com/inventory' }),

      // ── PAYMENT (new category) ─────────────────────────────────
      pending('RAZORPAY',        'PAYMENT', 'Razorpay',            "India's leading payment gateway",     { features: ['payments','refunds','payouts'], requiresApproval: false, applyUrl: 'https://razorpay.com' }),
      pending('PAYU',            'PAYMENT', 'PayU',                'Global payment gateway',              { features: ['payments','refunds'], requiresApproval: false, applyUrl: 'https://payu.in' }),
      pending('CCAVENUE',        'PAYMENT', 'CCAvenue',            'Pioneer Indian payment gateway',      { features: ['payments','refunds'], requiresApproval: false, applyUrl: 'https://www.ccavenue.com' }),
      pending('CASHFREE',        'PAYMENT', 'Cashfree',            'Payments & payouts platform',         { features: ['payments','refunds','payouts'], requiresApproval: false, applyUrl: 'https://www.cashfree.com' }),
      pending('STRIPE',          'PAYMENT', 'Stripe',              'Global online payments',              { features: ['payments','refunds'], requiresApproval: false, applyUrl: 'https://stripe.com' }),
      pending('PAYPAL',          'PAYMENT', 'PayPal',              'Global digital payments',             { features: ['payments','refunds'], requiresApproval: false, applyUrl: 'https://www.paypal.com/business' }),
      pending('PAYTM_PG',        'PAYMENT', 'Paytm Payments',      'Paytm business payment gateway',      { features: ['payments','refunds'], requiresApproval: false, applyUrl: 'https://business.paytm.com' }),
      pending('PHONEPE_BUSINESS','PAYMENT', 'PhonePe Business',    'PhonePe payment gateway',             { features: ['payments','refunds'], requiresApproval: false, applyUrl: 'https://business.phonepe.com' }),
      pending('INSTAMOJO',       'PAYMENT', 'Instamojo',           'Payments & store builder for SMBs',   { features: ['payments','refunds'], requiresApproval: false, applyUrl: 'https://www.instamojo.com' }),

      // ── TAX (new category) ─────────────────────────────────────
      pending('CLEARTAX',        'TAX', 'ClearTax',                'GST returns & e-invoicing',           { features: ['gst','e_invoice','reconciliation'], requiresApproval: false, applyUrl: 'https://cleartax.in' }),
      pending('GSTZEN',          'TAX', 'GSTZen',                  'GST compliance & filing',             { features: ['gst','e_invoice'], requiresApproval: false, applyUrl: 'https://gstzen.in' }),
      pending('TAXCLOUD_IRP',    'TAX', 'TaxCloud (IRP)',          'Government e-invoicing portal',       { features: ['e_invoice'], requiresApproval: false, applyUrl: 'https://einvoice1.gst.gov.in' }),
      pending('AVALARA',         'TAX', 'Avalara',                 'Global tax compliance automation',    { features: ['gst','vat','tax_calc'], applyUrl: 'https://www.avalara.com' }),
      pending('ZOHO_GST',        'TAX', 'Zoho GST',                'GST returns by Zoho',                 { features: ['gst','e_invoice'], requiresApproval: false, applyUrl: 'https://www.zoho.com/in/books/gst' }),

      // ── CRM / Customer engagement (new category) ───────────────
      pending('HUBSPOT',         'CRM', 'HubSpot',                 'Marketing, sales & service hub',      { features: ['contacts','sync'], requiresApproval: false, applyUrl: 'https://www.hubspot.com' }),
      pending('SALESFORCE_CRM',  'CRM', 'Salesforce CRM',          'Enterprise CRM platform',             { features: ['contacts','sync'], applyUrl: 'https://www.salesforce.com' }),
      pending('ZOHO_CRM',        'CRM', 'Zoho CRM',                'CRM for SMBs',                        { features: ['contacts','sync'], requiresApproval: false, applyUrl: 'https://www.zoho.com/crm' }),
      pending('MAILCHIMP',       'CRM', 'Mailchimp',               'Email marketing & automation',        { features: ['email','sync'], requiresApproval: false, applyUrl: 'https://mailchimp.com' }),
      pending('KLAVIYO',         'CRM', 'Klaviyo',                 'E-commerce email & SMS marketing',    { features: ['email','sms','sync'], requiresApproval: false, applyUrl: 'https://www.klaviyo.com' }),
      pending('SENDINBLUE',      'CRM', 'Brevo (Sendinblue)',      'Email, SMS & marketing automation',   { features: ['email','sms','sync'], requiresApproval: false, applyUrl: 'https://www.brevo.com' }),
      pending('WEBENGAGE',       'CRM', 'WebEngage',               'Customer engagement platform',        { features: ['email','sms','push','sync'], applyUrl: 'https://webengage.com' }),
      pending('MOENGAGE',        'CRM', 'MoEngage',                'Customer engagement & analytics',     { features: ['email','sms','push','sync'], applyUrl: 'https://www.moengage.com' }),
      pending('CLEVERTAP',       'CRM', 'CleverTap',               'Mobile customer engagement',          { features: ['email','sms','push','sync'], applyUrl: 'https://clevertap.com' }),
      pending('FRESHDESK',       'CRM', 'Freshdesk',               'Customer support helpdesk',           { features: ['tickets','sync'], requiresApproval: false, applyUrl: 'https://www.freshworks.com/freshdesk' }),
      pending('ZENDESK',         'CRM', 'Zendesk',                 'Customer service & support',          { features: ['tickets','sync'], requiresApproval: false, applyUrl: 'https://www.zendesk.com' }),
      pending('GORGIAS',         'CRM', 'Gorgias',                 'E-commerce helpdesk',                 { features: ['tickets','sync'], requiresApproval: false, applyUrl: 'https://www.gorgias.com' }),

      // ── RETURNS / Reverse logistics (new category) ─────────────
      pending('RETURN_PRIME',    'RETURNS', 'Return Prime',         'Returns automation for D2C brands',  { features: ['returns','exchanges','refunds'], requiresApproval: false, applyUrl: 'https://www.returnprime.com' }),
      pending('WERETURN',        'RETURNS', 'WeReturn',             'Returns management platform',       { features: ['returns','refunds'], applyUrl: 'https://wereturn.in' }),
      pending('ANCHANTO_RETURNS','RETURNS', 'Anchanto Returns',     'Returns & reverse logistics',       { features: ['returns','refunds'], applyUrl: 'https://www.anchanto.com' }),
      pending('EASYVMS',         'RETURNS', 'EasyVMS',              'Returns fraud prevention',          { features: ['returns','fraud_check'], applyUrl: 'https://vms.easyecom.io' }),

      // ── FULFILLMENT / 3PL (new category) ───────────────────────
      pending('AMAZON_FBA',      'FULFILLMENT', 'Amazon FBA',       "Amazon's fulfillment network",      {
        features: ['fulfillment','tracking','inventory_sync'],
        applyUrl: 'https://sell.amazon.in/fulfillment-by-amazon',
        // Reuses platform Amazon SP-API app — same as the marketplace channels
        credentialsSchema: [
          { key: 'sellerId', label: 'Seller ID', type: 'text', required: false, help: 'Auto-filled if you use OAuth.' },
          { key: 'refreshToken', label: 'Refresh Token', type: 'password', required: false, help: 'Skip if using OAuth. Otherwise: Self Authorize from Develop Apps; begins with Atzr|.' },
        ],
      }),
      pending('FLIPKART_SMART_FULFILLMENT','FULFILLMENT','Flipkart Smart Fulfillment','Flipkart-managed warehousing & fulfillment', { features: ['fulfillment','tracking','inventory_sync'], applyUrl: 'https://seller.flipkart.com' }),
      pending('WAREIQ',          'FULFILLMENT', 'WareIQ',           'On-demand 3PL fulfillment network', { features: ['fulfillment','tracking','inventory_sync'], applyUrl: 'https://wareiq.com' }),
      pending('LOGINEXT',        'FULFILLMENT', 'LogiNext',         'Logistics & fulfillment automation',{ features: ['fulfillment','tracking'], applyUrl: 'https://www.loginextsolutions.com' }),
      pending('HOLISOL',         'FULFILLMENT', 'Holisol Logistics','3PL fulfillment & warehousing',     { features: ['fulfillment','tracking','inventory_sync'], applyUrl: 'https://www.holisollogistics.com' }),
    ];
  })(),
];

// Quick lookup by type
const CATALOG_MAP = Object.fromEntries(CATALOG.map(c => [c.type, c]));

function getCatalogEntry(type) {
  return CATALOG_MAP[type] || null;
}

function getCatalogByCategory(category) {
  return CATALOG.filter(c => !category || c.category === category);
}

module.exports = { CATALOG, CATALOG_MAP, getCatalogEntry, getCatalogByCategory };
