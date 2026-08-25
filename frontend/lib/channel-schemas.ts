// Per-channel credential schemas.
// Each tenant (seller) uses these field definitions to self-serve-connect
// their own channel. The backend stores everything encrypted (AES-256-GCM)
// via POST /api/v1/channels/:id/connect.

export type FieldKind = 'text' | 'password' | 'url' | 'select' | 'textarea';

export interface ChannelField {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  help?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  secret?: boolean; // hidden after save; masked in UI
}

export interface ChannelSchema {
  type: string;
  name: string;
  docsUrl?: string;
  description?: string;
  steps?: string[];
  fields: ChannelField[];
  // OAuth flow — tenant clicks "Authorize" instead of pasting credentials.
  // Set to a provider key when the platform owns the OAuth app.
  oauth?: 'amazon' | 'shopify' | 'flipkart' | 'meta' | 'lazada' | 'shopee' | 'mercadolibre' | 'allegro' | 'wish';
}

// Shared fallback fields for any Amazon SP-API channel — lets a tenant skip
// the OAuth round-trip by pasting a Self-Authorized refresh token from
// Seller Central → Develop Apps → "Authorize" / "Self Authorize". Works
// because backend/src/services/channels/ecom/amazon.js auto-pulls
// amazon.clientId + amazon.clientSecret from platform settings.
const AMAZON_MANUAL_FIELDS: ChannelField[] = [
  {
    key: 'sellerId',
    label: 'Seller ID (only for manual paste)',
    kind: 'text',
    help: 'Seller Central → Settings → Account Info. Skip this field if you\'re using the OAuth button — it\'s filled in automatically after authorization.',
  },
  {
    key: 'refreshToken',
    label: 'Refresh Token (only for manual paste)',
    kind: 'password',
    secret: true,
    help: 'Develop Apps → your app → click "Authorize" / "Self Authorize" to issue. Begins with "Atzr|...". Skip this field if you\'re using the OAuth button.',
  },
];

export const CHANNEL_SCHEMAS: Record<string, ChannelSchema> = {
  AMAZON_SMARTBIZ: {
    type: 'AMAZON_SMARTBIZ',
    name: 'Amazon Smart Biz',
    docsUrl: 'https://smartcommerce.amazon.in/smartbiz',
    description: 'Amazon India\'s D2C website builder, powered by Amazon SP-API + MCF.',
    oauth: 'amazon',
    steps: [
      'Click "Authorize with Amazon" below',
      'Log in to your Amazon Seller Central account when prompted',
      'Approve Kartriq\'s access to your inventory, orders and MCF',
      'You\'ll be redirected back — that\'s it',
    ],
    fields: [
      {
        key: 'region',
        label: 'Amazon Region',
        kind: 'select',
        required: true,
        options: [
          { value: 'IN', label: 'India (amazon.in)' },
          { value: 'US', label: 'North America' },
          { value: 'EU', label: 'Europe / UK' },
        ],
        help: 'Pick the marketplace where your Seller Central account is registered — it sets the SP-API endpoint.',
      },
    ],
  },

  AMAZON: {
    type: 'AMAZON',
    name: 'Amazon Marketplace',
    docsUrl: 'https://developer-docs.amazon.com/sp-api',
    description: 'Amazon SP-API for sellers on amazon.in / .com / .co.uk etc. Two ways to connect: (a) click "Authorize with Amazon" to do the standard OAuth round-trip, or (b) paste a Self-Authorized refresh token from Seller Central → Develop Apps → Authorize.',
    oauth: 'amazon',
    steps: [
      'Pick the marketplace region',
      'EITHER click "Authorize with Amazon" (OAuth — best for onboarding)',
      'OR paste a Self-Authorized refresh token from your developer app (fastest for testing your own seller account)',
    ],
    fields: [
      {
        key: 'region',
        label: 'Amazon Region',
        kind: 'select',
        required: true,
        options: [
          { value: 'IN', label: 'India (amazon.in)' },
          { value: 'US', label: 'United States (amazon.com)' },
          { value: 'CA', label: 'Canada (amazon.ca)' },
          { value: 'MX', label: 'Mexico (amazon.com.mx)' },
          { value: 'BR', label: 'Brazil (amazon.com.br)' },
          { value: 'UK', label: 'United Kingdom (amazon.co.uk)' },
          { value: 'DE', label: 'Germany (amazon.de)' },
          { value: 'FR', label: 'France (amazon.fr)' },
          { value: 'IT', label: 'Italy (amazon.it)' },
          { value: 'ES', label: 'Spain (amazon.es)' },
          { value: 'NL', label: 'Netherlands (amazon.nl)' },
          { value: 'SE', label: 'Sweden (amazon.se)' },
          { value: 'PL', label: 'Poland (amazon.pl)' },
          { value: 'TR', label: 'Turkey (amazon.com.tr)' },
          { value: 'AE', label: 'UAE (amazon.ae)' },
          { value: 'SA', label: 'Saudi Arabia (amazon.sa)' },
          { value: 'EG', label: 'Egypt (amazon.eg)' },
          { value: 'ZA', label: 'South Africa (amazon.co.za)' },
          { value: 'JP', label: 'Japan (amazon.co.jp)' },
          { value: 'AU', label: 'Australia (amazon.com.au)' },
          { value: 'SG', label: 'Singapore (amazon.sg)' },
        ],
        help: 'Pick the marketplace where your Seller Central account is registered — it sets the SP-API endpoint.',
      },
      {
        key: 'sellerId',
        label: 'Seller ID (only for manual paste)',
        kind: 'text',
        help: 'Seller Central → Settings → Account Info. Skip this field if you\'re using OAuth — it\'s filled in automatically.',
      },
      {
        key: 'refreshToken',
        label: 'Refresh Token (only for manual paste)',
        kind: 'password',
        secret: true,
        help: 'Develop Apps → your app → click "Authorize" / "Self Authorize" to generate. Begins with "Atzr|...". Skip this field if you\'re using the OAuth button.',
      },
      {
        key: 'sandbox',
        label: 'Use SP-API Sandbox',
        kind: 'select',
        options: [
          { value: 'false', label: 'No — production endpoint (default)' },
          { value: 'true',  label: 'Yes — sandbox endpoint (mock data, for Draft apps)' },
        ],
        help: 'Turn this on while your app is still in "Sandbox" status on the Amazon Developer Console. Production endpoints reject Draft apps with 403. Sandbox returns canned mock data so you can test the connection wiring.',
      },
    ],
  },

  FLIPKART: {
    type: 'FLIPKART',
    name: 'Flipkart Seller Hub',
    docsUrl: 'https://seller.flipkart.com/api-docs',
    description: 'Flipkart Marketplace API for inventory, listings and orders.',
    oauth: 'flipkart',
    steps: [
      'Click "Authorize with Flipkart" below',
      'Sign in to Flipkart Seller Hub',
      'Grant Kartriq access to your seller data',
      'You\'ll be redirected back automatically',
    ],
    fields: [],
  },

  MEESHO: {
    type: 'MEESHO',
    name: 'Meesho Supplier Panel',
    description: 'Meesho supplier-side API. Authenticated by a single API key in the meesho-api-key header.',
    docsUrl: 'https://supplier.meesho.com',
    steps: [
      'Sign in to Meesho Supplier Panel (https://supplier.meesho.com)',
      'Settings → Developer → Generate API Key',
      'Copy the key immediately — Meesho only shows it once',
      'Paste below and click Test & Save',
    ],
    fields: [
      { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true, help: 'Meesho Supplier Panel → Settings → Developer → Generate API Key. Shown only once at creation time.' },
    ],
  },

  MYNTRA: {
    type: 'MYNTRA',
    name: 'Myntra Partner Portal',
    fields: [
      { key: 'sellerId', label: 'Seller ID', kind: 'text',     required: true, help: 'Myntra Partner Portal → Profile → Account Details. Listed as Vendor/Seller Code.' },
      { key: 'apiKey',   label: 'API Key',   kind: 'password', required: true, secret: true, help: 'Myntra Partner Portal → Settings → API Access → Generate Key. Request access if not visible.' },
    ],
  },

  NYKAA: {
    type: 'NYKAA',
    name: 'Nykaa Partner API',
    fields: [
      { key: 'partnerId', label: 'Partner ID', kind: 'text',     required: true, help: 'Nykaa Seller Portal → My Account → Brand Profile. Shown as Partner/Brand Code.' },
      { key: 'apiKey',    label: 'API Key',    kind: 'password', required: true, secret: true, help: 'Email partner-tech@nykaa.com to request API access; key arrives via your account manager.' },
    ],
  },

  AJIO: {
    type: 'AJIO',
    name: 'Ajio / Reliance',
    fields: [
      { key: 'sellerId', label: 'Seller ID', kind: 'text',     required: true, help: 'Ajio Business Portal → My Profile → Seller Information. Alphanumeric vendor code.' },
      { key: 'apiKey',   label: 'API Key',   kind: 'password', required: true, secret: true, help: 'Ajio Business Portal → Integrations → API Console → Generate. Request via category manager if locked.' },
    ],
  },

  TATA_CLIQ: {
    type: 'TATA_CLIQ',
    name: 'Tata CLiQ',
    fields: [
      { key: 'vendorId', label: 'Vendor ID', kind: 'text',     required: true, help: 'Tata CLiQ Marketplace → Account → Company Details. Begins with vendor code prefix.' },
      { key: 'apiKey',   label: 'API Key',   kind: 'password', required: true, secret: true, help: 'Tata CLiQ Marketplace → Settings → API Integration → Generate Key.' },
    ],
  },

  SNAPDEAL: {
    type: 'SNAPDEAL',
    name: 'Snapdeal Seller Zone',
    docsUrl: 'https://sellerzone.snapdeal.com',
    description: 'Snapdeal seller API for inventory, orders and listings.',
    steps: [
      'Log in to Seller Zone → Account → API Integration',
      'Generate Seller ID + API Key pair',
    ],
    fields: [
      { key: 'sellerId', label: 'Seller ID', kind: 'text',     required: true, help: 'Snapdeal Seller Zone → Account → Profile. Listed under Seller Code.' },
      { key: 'apiKey',   label: 'API Key',   kind: 'password', required: true, secret: true, help: 'Seller Zone → Account → API Integration → Generate API Key. Save before closing.' },
    ],
  },

  GLOWROAD: {
    type: 'GLOWROAD',
    name: 'GlowRoad',
    description: 'GlowRoad reseller marketplace.',
    fields: [
      { key: 'sellerId', label: 'Seller ID', kind: 'text',     required: true, help: 'GlowRoad Supplier Panel → Profile → Business Info. Numeric supplier ID.' },
      { key: 'apiKey',   label: 'API Key',   kind: 'password', required: true, secret: true, help: 'GlowRoad Supplier Panel → Settings → API Access → Generate Key.' },
    ],
  },

  JIOMART: {
    type: 'JIOMART',
    name: 'JioMart Seller',
    docsUrl: 'https://seller.jiomart.com',
    description: 'Reliance JioMart seller panel API.',
    fields: [
      { key: 'sellerId', label: 'Seller ID', kind: 'text',     required: true, help: 'JioMart Seller Panel → My Account → Store Details. Listed as Seller/Vendor Code.' },
      { key: 'apiKey',   label: 'API Key',   kind: 'password', required: true, secret: true, help: 'JioMart Seller Panel → Settings → API → Generate Token. Production keys only.' },
    ],
  },

  PAYTM_MALL: {
    type: 'PAYTM_MALL',
    name: 'Paytm Mall',
    docsUrl: 'https://seller.paytm.com',
    description: 'Paytm Mall seller API.',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', kind: 'text',     required: true, help: 'Paytm Seller Panel → Profile → Business Details. Alphanumeric MID issued at onboarding.' },
      { key: 'apiKey',     label: 'API Key',     kind: 'password', required: true, secret: true, help: 'Paytm Seller Panel → Settings → API Keys → Generate. Use Production key for live orders.' },
    ],
  },

  LIMEROAD: {
    type: 'LIMEROAD',
    name: 'LimeRoad',
    description: 'LimeRoad seller API.',
    fields: [
      { key: 'sellerId', label: 'Seller ID', kind: 'text',     required: true, help: 'LimeRoad Vendor Panel → Profile → Brand Information. Numeric vendor ID.' },
      { key: 'apiKey',   label: 'API Key',   kind: 'password', required: true, secret: true, help: 'LimeRoad Vendor Panel → Settings → API → Generate Key. Email vendor support if option missing.' },
    ],
  },

  EBAY: {
    type: 'EBAY',
    name: 'eBay',
    docsUrl: 'https://developer.ebay.com/api-docs/static/oauth-tokens.html',
    description: 'eBay Trading / Sell APIs. Create a developer app, then generate a User Access Token.',
    steps: [
      'Register at https://developer.ebay.com',
      'Create an application → note App ID, Cert ID, Dev ID',
      'Go to User Tokens tab → Get User Token (production or sandbox)',
      'Paste all four values below',
    ],
    fields: [
      { key: 'appId',      label: 'App ID (Client ID)',     kind: 'text',     required: true, help: 'developer.ebay.com → My Account → Application Keysets → App ID column.' },
      { key: 'certId',     label: 'Cert ID (Client Secret)',kind: 'password', required: true, secret: true, help: 'developer.ebay.com → My Account → Application Keysets → Cert ID. Treat as password.' },
      { key: 'devId',      label: 'Dev ID',                 kind: 'text',     required: true, help: 'developer.ebay.com → My Account → Application Keysets → Dev ID. Same across all your apps.' },
      { key: 'userToken',  label: 'User Access Token',      kind: 'password', required: true, secret: true, help: 'developer.ebay.com → User Tokens → Get a User Token. Pick matching environment, sign in with seller account.' },
      {
        key: 'environment',
        label: 'Environment',
        kind: 'select',
        required: true,
        options: [
          { value: 'production', label: 'Production' },
          { value: 'sandbox',    label: 'Sandbox' },
        ],
        help: 'Production for live orders. Sandbox uses developer.ebay.com test data — no real listings touched.',
      },
    ],
  },

  ETSY: {
    type: 'ETSY',
    name: 'Etsy',
    docsUrl: 'https://www.etsy.com/developers/documentation',
    description: 'Etsy Open API v3 — register a developer app and authorize a shop.',
    steps: [
      'Register an app at https://www.etsy.com/developers/register',
      'Copy API Key (keystring) and Shared Secret',
      'Run the OAuth 2.0 flow to get an access token for your shop',
    ],
    fields: [
      { key: 'apiKey',       label: 'API Key (keystring)', kind: 'text',     required: true, help: 'etsy.com/developers/your-apps → select your app → Keystring. 24-char alphanumeric.' },
      { key: 'sharedSecret', label: 'Shared Secret',       kind: 'password', required: true, secret: true, help: 'etsy.com/developers/your-apps → your app → Shared Secret. Shown next to the keystring.' },
      { key: 'accessToken',  label: 'Access Token',        kind: 'password', required: true, secret: true, help: 'Run the OAuth 2.0 PKCE flow described in Etsy Open API v3 docs to mint a per-shop token.' },
      { key: 'shopId',       label: 'Shop ID',             kind: 'text',     required: true, help: 'etsy.com/your/shops/me/dashboard → URL contains /shop/<ID>. Numeric.' },
    ],
  },

  SHOPIFY: {
    type: 'SHOPIFY',
    name: 'Shopify',
    docsUrl: 'https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant',
    description: 'OAuth into your Shopify store. Kartriq has a public Partner app — every store installs it.',
    oauth: 'shopify',
    steps: [
      'Enter your store domain (e.g. mystore.myshopify.com)',
      'Click "Authorize with Shopify"',
      'Approve the requested scopes in Shopify admin',
      'You\'ll be redirected back automatically',
    ],
    fields: [
      { key: 'shop', label: 'Shop domain', kind: 'text', required: true, placeholder: 'mystore.myshopify.com', help: 'The myshopify.com subdomain — no https://, no trailing slash.' },
    ],
  },

  WOOCOMMERCE: {
    type: 'WOOCOMMERCE',
    name: 'WooCommerce',
    docsUrl: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
    description: 'WooCommerce REST API — generate a pair of read/write keys.',
    steps: [
      'WP admin → WooCommerce → Settings → Advanced → REST API',
      'Add key → Permissions: Read/Write → Generate',
    ],
    fields: [
      { key: 'siteUrl',        label: 'Site URL',        kind: 'url',      required: true, placeholder: 'https://yourstore.com', help: 'Your WordPress site root with https:// — no /wp-admin or /wp-json suffix.' },
      { key: 'consumerKey',    label: 'Consumer Key',    kind: 'password', required: true, secret: true, help: 'WP admin → WooCommerce → Settings → Advanced → REST API. Starts with ck_.' },
      { key: 'consumerSecret', label: 'Consumer Secret', kind: 'password', required: true, secret: true, help: 'Shown ONCE on the same screen after generating the key. Starts with cs_. Save it now.' },
    ],
  },

  MAGENTO: {
    type: 'MAGENTO',
    name: 'Magento / Adobe Commerce',
    fields: [
      { key: 'storeUrl',    label: 'Store URL',    kind: 'url',      required: true, help: 'Storefront base URL with https://. The /rest/V1 path is appended automatically.' },
      { key: 'accessToken', label: 'Access Token', kind: 'password', required: true, secret: true, help: 'Magento admin → System → Extensions → Integrations → Add → Activate. Copy Access Token shown.' },
    ],
  },

  BIGCOMMERCE: {
    type: 'BIGCOMMERCE',
    name: 'BigCommerce',
    fields: [
      { key: 'storeHash',   label: 'Store Hash',   kind: 'text',     required: true, placeholder: 'abc123def', help: 'BigCommerce admin URL: store-<HASH>.mybigcommerce.com. Copy the part after store-.' },
      { key: 'accessToken', label: 'Access Token', kind: 'password', required: true, secret: true, help: 'BigCommerce admin → Settings → API Accounts → Create V2/V3 API token. Shown once at creation.' },
    ],
  },

  OPENCART: {
    type: 'OPENCART',
    name: 'OpenCart',
    docsUrl: 'https://docs.opencart.com/en-gb/administration/system/api/',
    description: 'OpenCart REST API — create a dedicated API user in the admin.',
    steps: [
      'Admin → System → Users → API → Add New API',
      'Generate an API key and whitelist your server IPs',
    ],
    fields: [
      { key: 'storeUrl', label: 'Store URL', kind: 'url',      required: true, placeholder: 'https://yourstore.com', help: 'OpenCart storefront base URL with https://. The /api endpoint is appended automatically.' },
      { key: 'username', label: 'API Username', kind: 'text',  required: true, help: 'OpenCart admin → System → Users → API → username you set when creating the API user.' },
      { key: 'apiKey',   label: 'API Key',   kind: 'password', required: true, secret: true, help: 'OpenCart admin → System → Users → API → click your API user → API Key field.' },
    ],
  },

  BLINKIT: {
    type: 'BLINKIT',
    name: 'Blinkit (Grofers)',
    fields: [
      { key: 'merchantId', label: 'Merchant ID', kind: 'text',     required: true, help: 'Blinkit Seller Central → Profile → Store Details. Numeric merchant code from your KAM.' },
      { key: 'apiKey',     label: 'API Key',     kind: 'password', required: true, secret: true, help: 'Issued by your Blinkit Key Account Manager — request via blinkitseller@blinkit.com.' },
    ],
  },

  SWIGGY_INSTAMART: {
    type: 'SWIGGY_INSTAMART',
    name: 'Swiggy Instamart',
    fields: [
      { key: 'partnerId', label: 'Partner ID', kind: 'text',     required: true, help: 'Swiggy Partner Portal → Profile → Brand. Numeric partner ID from onboarding email.' },
      { key: 'apiKey',    label: 'API Key',    kind: 'password', required: true, secret: true, help: 'Issued by Swiggy Instamart KAM — request via instamart.partners@swiggy.in.' },
    ],
  },

  BB_NOW: {
    type: 'BB_NOW',
    name: 'BB Now (BigBasket)',
    fields: [
      { key: 'vendorId', label: 'Vendor ID', kind: 'text',     required: true, help: 'BigBasket Vendor Portal → Profile → Company. Listed as Vendor Code (alphanumeric).' },
      { key: 'apiKey',   label: 'API Key',   kind: 'password', required: true, secret: true, help: 'Issued by your BigBasket account manager — request via vendor.connect@bigbasket.com.' },
    ],
  },

  SHIPROCKET: {
    type: 'SHIPROCKET',
    name: 'Shiprocket',
    docsUrl: 'https://apidocs.shiprocket.in',
    description: 'Shiprocket shipping aggregator for pickups, rates, AWBs and tracking.',
    fields: [
      { key: 'email',    label: 'Shiprocket Email',    kind: 'text',     required: true, help: 'Email you log into app.shiprocket.in with. Must have API access enabled in Settings → API.' },
      { key: 'password', label: 'Shiprocket Password', kind: 'password', required: true, secret: true, help: 'Same password used at app.shiprocket.in login. We exchange it for a 24-hour token.' },
    ],
  },

  FSHIP: {
    type: 'FSHIP',
    name: 'Fship',
    description: 'Fship shipping aggregator.',
    fields: [
      { key: 'email',    label: 'Email',    kind: 'text',     required: true, help: 'Email used at app.fship.in login — same account that owns your pickup addresses.' },
      { key: 'password', label: 'Password', kind: 'password', required: true, secret: true, help: 'Your Fship dashboard password. Used to fetch the API auth token automatically.' },
    ],
  },

  DELHIVERY: {
    type: 'DELHIVERY',
    name: 'Delhivery',
    docsUrl: 'https://track.delhivery.com/api-doc/',
    fields: [
      { key: 'token', label: 'API Token', kind: 'password', required: true, secret: true, help: 'Delhivery client portal → Settings → API → Generate Token. Use Production token for live shipments.' },
      {
        key: 'mode',
        label: 'Mode',
        kind: 'select',
        required: true,
        options: [
          { value: 'test',       label: 'Test' },
          { value: 'production', label: 'Production' },
        ],
        help: 'Production hits live Delhivery booking. Test points to staging.delhivery.com — no real pickups.',
      },
    ],
  },

  BLUEDART: {
    type: 'BLUEDART',
    name: 'BlueDart',
    fields: [
      { key: 'customerCode', label: 'Customer Code', kind: 'text',     required: true, help: 'BlueDart issued 6-digit customer/account code shown on your contract or invoice.' },
      { key: 'apiKey',       label: 'API Key',       kind: 'password', required: true, secret: true, help: 'BlueDart API portal → Profile → API Keys. Request via your BlueDart RM if not visible.' },
      { key: 'licenseKey',   label: 'License Key',   kind: 'password', required: true, secret: true, help: 'BlueDart API portal → Profile → License Key. Different from API Key — both are required.' },
    ],
  },

  DTDC: {
    type: 'DTDC',
    name: 'DTDC',
    fields: [
      { key: 'customerCode', label: 'Customer Code', kind: 'text',     required: true, help: 'DTDC customer/account code from your contract — shown on tracker.dtdc.com → My Profile.' },
      { key: 'apiKey',       label: 'API Key',       kind: 'password', required: true, secret: true, help: 'tracker.dtdc.com → API Integration → Generate Key. Email apisupport@dtdc.com if missing.' },
    ],
  },

  XPRESSBEES: {
    type: 'XPRESSBEES',
    name: 'Xpressbees',
    fields: [
      { key: 'email',    label: 'Email',    kind: 'text',     required: true, help: 'Email used at shipment.xpressbees.com login. Must be the merchant account, not subuser.' },
      { key: 'password', label: 'Password', kind: 'password', required: true, secret: true, help: 'Your Xpressbees dashboard password — exchanged server-side for the JWT auth token.' },
    ],
  },

  ECOMEXPRESS: {
    type: 'ECOMEXPRESS',
    name: 'EcomExpress',
    fields: [
      { key: 'username', label: 'Username', kind: 'text',     required: true, help: 'API username issued by EcomExpress onboarding team — different from dashboard login.' },
      { key: 'password', label: 'Password', kind: 'password', required: true, secret: true, help: 'API password issued alongside the username. Email it.support@ecomexpress.in to reset.' },
    ],
  },

  SHADOWFAX: {
    type: 'SHADOWFAX',
    name: 'Shadowfax',
    fields: [
      { key: 'token', label: 'API Token', kind: 'password', required: true, secret: true, help: 'Shadowfax client dashboard → Settings → API Token. Request via merchant.support@shadowfax.in.' },
    ],
  },

  NIMBUSPOST: {
    type: 'NIMBUSPOST',
    name: 'NimbusPost',
    fields: [
      { key: 'email',    label: 'Email',    kind: 'text',     required: true, help: 'Email used at app.nimbuspost.com login — primary account, not subuser.' },
      { key: 'password', label: 'Password', kind: 'password', required: true, secret: true, help: 'Your NimbusPost dashboard password. Server exchanges it for the bearer token.' },
    ],
  },

  CLICKPOST: {
    type: 'CLICKPOST',
    name: 'ClickPost',
    fields: [
      { key: 'username', label: 'Username', kind: 'text',     required: true, help: 'ClickPost merchant dashboard → Settings → API → username field (your account email or org slug).' },
      { key: 'apiKey',   label: 'API Key',  kind: 'password', required: true, secret: true, help: 'ClickPost merchant dashboard → Settings → API → Generate Key.' },
    ],
  },

  FEDEX: {
    type: 'FEDEX',
    name: 'FedEx',
    docsUrl: 'https://developer.fedex.com',
    description: 'FedEx Web Services — OAuth 2.0 client credentials for shipping APIs.',
    steps: [
      'Register at https://developer.fedex.com',
      'Create a Production project → note API Key and Secret Key',
      'Paste your 9-digit FedEx Account Number',
    ],
    fields: [
      { key: 'accountNumber', label: 'Account Number', kind: 'text',     required: true, help: 'Your 9-digit FedEx shipping account number — printed on FedEx invoices and contracts.' },
      { key: 'apiKey',        label: 'API Key',        kind: 'password', required: true, secret: true, help: 'developer.fedex.com → Projects → your project → API Key. Treat as client_id.' },
      { key: 'apiSecret',     label: 'Secret Key',     kind: 'password', required: true, secret: true, help: 'developer.fedex.com → Projects → your project → Secret Key. Shown once at creation.' },
      {
        key: 'environment',
        label: 'Environment',
        kind: 'select',
        required: true,
        options: [
          { value: 'production', label: 'Production' },
          { value: 'sandbox',    label: 'Sandbox' },
        ],
        help: 'Production hits live FedEx API. Sandbox uses apis-sandbox.fedex.com — test labels only, no pickup booked.',
      },
    ],
  },

  DHL: {
    type: 'DHL',
    name: 'DHL Express',
    docsUrl: 'https://developer.dhl.com',
    description: 'DHL MyDHL API for rates, labels and tracking.',
    fields: [
      { key: 'accountNumber', label: 'DHL Account Number', kind: 'text',     required: true, help: 'Your 9-digit DHL Express account number — printed on DHL contract / waybill stationery.' },
      { key: 'apiKey',        label: 'API Key',            kind: 'password', required: true, secret: true, help: 'developer.dhl.com → My Apps → your app → API Key (client_id).' },
      { key: 'apiSecret',     label: 'API Secret',         kind: 'password', required: true, secret: true, help: 'developer.dhl.com → My Apps → your app → API Secret. Shown once on app creation.' },
      {
        key: 'environment',
        label: 'Environment',
        kind: 'select',
        required: true,
        options: [
          { value: 'production', label: 'Production' },
          { value: 'sandbox',    label: 'Sandbox' },
        ],
        help: 'Production hits express.api.dhl.com live. Sandbox uses express.api-test.dhl.com — no real pickups booked.',
      },
    ],
  },

  UPS: {
    type: 'UPS',
    name: 'UPS',
    docsUrl: 'https://developer.ups.com',
    description: 'UPS Developer Kit — OAuth 2.0 client credentials.',
    steps: [
      'Register at https://developer.ups.com',
      'Create an app → request production access',
      'Copy Client ID + Client Secret',
    ],
    fields: [
      { key: 'accountNumber', label: 'UPS Account Number', kind: 'text',     required: true, help: 'Your 6-character UPS shipper number — shown on ups.com → Profile → Account Summary.' },
      { key: 'clientId',      label: 'Client ID',          kind: 'text',     required: true, help: 'developer.ups.com → My Apps → your app → Client ID.' },
      { key: 'clientSecret',  label: 'Client Secret',      kind: 'password', required: true, secret: true, help: 'developer.ups.com → My Apps → your app → Client Secret. Shown once on app creation.' },
      {
        key: 'environment',
        label: 'Environment',
        kind: 'select',
        required: true,
        options: [
          { value: 'production', label: 'Production' },
          { value: 'sandbox',    label: 'Sandbox' },
        ],
        help: 'Production hits onlinetools.ups.com live. Sandbox uses wwwcie.ups.com — test labels only, no pickup booked.',
      },
    ],
  },

  ITHINK: {
    type: 'ITHINK',
    name: 'iThink Logistics',
    description: 'iThink Logistics shipping aggregator.',
    fields: [
      { key: 'apiKey',   label: 'API Key',  kind: 'password', required: true, secret: true, help: 'iThink Logistics dashboard → Settings → API → Generate Key. 32-char hex.' },
      { key: 'clientId', label: 'Client ID',kind: 'text',     required: false, help: 'Optional — required by some iThink endpoints.' },
    ],
  },

  PICKRR: {
    type: 'PICKRR',
    name: 'Pickrr',
    description: 'Pickrr shipping aggregator.',
    fields: [
      { key: 'authToken', label: 'Auth Token', kind: 'password', required: true, secret: true, help: 'Pickrr dashboard → Settings → API → Auth Token. Email tech@pickrr.com if option missing.' },
    ],
  },

  SHIPWAY: {
    type: 'SHIPWAY',
    name: 'Shipway',
    docsUrl: 'https://shipway.com',
    description: 'Shipway post-ship tracking and returns platform.',
    fields: [
      { key: 'username',  label: 'Username',    kind: 'text',     required: true, help: 'Email used at app.shipway.com login — primary merchant account.' },
      { key: 'licenseKey',label: 'License Key', kind: 'password', required: true, secret: true, help: 'Shipway dashboard → Settings → API → License Key. 32-char alphanumeric.' },
    ],
  },

  INSTAGRAM: {
    type: 'INSTAGRAM',
    name: 'Instagram Shopping',
    docsUrl: 'https://developers.facebook.com/docs/instagram-platform',
    description: 'Connect your Instagram Business account via the Meta public app.',
    oauth: 'meta',
    steps: [
      'Click "Authorize with Meta" below',
      'Sign in with Facebook and approve the scopes',
      'You\'ll be redirected back. After connecting, pick the Instagram Business account.',
    ],
    fields: [],
  },

  FACEBOOK: {
    type: 'FACEBOOK',
    name: 'Facebook Shop',
    docsUrl: 'https://developers.facebook.com/docs/commerce-platform',
    description: 'Connect your Facebook Page + Commerce catalog via the Meta public app.',
    oauth: 'meta',
    fields: [],
  },

  WHATSAPP_BUSINESS: {
    type: 'WHATSAPP_BUSINESS',
    name: 'WhatsApp Business',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp',
    description: 'Connect your WhatsApp Business phone number via the Meta public app.',
    oauth: 'meta',
    fields: [],
  },

  CUSTOM_WEBHOOK: {
    type: 'CUSTOM_WEBHOOK',
    name: 'Custom Webhook',
    description: 'Generic webhook receiver. Use when your own system pushes orders to Kartriq.',
    steps: [
      'Pick a strong HMAC secret and set it below',
      'Configure your source system to POST to /api/v1/webhooks/channels/:id',
      'Sign the raw body with HMAC-SHA256 using your secret and send it in the x-kartriq-signature header',
    ],
    fields: [
      { key: 'webhookSecret', label: 'Webhook HMAC Secret', kind: 'password', required: true, secret: true, help: 'Pick any 32+ char random string. Use it in your sender to sign requests with HMAC-SHA256.' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ECOM — international expansion
  // ─────────────────────────────────────────────────────────────────────────
  WALMART: {
    type: 'WALMART', name: 'Walmart Marketplace', docsUrl: 'https://developer.walmart.com/api/us/mp/orders',
    description: 'Connect your Walmart Marketplace seller account. The platform-wide Solution Provider app handles OAuth — you only need your Partner ID.',
    steps: [
      'Sign in to Walmart Seller Center',
      'Open Settings → Partner Profile and copy your Partner ID',
      'Pick the marketplace region your account is registered in',
      'Paste below and connect',
    ],
    fields: [
      { key: 'partnerId', label: 'Walmart Partner ID', kind: 'text', required: true, placeholder: '10000xxxx', help: 'Seller Center → Settings → Partner Profile.' },
      { key: 'region', label: 'Region', kind: 'select', required: true, options: [
        { value: 'US', label: 'United States (walmart.com)' },
        { value: 'CA', label: 'Canada (walmart.ca)' },
        { value: 'MX', label: 'Mexico (walmart.com.mx)' },
      ] },
    ],
  },
  AMAZON_US: {
    type: 'AMAZON_US',
    name: 'Amazon US',
    docsUrl: 'https://sellercentral.amazon.com',
    description: 'Connect your Amazon.com (US) seller account via the platform SP-API app.',
    oauth: 'amazon',
    steps: [
      'Click "Authorize with Amazon" below',
      'Log in to your Amazon.com Seller Central account when prompted',
      'Approve Kartriq\'s access to your inventory and orders',
      'You\'ll be redirected back automatically',
    ],
    fields: [...AMAZON_MANUAL_FIELDS],
  },
  AMAZON_UK: {
    type: 'AMAZON_UK', name: 'Amazon UK', docsUrl: 'https://sellercentral.amazon.co.uk',
    description: 'Connect your Amazon.co.uk seller account via the platform SP-API app.',
    oauth: 'amazon',
    steps: [
      'Click "Authorize with Amazon" below',
      'Log in to your Amazon UK Seller Central account when prompted',
      'Approve Kartriq\'s access to your inventory and orders',
      'You\'ll be redirected back automatically',
    ],
    fields: [...AMAZON_MANUAL_FIELDS],
  },
  AMAZON_UAE: {
    type: 'AMAZON_UAE', name: 'Amazon UAE', docsUrl: 'https://sellercentral.amazon.ae',
    description: 'Connect your Amazon.ae seller account via the platform SP-API app.',
    oauth: 'amazon',
    steps: [
      'Click "Authorize with Amazon" below',
      'Log in to your Amazon UAE Seller Central account when prompted',
      'Approve Kartriq\'s access to your inventory and orders',
      'You\'ll be redirected back automatically',
    ],
    fields: [...AMAZON_MANUAL_FIELDS],
  },
  AMAZON_SA: {
    type: 'AMAZON_SA', name: 'Amazon Saudi Arabia', docsUrl: 'https://sellercentral.amazon.sa',
    description: 'Connect your Amazon.sa seller account via the platform SP-API app.',
    oauth: 'amazon',
    steps: [
      'Click "Authorize with Amazon" below',
      'Log in to your Amazon Saudi Arabia Seller Central account when prompted',
      'Approve Kartriq\'s access to your inventory and orders',
      'You\'ll be redirected back automatically',
    ],
    fields: [...AMAZON_MANUAL_FIELDS],
  },
  AMAZON_SG: {
    type: 'AMAZON_SG', name: 'Amazon Singapore', docsUrl: 'https://sellercentral.amazon.sg',
    description: 'Connect your Amazon.sg seller account via the platform SP-API app.',
    oauth: 'amazon',
    steps: [
      'Click "Authorize with Amazon" below',
      'Log in to your Amazon Singapore Seller Central account when prompted',
      'Approve Kartriq\'s access to your inventory and orders',
      'You\'ll be redirected back automatically',
    ],
    fields: [...AMAZON_MANUAL_FIELDS],
  },
  AMAZON_AU: {
    type: 'AMAZON_AU', name: 'Amazon Australia', docsUrl: 'https://sellercentral.amazon.com.au',
    description: 'Connect your Amazon.com.au seller account via the platform SP-API app.',
    oauth: 'amazon',
    steps: [
      'Click "Authorize with Amazon" below',
      'Log in to your Amazon Australia Seller Central account when prompted',
      'Approve Kartriq\'s access to your inventory and orders',
      'You\'ll be redirected back automatically',
    ],
    fields: [...AMAZON_MANUAL_FIELDS],
  },
  AMAZON_DE: {
    type: 'AMAZON_DE', name: 'Amazon Germany', docsUrl: 'https://sellercentral.amazon.de',
    description: 'Connect your Amazon.de seller account via the platform SP-API app.',
    oauth: 'amazon',
    steps: [
      'Click "Authorize with Amazon" below',
      'Log in to your Amazon Germany Seller Central account when prompted',
      'Approve Kartriq\'s access to your inventory and orders',
      'You\'ll be redirected back automatically',
    ],
    fields: [...AMAZON_MANUAL_FIELDS],
  },
  LAZADA: {
    type: 'LAZADA',
    name: 'Lazada',
    docsUrl: 'https://open.lazada.com/apps/doc/api',
    description: 'Connect your Lazada seller account for any of the SEA marketplaces (SG, TH, PH, MY, VN, ID).',
    oauth: 'lazada',
    steps: [
      'Pick the Lazada country your seller account is registered in',
      'Click "Authorize with Lazada" below',
      'Log in to Lazada Seller Center when prompted',
      'You\'ll be redirected back automatically',
    ],
    fields: [
      { key: 'region', label: 'Country', kind: 'select', required: true, options: [
        { value: 'SG', label: 'Singapore' },
        { value: 'TH', label: 'Thailand' },
        { value: 'PH', label: 'Philippines' },
        { value: 'MY', label: 'Malaysia' },
        { value: 'VN', label: 'Vietnam' },
        { value: 'ID', label: 'Indonesia' },
      ] },
    ],
  },
  SHOPEE: {
    type: 'SHOPEE',
    name: 'Shopee',
    docsUrl: 'https://open.shopee.com/documents?module=63&type=2&id=51',
    description: 'Connect your Shopee shop in any of the SEA / Taiwan / LATAM markets.',
    oauth: 'shopee',
    steps: [
      'Pick the country your Shopee shop is registered in',
      'Click "Authorize with Shopee" below',
      'Log in to Shopee Seller Center and pick the shop to connect',
      'You\'ll be redirected back automatically',
    ],
    fields: [
      { key: 'region', label: 'Country', kind: 'select', required: true, options: [
        { value: 'SG', label: 'Singapore' },
        { value: 'MY', label: 'Malaysia' },
        { value: 'TH', label: 'Thailand' },
        { value: 'ID', label: 'Indonesia' },
        { value: 'VN', label: 'Vietnam' },
        { value: 'PH', label: 'Philippines' },
        { value: 'TW', label: 'Taiwan' },
        { value: 'BR', label: 'Brazil' },
        { value: 'MX', label: 'Mexico' },
        { value: 'CO', label: 'Colombia' },
        { value: 'CL', label: 'Chile' },
        { value: 'PL', label: 'Poland' },
      ] },
    ],
  },
  NOON: {
    type: 'NOON',
    name: 'Noon',
    docsUrl: 'https://docs.noon.partners/',
    description: 'Connect your Noon seller account (UAE, KSA, or Egypt). Each merchant uses their own API key — no platform OAuth.',
    steps: [
      'Sign in to Noon Partners (https://partners.noon.com)',
      'Open Settings → API and generate an API key',
      'Copy the partner code from your account profile',
      'Pick the country your seller account is registered in',
    ],
    fields: [
      { key: 'apiKey',      label: 'API Key',      kind: 'password', required: true, secret: true, help: 'Noon Partners → Settings → API.' },
      { key: 'partnerCode', label: 'Partner Code', kind: 'text',     required: true, help: 'Noon Partners → Account.' },
      { key: 'region',      label: 'Country',      kind: 'select',   required: true, options: [
        { value: 'AE', label: 'United Arab Emirates' },
        { value: 'SA', label: 'Saudi Arabia' },
        { value: 'EG', label: 'Egypt' },
      ] },
    ],
  },
  MERCADO_LIBRE: {
    type: 'MERCADO_LIBRE',
    name: 'Mercado Libre',
    docsUrl: 'https://developers.mercadolibre.com.ar/en_us/orders-management',
    description: 'Connect your Mercado Libre seller account in any of the LATAM markets.',
    oauth: 'mercadolibre',
    steps: [
      'Pick the country your seller account is registered in',
      'Click "Authorize with Mercado Libre" below',
      'Log in to Mercado Libre when prompted',
      'You\'ll be redirected back automatically',
    ],
    fields: [
      { key: 'region', label: 'Country', kind: 'select', required: true, options: [
        { value: 'AR', label: 'Argentina' },
        { value: 'BR', label: 'Brazil' },
        { value: 'MX', label: 'Mexico' },
        { value: 'CL', label: 'Chile' },
        { value: 'CO', label: 'Colombia' },
        { value: 'UY', label: 'Uruguay' },
        { value: 'PE', label: 'Peru' },
        { value: 'VE', label: 'Venezuela' },
      ] },
    ],
  },
  ALLEGRO: {
    type: 'ALLEGRO',
    name: 'Allegro',
    docsUrl: 'https://developer.allegro.pl/',
    description: "Connect your Allegro seller account (Poland's leading marketplace).",
    oauth: 'allegro',
    steps: [
      'Click "Authorize with Allegro" below',
      'Sign in to your Allegro account when prompted',
      'Approve Kartriq\'s access to orders + inventory',
      'You\'ll be redirected back automatically',
    ],
    fields: [
      { key: 'sandbox', label: 'Use Allegro Sandbox', kind: 'select', required: false, options: [
        { value: 'false', label: 'Production (allegro.pl)' },
        { value: 'true',  label: 'Sandbox (allegro.pl.allegrosandbox.pl)' },
      ], help: 'Pick sandbox while integrating; switch to production once smoke-tested.' },
    ],
  },
  FRUUGO: {
    type: 'FRUUGO',
    name: 'Fruugo',
    docsUrl: 'https://faq.fruugo.com/hc/en-gb/categories/360001212580-API',
    description: 'Connect your Fruugo merchant account (global cross-border marketplace). Each retailer uses their own HTTP Basic credentials — no platform OAuth.',
    steps: [
      'Sign in to your Fruugo merchant dashboard',
      'Open Settings and copy your API username and password',
      'Paste both below',
    ],
    fields: [
      { key: 'username', label: 'Fruugo Username', kind: 'text',     required: true, help: 'From your Fruugo merchant dashboard.' },
      { key: 'password', label: 'Fruugo Password', kind: 'password', required: true, secret: true, help: 'HTTP Basic-auth password issued by Fruugo.' },
    ],
  },
  ONBUY: {
    type: 'ONBUY',
    name: 'OnBuy',
    docsUrl: 'https://docs.api.onbuy.com/',
    description: 'Connect your OnBuy seller account (UK & European marketplace). Each seller uses their own consumer + secret keys.',
    steps: [
      'Sign in to your OnBuy seller account',
      'Open Settings → API Access and copy the Consumer Key + Secret Key',
      'Pick the OnBuy site (2000 = UK)',
      'Paste below — Kartriq manages the 1-hour access tokens for you',
    ],
    fields: [
      { key: 'consumerKey', label: 'OnBuy Consumer Key', kind: 'text',     required: true },
      { key: 'secretKey',   label: 'OnBuy Secret Key',   kind: 'password', required: true, secret: true },
      { key: 'siteId',      label: 'OnBuy Site',         kind: 'select',   required: false, options: [
        { value: '2000', label: 'United Kingdom (2000)' },
        { value: '2001', label: 'Site 2001' },
        { value: '2002', label: 'Site 2002' },
        { value: '2003', label: 'Site 2003' },
        { value: '2004', label: 'Site 2004' },
        { value: '2005', label: 'Site 2005' },
      ], help: '2000 is the default OnBuy GB site.' },
    ],
  },
  MANOMANO: {
    type: 'MANOMANO',
    name: 'ManoMano',
    docsUrl: 'https://developer.manomano.com/',
    description: "Connect your ManoMano seller account (Europe's DIY & home marketplace). Each seller uses their own API token — no platform OAuth.",
    steps: [
      'Sign in to your ManoMano seller hub',
      'Open Developer / API Access and generate a token',
      'Pick the country marketplace you sell on',
      'Paste the token below',
    ],
    fields: [
      { key: 'accessToken', label: 'ManoMano API Token', kind: 'password', required: true, secret: true, help: 'Generate from your ManoMano seller hub.' },
      { key: 'region',      label: 'Country',            kind: 'select',   required: true, options: [
        { value: 'FR', label: 'France' },
        { value: 'UK', label: 'United Kingdom' },
        { value: 'DE', label: 'Germany' },
        { value: 'IT', label: 'Italy' },
        { value: 'ES', label: 'Spain' },
        { value: 'BE', label: 'Belgium' },
      ] },
    ],
  },
  RAKUTEN: {
    type: 'RAKUTEN',
    name: 'Rakuten Ichiba',
    docsUrl: 'https://webservice.rakuten.co.jp/documentation',
    description: "Connect your Rakuten Ichiba (Japan) seller account via Rakuten Merchant Server (RMS). Each seller pastes their own Service Secret + License Key — no platform OAuth.",
    steps: [
      'Sign in to R-Login (your Rakuten merchant control panel)',
      'Open API settings and copy the Service Secret + License Key',
      'Paste both below — Kartriq combines them into the ESA auth header',
    ],
    fields: [
      { key: 'serviceSecret', label: 'Service Secret', kind: 'password', required: true, secret: true, help: 'From R-Login → API settings.' },
      { key: 'licenseKey',    label: 'License Key',    kind: 'password', required: true, secret: true, help: 'From R-Login → API settings.' },
    ],
  },
  ZALANDO: {
    type: 'ZALANDO',
    name: 'Zalando',
    docsUrl: 'https://api.merchants.zalandoapis.com/docs',
    description: 'Connect your Zalando merchant account via zDirect. Each merchant registers their own API client — no platform OAuth.',
    steps: [
      'Sign in to zDirect (https://zdirect.com)',
      'Open API → Manage Clients and create a new client',
      'Copy the client ID, client secret, and merchant ID',
      'Paste below — Kartriq handles the OAuth client-credentials grant',
    ],
    fields: [
      { key: 'clientId',     label: 'zDirect Client ID',     kind: 'text',     required: true },
      { key: 'clientSecret', label: 'zDirect Client Secret', kind: 'password', required: true, secret: true },
      { key: 'merchantId',   label: 'Merchant ID',           kind: 'text',     required: true, help: 'Found in zDirect under your merchant account.' },
    ],
  },
  KAUFLAND: {
    type: 'KAUFLAND',
    name: 'Kaufland',
    docsUrl: 'https://docs.kaufland.com/',
    description: 'Connect your Kaufland Global Marketplace seller account. Each merchant uses their own client + secret keys — the secret only signs requests locally, never travels over the wire.',
    steps: [
      'Sign in to Kaufland Seller Center → Settings → API Access',
      'Generate a Client Key + Secret Key',
      'Pick the storefront you sell on',
      'Paste below — Kartriq HMAC-signs every request automatically',
    ],
    fields: [
      { key: 'clientKey',  label: 'Client Key', kind: 'text',     required: true },
      { key: 'secretKey',  label: 'Secret Key', kind: 'password', required: true, secret: true, help: 'Used to HMAC-sign each request locally — never sent to any server.' },
      { key: 'storefront', label: 'Storefront', kind: 'select',   required: true, options: [
        { value: 'de', label: 'Germany (kaufland.de)' },
        { value: 'at', label: 'Austria (kaufland.at)' },
        { value: 'sk', label: 'Slovakia (kaufland.sk)' },
        { value: 'cz', label: 'Czech Republic (kaufland.cz)' },
        { value: 'pl', label: 'Poland (kaufland.pl)' },
        { value: 'hr', label: 'Croatia (kaufland.hr)' },
      ] },
    ],
  },
  WISH: {
    type: 'WISH',
    name: 'Wish',
    docsUrl: 'https://merchant.wish.com/documentation/api/v3',
    description: 'Connect your Wish merchant account via the platform-wide OAuth app.',
    oauth: 'wish',
    steps: [
      'Click "Authorize with Wish" below',
      'Sign in to your Wish merchant account when prompted',
      'Approve Kartriq\'s access to your inventory and orders',
      'You\'ll be redirected back automatically',
    ],
    fields: [],
  },
  INDIAMART: { type: 'INDIAMART', name: 'IndiaMART', fields: [
    { key: 'crmKey', label: 'CRM Key (glusr_crm_key)', kind: 'password', required: true, secret: true },
  ]},
  INDUSTRYBUYING: { type: 'INDUSTRYBUYING', name: 'Industrybuying', fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  MOGLIX:        { type: 'MOGLIX',        name: 'Moglix',        fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  PURPLLE:       { type: 'PURPLLE',       name: 'Purplle',       fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  BEWAKOOF:  { type: 'BEWAKOOF',  name: 'Bewakoof',  description: 'No public seller API — uses Kartriq webhook receiver. Configure your portal/3PL to POST orders here.', fields: [{ key: 'webhookSecret', label: 'Webhook HMAC Secret', kind: 'password', required: false, secret: true }] },
  SHOPCLUES: { type: 'SHOPCLUES', name: 'ShopClues', description: 'Webhook receiver — configure your portal to POST orders.', fields: [{ key: 'webhookSecret', label: 'Webhook HMAC Secret', kind: 'password', required: false, secret: true }] },
  FIRSTCRY:  { type: 'FIRSTCRY',  name: 'FirstCry',  fields: [{ key: 'sellerId', label: 'Seller ID', kind: 'text', required: true }, { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  PEPPERFRY: { type: 'PEPPERFRY', name: 'Pepperfry', fields: [{ key: 'sellerId', label: 'Seller ID', kind: 'text', required: true }, { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  CROMA:     { type: 'CROMA',     name: 'Croma',     fields: [{ key: 'sellerId', label: 'Seller ID', kind: 'text', required: true }, { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  TATA_NEU:  { type: 'TATA_NEU',  name: 'Tata Neu',  fields: [{ key: 'sellerId', label: 'Seller ID', kind: 'text', required: true }, { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },

  // ─────────────────────────────────────────────────────────────────────────
  // QUICKCOM extensions
  // ─────────────────────────────────────────────────────────────────────────
  FLIPKART_MINUTES: { type: 'FLIPKART_MINUTES', name: 'Flipkart Minutes', fields: [
    { key: 'appId', label: 'App ID', kind: 'text', required: true },
    { key: 'appSecret', label: 'App Secret', kind: 'password', required: true, secret: true },
  ]},
  TATA_1MG: { type: 'TATA_1MG', name: 'Tata 1mg', fields: [
    { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true },
    { key: 'sellerId', label: 'Seller ID', kind: 'text', required: true },
  ]},
  DUNZO: { type: 'DUNZO', name: 'Dunzo', fields: [
    { key: 'clientId', label: 'Client ID', kind: 'text', required: true },
    { key: 'accessToken', label: 'Access Token', kind: 'password', required: true, secret: true },
  ]},
  COUNTRY_DELIGHT: { type: 'COUNTRY_DELIGHT', name: 'Country Delight', description: 'Webhook receiver.', fields: [
    { key: 'webhookSecret', label: 'Webhook HMAC Secret', kind: 'password', required: false, secret: true },
  ]},

  // ─────────────────────────────────────────────────────────────────────────
  // LOGISTICS extensions
  // ─────────────────────────────────────────────────────────────────────────
  ARAMEX: { type: 'ARAMEX', name: 'Aramex', fields: [
    { key: 'username', label: 'Username', kind: 'text', required: true },
    { key: 'password', label: 'Password', kind: 'password', required: true, secret: true },
    { key: 'accountNumber', label: 'Account Number', kind: 'text', required: true },
    { key: 'accountPin', label: 'Account PIN', kind: 'password', required: true, secret: true },
  ]},
  EKART:                 { type: 'EKART',                 name: 'Ekart',                 fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }, { key: 'merchantId', label: 'Merchant ID', kind: 'text', required: true }] },
  INDIA_POST:            { type: 'INDIA_POST',            name: 'India Post',            description: 'Tracking only — shipments are booked at counters.', fields: [{ key: 'licenseKey', label: 'License Key', kind: 'password', required: true, secret: true }] },
  GATI:                  { type: 'GATI',                  name: 'Gati',                  fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  SAFEXPRESS:            { type: 'SAFEXPRESS',            name: 'Safexpress',            fields: [{ key: 'username', label: 'Username', kind: 'text', required: true }, { key: 'password', label: 'Password', kind: 'password', required: true, secret: true }] },
  TRACKON:               { type: 'TRACKON',               name: 'Trackon',               fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  PROFESSIONAL_COURIERS: { type: 'PROFESSIONAL_COURIERS', name: 'The Professional Couriers', fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  SMARTR:                { type: 'SMARTR',                name: 'Smartr Logistics',      fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  SHYPLITE:              { type: 'SHYPLITE',              name: 'Shyplite',              fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  ICARRY:                { type: 'ICARRY',                name: 'iCarry',                fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  DOTZOT:                { type: 'DOTZOT',                name: 'DotZot',                fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  SHIPDELIGHT:           { type: 'SHIPDELIGHT',           name: 'ShipDelight',           fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },

  // ─────────────────────────────────────────────────────────────────────────
  // OWNSTORE extensions
  // ─────────────────────────────────────────────────────────────────────────
  WIX: { type: 'WIX', name: 'Wix Stores', fields: [
    { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true },
    { key: 'siteId', label: 'Wix Site ID', kind: 'text', required: true },
  ]},
  SQUARESPACE: { type: 'SQUARESPACE', name: 'Squarespace Commerce', fields: [
    { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true },
  ]},
  SALESFORCE_COMMERCE: { type: 'SALESFORCE_COMMERCE', name: 'Salesforce Commerce Cloud', fields: [
    { key: 'shortCode', label: 'Short Code', kind: 'text', required: true, help: 'From your B2C Commerce instance URL.' },
    { key: 'siteId', label: 'Site ID', kind: 'text', required: true },
    { key: 'accessToken', label: 'Access Token', kind: 'password', required: true, secret: true },
  ]},
  PRESTASHOP: { type: 'PRESTASHOP', name: 'PrestaShop', fields: [
    { key: 'storeUrl', label: 'Store URL', kind: 'url', required: true },
    { key: 'apiKey', label: 'Webservice API Key', kind: 'password', required: true, secret: true },
  ]},
  ECWID: { type: 'ECWID', name: 'Ecwid', fields: [
    { key: 'storeId', label: 'Store ID', kind: 'text', required: true },
    { key: 'accessToken', label: 'Access Token', kind: 'password', required: true, secret: true },
  ]},
  ZOHO_COMMERCE: { type: 'ZOHO_COMMERCE', name: 'Zoho Commerce', fields: [
    { key: 'accessToken', label: 'OAuth Access Token', kind: 'password', required: true, secret: true },
    { key: 'organizationId', label: 'Organization ID', kind: 'text', required: true },
  ]},
  DUKAAN:           { type: 'DUKAAN',           name: 'Dukaan',           fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  SHOOPY:           { type: 'SHOOPY',           name: 'Shoopy',           fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  BIKAYI:           { type: 'BIKAYI',           name: 'Bikayi',           fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  KARTROCKET:       { type: 'KARTROCKET',       name: 'KartRocket',       fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  INSTAMOJO_PAGES:  { type: 'INSTAMOJO_PAGES',  name: 'Instamojo Pages',  fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },

  // ─────────────────────────────────────────────────────────────────────────
  // SOCIAL extensions
  // ─────────────────────────────────────────────────────────────────────────
  TIKTOK_SHOP: { type: 'TIKTOK_SHOP', name: 'TikTok Shop', fields: [
    { key: 'appKey', label: 'App Key', kind: 'text', required: true },
    { key: 'accessToken', label: 'Access Token', kind: 'password', required: true, secret: true },
    { key: 'shopId', label: 'Shop ID', kind: 'text', required: true },
  ]},
  PINTEREST: { type: 'PINTEREST', name: 'Pinterest Shopping', fields: [
    { key: 'accessToken', label: 'Access Token', kind: 'password', required: true, secret: true },
  ]},
  YOUTUBE_SHOPPING: { type: 'YOUTUBE_SHOPPING', name: 'YouTube Shopping', fields: [
    { key: 'accessToken', label: 'OAuth Access Token', kind: 'password', required: true, secret: true },
    { key: 'merchantId', label: 'Google Merchant ID', kind: 'text', required: true },
  ]},
  SNAPCHAT: { type: 'SNAPCHAT', name: 'Snapchat', fields: [
    { key: 'accessToken', label: 'Access Token', kind: 'password', required: true, secret: true },
    { key: 'catalogId', label: 'Catalog ID', kind: 'text', required: true },
  ]},

  // ─────────────────────────────────────────────────────────────────────────
  // ACCOUNTING & ERP
  // ─────────────────────────────────────────────────────────────────────────
  TALLY: { type: 'TALLY', name: 'Tally ERP 9', description: 'Tally listens on a local TCP port (default 9000). Make sure Tally is running on the host you specify.', fields: [
    { key: 'host', label: 'Tally Host', kind: 'text', required: true, placeholder: 'localhost' },
    { key: 'port', label: 'Port', kind: 'text', required: true, placeholder: '9000' },
    { key: 'companyName', label: 'Company Name', kind: 'text', required: true },
  ]},
  TALLY_PRIME: { type: 'TALLY_PRIME', name: 'Tally Prime', description: 'Tally Prime listens on a local TCP port (default 9000).', fields: [
    { key: 'host', label: 'Tally Host', kind: 'text', required: true, placeholder: 'localhost' },
    { key: 'port', label: 'Port', kind: 'text', required: true, placeholder: '9000' },
    { key: 'companyName', label: 'Company Name', kind: 'text', required: true },
  ]},
  ZOHO_BOOKS: { type: 'ZOHO_BOOKS', name: 'Zoho Books', fields: [
    { key: 'accessToken', label: 'OAuth Access Token', kind: 'password', required: true, secret: true },
    { key: 'organizationId', label: 'Organization ID', kind: 'text', required: true },
  ]},
  QUICKBOOKS: { type: 'QUICKBOOKS', name: 'QuickBooks', fields: [
    { key: 'realmId', label: 'Company (Realm) ID', kind: 'text', required: true },
    { key: 'accessToken', label: 'OAuth Access Token', kind: 'password', required: true, secret: true },
  ]},
  XERO: { type: 'XERO', name: 'Xero', fields: [
    { key: 'tenantId', label: 'Xero Tenant ID', kind: 'text', required: true },
    { key: 'accessToken', label: 'OAuth Access Token', kind: 'password', required: true, secret: true },
  ]},
  SAP_B1: { type: 'SAP_B1', name: 'SAP Business One', fields: [
    { key: 'serviceLayerUrl', label: 'Service Layer URL', kind: 'url', required: true },
    { key: 'sessionId', label: 'B1 Session ID', kind: 'password', required: true, secret: true },
  ]},
  SAP_S4HANA: { type: 'SAP_S4HANA', name: 'SAP S/4HANA', fields: [
    { key: 'baseUrl', label: 'OData Base URL', kind: 'url', required: true },
    { key: 'username', label: 'Username', kind: 'text', required: true },
    { key: 'password', label: 'Password', kind: 'password', required: true, secret: true },
  ]},
  ERPNEXT: { type: 'ERPNEXT', name: 'ERPNext', fields: [
    { key: 'siteUrl', label: 'Site URL', kind: 'url', required: true },
    { key: 'apiKey', label: 'API Key', kind: 'text', required: true },
    { key: 'apiSecret', label: 'API Secret', kind: 'password', required: true, secret: true },
  ]},
  DYNAMICS_365: { type: 'DYNAMICS_365', name: 'Microsoft Dynamics 365', fields: [
    { key: 'tenantId', label: 'Tenant ID', kind: 'text', required: true },
    { key: 'environment', label: 'Environment', kind: 'text', required: true },
    { key: 'companyId', label: 'Company ID', kind: 'text', required: true },
    { key: 'accessToken', label: 'OAuth Access Token', kind: 'password', required: true, secret: true },
  ]},
  NETSUITE: { type: 'NETSUITE', name: 'NetSuite', fields: [
    { key: 'accountId', label: 'Account ID', kind: 'text', required: true },
    { key: 'accessToken', label: 'Access Token', kind: 'password', required: true, secret: true },
  ]},
  ODOO: { type: 'ODOO', name: 'Odoo', fields: [
    { key: 'url', label: 'Odoo URL', kind: 'url', required: true },
    { key: 'database', label: 'Database', kind: 'text', required: true },
    { key: 'uid', label: 'User ID', kind: 'text', required: true },
    { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true },
  ]},
  BUSY:      { type: 'BUSY',      name: 'Busy Accounting', fields: [{ key: 'host', label: 'Host', kind: 'text', required: true, placeholder: 'localhost' }, { key: 'port', label: 'Port', kind: 'text', placeholder: '8080' }, { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  MARG_ERP:  { type: 'MARG_ERP',  name: 'Marg ERP',        fields: [{ key: 'serverUrl', label: 'Server URL', kind: 'url', required: true }, { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  LOGIC_ERP: { type: 'LOGIC_ERP', name: 'LOGIC ERP',       fields: [{ key: 'serverUrl', label: 'Server URL', kind: 'url', required: true }, { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },

  // ─────────────────────────────────────────────────────────────────────────
  // POS_SYSTEM
  // ─────────────────────────────────────────────────────────────────────────
  SHOPIFY_POS: { type: 'SHOPIFY_POS', name: 'Shopify POS', fields: [
    { key: 'shopUrl', label: 'Shop URL (e.g. mystore.myshopify.com)', kind: 'text', required: true },
    { key: 'accessToken', label: 'Admin API Access Token', kind: 'password', required: true, secret: true },
  ]},
  SQUARE_POS: { type: 'SQUARE_POS', name: 'Square POS', fields: [
    { key: 'accessToken', label: 'Access Token', kind: 'password', required: true, secret: true },
    { key: 'locationId', label: 'Location ID', kind: 'text', required: true },
  ]},
  LIGHTSPEED_POS: { type: 'LIGHTSPEED_POS', name: 'Lightspeed POS', fields: [
    { key: 'accountId', label: 'Account ID', kind: 'text', required: true },
    { key: 'accessToken', label: 'OAuth Access Token', kind: 'password', required: true, secret: true },
  ]},
  LOYVERSE_POS:  { type: 'LOYVERSE_POS',  name: 'LoyVerse POS', fields: [{ key: 'accessToken', label: 'Access Token', kind: 'password', required: true, secret: true }] },
  GOFRUGAL: { type: 'GOFRUGAL', name: 'GoFrugal', fields: [
    { key: 'serverUrl', label: 'Server URL', kind: 'url', required: true },
    { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true },
  ]},
  POSIST:    { type: 'POSIST',    name: 'Posist',    fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  PETPOOJA: { type: 'PETPOOJA', name: 'Petpooja', fields: [
    { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true },
    { key: 'restaurantId', label: 'Restaurant ID', kind: 'text', required: true },
  ]},
  VYAPAR:    { type: 'VYAPAR',    name: 'Vyapar',    fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  ZOHO_POS: { type: 'ZOHO_POS', name: 'Zoho Inventory POS', fields: [
    { key: 'accessToken', label: 'OAuth Access Token', kind: 'password', required: true, secret: true },
    { key: 'organizationId', label: 'Organization ID', kind: 'text', required: true },
  ]},

  // ─────────────────────────────────────────────────────────────────────────
  // PAYMENT
  // ─────────────────────────────────────────────────────────────────────────
  RAZORPAY: { type: 'RAZORPAY', name: 'Razorpay', fields: [
    { key: 'keyId', label: 'Key ID', kind: 'text', required: true },
    { key: 'keySecret', label: 'Key Secret', kind: 'password', required: true, secret: true },
    { key: 'webhookSecret', label: 'Webhook Secret', kind: 'password', secret: true },
  ]},
  PAYU: { type: 'PAYU', name: 'PayU', fields: [
    { key: 'merchantKey', label: 'Merchant Key', kind: 'text', required: true },
    { key: 'salt', label: 'Salt', kind: 'password', required: true, secret: true },
  ]},
  CCAVENUE: { type: 'CCAVENUE', name: 'CCAvenue', fields: [
    { key: 'merchantId', label: 'Merchant ID', kind: 'text', required: true },
    { key: 'workingKey', label: 'Working Key', kind: 'password', required: true, secret: true },
    { key: 'accessCode', label: 'Access Code', kind: 'password', required: true, secret: true },
  ]},
  CASHFREE: { type: 'CASHFREE', name: 'Cashfree', fields: [
    { key: 'clientId', label: 'Client ID', kind: 'text', required: true },
    { key: 'clientSecret', label: 'Client Secret', kind: 'password', required: true, secret: true },
  ]},
  STRIPE: { type: 'STRIPE', name: 'Stripe', fields: [
    { key: 'secretKey', label: 'Secret Key', kind: 'password', required: true, secret: true },
    { key: 'webhookSecret', label: 'Webhook Secret', kind: 'password', secret: true },
  ]},
  PAYPAL: { type: 'PAYPAL', name: 'PayPal', fields: [
    { key: 'clientId', label: 'Client ID', kind: 'text', required: true },
    { key: 'clientSecret', label: 'Client Secret', kind: 'password', required: true, secret: true },
    { key: 'live', label: 'Environment', kind: 'select', required: true, options: [{ value: 'false', label: 'Sandbox' }, { value: 'true', label: 'Live' }] },
  ]},
  PAYTM_PG: { type: 'PAYTM_PG', name: 'Paytm Payments', fields: [
    { key: 'mid', label: 'Merchant ID', kind: 'text', required: true },
    { key: 'merchantKey', label: 'Merchant Key', kind: 'password', required: true, secret: true },
    { key: 'live', label: 'Environment', kind: 'select', required: true, options: [{ value: 'false', label: 'Staging' }, { value: 'true', label: 'Production' }] },
  ]},
  PHONEPE_BUSINESS: { type: 'PHONEPE_BUSINESS', name: 'PhonePe Business', fields: [
    { key: 'merchantId', label: 'Merchant ID', kind: 'text', required: true },
    { key: 'saltKey', label: 'Salt Key', kind: 'password', required: true, secret: true },
    { key: 'saltIndex', label: 'Salt Index', kind: 'text', placeholder: '1' },
    { key: 'live', label: 'Environment', kind: 'select', required: true, options: [{ value: 'false', label: 'Sandbox' }, { value: 'true', label: 'Live' }] },
  ]},
  INSTAMOJO: { type: 'INSTAMOJO', name: 'Instamojo', fields: [
    { key: 'apiKey', label: 'API Key', kind: 'text', required: true },
    { key: 'authToken', label: 'Auth Token', kind: 'password', required: true, secret: true },
  ]},

  // ─────────────────────────────────────────────────────────────────────────
  // TAX
  // ─────────────────────────────────────────────────────────────────────────
  CLEARTAX: { type: 'CLEARTAX', name: 'ClearTax', fields: [
    { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true },
    { key: 'authToken', label: 'Auth Token', kind: 'password', required: true, secret: true },
  ]},
  GSTZEN: { type: 'GSTZEN', name: 'GSTZen', fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  TAXCLOUD_IRP: { type: 'TAXCLOUD_IRP', name: 'TaxCloud (Government IRP)', fields: [
    { key: 'clientId', label: 'Client ID', kind: 'text', required: true },
    { key: 'clientSecret', label: 'Client Secret', kind: 'password', required: true, secret: true },
    { key: 'gstin', label: 'GSTIN', kind: 'text', required: true },
    { key: 'username', label: 'IRP Username', kind: 'text', required: true },
    { key: 'authToken', label: 'Auth Token', kind: 'password', required: true, secret: true },
  ]},
  AVALARA: { type: 'AVALARA', name: 'Avalara', fields: [
    { key: 'accountId', label: 'Account ID', kind: 'text', required: true },
    { key: 'licenseKey', label: 'License Key', kind: 'password', required: true, secret: true },
  ]},
  ZOHO_GST: { type: 'ZOHO_GST', name: 'Zoho GST', fields: [
    { key: 'accessToken', label: 'OAuth Access Token', kind: 'password', required: true, secret: true },
    { key: 'organizationId', label: 'Organization ID', kind: 'text', required: true },
  ]},

  // ─────────────────────────────────────────────────────────────────────────
  // CRM
  // ─────────────────────────────────────────────────────────────────────────
  HUBSPOT:        { type: 'HUBSPOT',        name: 'HubSpot',        fields: [{ key: 'accessToken', label: 'Private App Token', kind: 'password', required: true, secret: true }] },
  SALESFORCE_CRM: { type: 'SALESFORCE_CRM', name: 'Salesforce CRM', fields: [
    { key: 'instanceUrl', label: 'Instance URL', kind: 'url', required: true },
    { key: 'accessToken', label: 'OAuth Access Token', kind: 'password', required: true, secret: true },
  ]},
  ZOHO_CRM:   { type: 'ZOHO_CRM',   name: 'Zoho CRM',   fields: [{ key: 'accessToken', label: 'OAuth Access Token', kind: 'password', required: true, secret: true }] },
  MAILCHIMP: { type: 'MAILCHIMP', name: 'Mailchimp', fields: [
    { key: 'apiKey', label: 'API Key (suffix is your DC)', kind: 'password', required: true, secret: true },
    { key: 'audienceId', label: 'Audience (List) ID', kind: 'text', required: true },
  ]},
  KLAVIYO:    { type: 'KLAVIYO',    name: 'Klaviyo',    fields: [{ key: 'privateKey', label: 'Private API Key', kind: 'password', required: true, secret: true }] },
  SENDINBLUE: { type: 'SENDINBLUE', name: 'Brevo (Sendinblue)', fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  WEBENGAGE: { type: 'WEBENGAGE', name: 'WebEngage', fields: [
    { key: 'licenseCode', label: 'License Code', kind: 'text', required: true },
    { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true },
  ]},
  MOENGAGE: { type: 'MOENGAGE', name: 'MoEngage', fields: [
    { key: 'appId', label: 'App ID', kind: 'text', required: true },
    { key: 'dataApiKey', label: 'Data API Key', kind: 'password', required: true, secret: true },
    { key: 'dataCenter', label: 'Data Center', kind: 'text', placeholder: '01' },
  ]},
  CLEVERTAP: { type: 'CLEVERTAP', name: 'CleverTap', fields: [
    { key: 'accountId', label: 'Account ID', kind: 'text', required: true },
    { key: 'passcode', label: 'Passcode', kind: 'password', required: true, secret: true },
  ]},
  FRESHDESK: { type: 'FRESHDESK', name: 'Freshdesk', fields: [
    { key: 'domain', label: 'Subdomain (xxx.freshdesk.com)', kind: 'text', required: true },
    { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true },
  ]},
  ZENDESK: { type: 'ZENDESK', name: 'Zendesk', fields: [
    { key: 'subdomain', label: 'Subdomain (xxx.zendesk.com)', kind: 'text', required: true },
    { key: 'email', label: 'Account Email', kind: 'text', required: true },
    { key: 'apiToken', label: 'API Token', kind: 'password', required: true, secret: true },
  ]},
  GORGIAS: { type: 'GORGIAS', name: 'Gorgias', fields: [
    { key: 'subdomain', label: 'Subdomain (xxx.gorgias.com)', kind: 'text', required: true },
    { key: 'username', label: 'Account Email', kind: 'text', required: true },
    { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true },
  ]},

  // ─────────────────────────────────────────────────────────────────────────
  // RETURNS
  // ─────────────────────────────────────────────────────────────────────────
  RETURN_PRIME: { type: 'RETURN_PRIME', name: 'Return Prime', fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  WERETURN:     { type: 'WERETURN',     name: 'WeReturn',     fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  ANCHANTO_RETURNS: { type: 'ANCHANTO_RETURNS', name: 'Anchanto Returns', fields: [
    { key: 'subdomain', label: 'Subdomain', kind: 'text', required: true },
    { key: 'tenantId', label: 'Tenant ID', kind: 'text', required: true },
    { key: 'accessToken', label: 'Access Token', kind: 'password', required: true, secret: true },
  ]},
  EASYVMS: { type: 'EASYVMS', name: 'EasyVMS', fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },

  // ─────────────────────────────────────────────────────────────────────────
  // FULFILLMENT
  // ─────────────────────────────────────────────────────────────────────────
  AMAZON_FBA: { type: 'AMAZON_FBA', name: 'Amazon FBA', description: 'Same SP-API credentials as your Amazon Seller account; FBA modules are scoped server-side.', fields: [
    { key: 'sellerId', label: 'Seller ID', kind: 'text', required: true },
    { key: 'clientId', label: 'LWA Client ID', kind: 'text', required: true },
    { key: 'clientSecret', label: 'LWA Client Secret', kind: 'password', required: true, secret: true },
    { key: 'refreshToken', label: 'Refresh Token', kind: 'password', required: true, secret: true },
  ]},
  FLIPKART_SMART_FULFILLMENT: { type: 'FLIPKART_SMART_FULFILLMENT', name: 'Flipkart Smart Fulfillment', fields: [
    { key: 'appId', label: 'App ID', kind: 'text', required: true },
    { key: 'appSecret', label: 'App Secret', kind: 'password', required: true, secret: true },
  ]},
  WAREIQ:   { type: 'WAREIQ',   name: 'WareIQ',           fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
  LOGINEXT: { type: 'LOGINEXT', name: 'LogiNext',         fields: [
    { key: 'accountId', label: 'Account ID', kind: 'text', required: true },
    { key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true },
  ]},
  HOLISOL:  { type: 'HOLISOL',  name: 'Holisol Logistics', fields: [{ key: 'apiKey', label: 'API Key', kind: 'password', required: true, secret: true }] },
};

export function getSchemaForType(type: string): ChannelSchema | null {
  return CHANNEL_SCHEMAS[type] || null;
}
