// OAuth broker for per-seller channel authorization.
// Public SaaS apps (Amazon, Shopify, Flipkart, Meta…) register ONE app each
// with the provider. Every tenant clicks "Authorize" → the provider redirects
// to our callback with a code → we exchange it for a per-seller refresh token
// and store it encrypted on that tenant's Channel row.

const { Router } = require('express');
const crypto = require('crypto');
const axios = require('axios');
const prisma = require('../utils/prisma');
const { encryptCredentials } = require('../utils/crypto');
const settings = require('../services/settings.service');
const {
  authenticate, requireTenant, requirePermission,
} = require('../middleware/auth.middleware');

const router = Router();

// ── Short-lived signed state to bind callback to originating channel ──
// state = base64(JSON({ channelId, tenantId, nonce, exp }))
const STATE_TTL_MS = 15 * 60 * 1000;

function signState(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET env var is required');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(state) {
  if (!state || typeof state !== 'string' || !state.includes('.')) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET env var is required');
  const [body, sig] = state.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (parsed.exp && parsed.exp < Date.now()) return null;
    return parsed;
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════════
// AUTHENTICATED — seller kicks off the flow from the Channels UI
// ══════════════════════════════════════════════════════════════════════════

// Channel types we treat as Amazon-OAuth-compatible. AMAZON_<REGION> variants
// inherit region from their type so callers don't need to pass it explicitly.
const AMAZON_TYPE_TO_REGION = {
  AMAZON:           'IN',
  AMAZON_SMARTBIZ:  'IN',
  AMAZON_US:        'US',
  AMAZON_UK:        'UK',
  AMAZON_UAE:       'AE',
  AMAZON_SA:        'SA',
  AMAZON_SG:        'SG',
  AMAZON_AU:        'AU',
  AMAZON_DE:        'DE',
};

// Seller Central consent host per region. Falls back to .in for unknown regions.
const AMAZON_CONSENT_HOST = {
  IN: 'https://sellercentral.amazon.in',
  US: 'https://sellercentral.amazon.com',
  CA: 'https://sellercentral.amazon.ca',
  MX: 'https://sellercentral.amazon.com.mx',
  UK: 'https://sellercentral.amazon.co.uk',
  DE: 'https://sellercentral.amazon.de',
  FR: 'https://sellercentral.amazon.fr',
  IT: 'https://sellercentral.amazon.it',
  ES: 'https://sellercentral.amazon.es',
  AE: 'https://sellercentral.amazon.ae',
  SA: 'https://sellercentral.amazon.sa',
  AU: 'https://sellercentral.amazon.com.au',
  SG: 'https://sellercentral.amazon.sg',
  JP: 'https://sellercentral.amazon.co.jp',
  // Legacy alias
  EU: 'https://sellercentral.amazon.co.uk',
};

// GET /api/v1/oauth/amazon/start?channelId=xxx[&region=IN]
// Returns the Amazon Seller Central consent URL the frontend should open.
router.get('/amazon/start',
  authenticate, requireTenant, requirePermission('channels.update'),
  async (req, res) => {
    try {
      const { channelId } = req.query;
      if (!channelId) return res.status(400).json({ error: 'channelId required' });

      const channel = await prisma.channel.findFirst({
        where: { id: String(channelId), tenantId: req.tenant.id },
      });
      if (!channel) return res.status(404).json({ error: 'Channel not found' });

      // Region is derived from the channel type for AMAZON_<REGION> variants;
      // for the generic AMAZON / AMAZON_SMARTBIZ types, accept ?region=… and
      // default to IN for back-compat.
      const inferredRegion = AMAZON_TYPE_TO_REGION[channel.type];
      if (!inferredRegion) {
        return res.status(400).json({ error: `Channel type ${channel.type} is not Amazon-OAuth compatible` });
      }
      const isGeneric = channel.type === 'AMAZON' || channel.type === 'AMAZON_SMARTBIZ';
      const region = isGeneric ? String(req.query.region || inferredRegion) : inferredRegion;

      const [appId, redirectUri] = await Promise.all([
        settings.get('amazon.appId'),
        settings.get('amazon.redirectUri'),
      ]);
      if (!appId) return res.status(400).json({ error: 'amazon.appId not set in Admin → Settings' });
      if (!redirectUri) return res.status(400).json({ error: 'amazon.redirectUri not set in Admin → Settings' });

      const state = signState({
        channelId: channel.id,
        tenantId: req.tenant.id,
        region,
        nonce: crypto.randomBytes(8).toString('hex'),
        exp: Date.now() + STATE_TTL_MS,
      });

      const consentHost = AMAZON_CONSENT_HOST[region] || AMAZON_CONSENT_HOST.IN;

      const url = `${consentHost}/apps/authorize/consent?` +
        new URLSearchParams({
          application_id: appId,
          state,
          redirect_uri: redirectUri,
          version: 'beta', // remove once app is published live
        }).toString();

      res.json({ url, state, region });
    } catch (err) {
      console.error('[oauth/amazon/start]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/v1/oauth/amazon/status?channelId=xxx
// Polled by the frontend popup-opener while the user completes consent.
router.get('/amazon/status',
  authenticate, requireTenant, requirePermission('channels.read'),
  async (req, res) => {
    const channel = await prisma.channel.findFirst({
      where: { id: String(req.query.channelId || ''), tenantId: req.tenant.id },
      select: { id: true, credentials: true, syncError: true },
    });
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    res.json({
      connected: !!channel.credentials,
      error: channel.syncError || null,
    });
  }
);

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC CALLBACK — Amazon redirects the browser here with the auth code
// ══════════════════════════════════════════════════════════════════════════

// GET /api/v1/oauth/amazon/callback?spapi_oauth_code=...&selling_partner_id=...&state=...
router.get('/amazon/callback', async (req, res) => {
  const { spapi_oauth_code, selling_partner_id, state } = req.query;

  const parsed = verifyState(String(state || ''));
  if (!parsed) return res.status(400).send(renderPage('Authorization failed', 'Invalid or expired state. Please retry from Kartriq.'));
  if (!spapi_oauth_code) return res.status(400).send(renderPage('Authorization failed', 'Missing authorization code from Amazon.'));

  try {
    const [clientId, clientSecret] = await Promise.all([
      settings.get('amazon.clientId'),
      settings.get('amazon.clientSecret'),
    ]);
    if (!clientId || !clientSecret) {
      return res.status(500).send(renderPage('Platform not configured', 'The platform admin has not set amazon.clientId / amazon.clientSecret.'));
    }

    // Exchange the one-time code for a long-lived refresh token
    const tokenRes = await axios.post('https://api.amazon.com/auth/o2/token', {
      grant_type: 'authorization_code',
      code: spapi_oauth_code,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const { refresh_token } = tokenRes.data;
    if (!refresh_token) throw new Error('Amazon did not return a refresh_token');

    // Save on the channel row — credentials column is encrypted at rest
    const channel = await prisma.channel.findFirst({
      where: { id: parsed.channelId, tenantId: parsed.tenantId },
    });
    if (!channel) throw new Error('Channel no longer exists');

    const creds = {
      sellerId: String(selling_partner_id || ''),
      refreshToken: refresh_token,
      region: parsed.region || 'IN',
    };
    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        credentials: encryptCredentials(creds),
        syncError: null,
        lastSyncAt: null,
      },
    });

    res.send(renderPage(
      '✓ Connected',
      `Amazon Seller account <b>${selling_partner_id}</b> linked. You can close this window and return to Kartriq.`,
      { autoClose: true }
    ));
  } catch (err) {
    console.error('[oauth/amazon/callback]', err.response?.data || err.message);
    // Surface the error on the channel so the user sees it in the UI
    try {
      await prisma.channel.updateMany({
        where: { id: parsed.channelId, tenantId: parsed.tenantId },
        data: { syncError: err.response?.data?.error_description || err.message },
      });
    } catch {}
    res.status(500).send(renderPage('Authorization failed', err.response?.data?.error_description || err.message));
  }
});

// Escape any string before interpolating into HTML. Both `title` and `body`
// in renderPage() can be sourced from upstream OAuth provider error
// responses (e.g. Amazon's `error_description` or Shopify's error string).
// Without escaping, a hostile or accidentally-crafted upstream error string
// becomes a stored XSS vector inside the OAuth callback page.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPage(title, body, { autoClose = false } = {}) {
  const safeTitle = escapeHtml(title);
  const safeBody  = escapeHtml(body);
  // On success we return the seller to the app: try to close this tab (which
  // returns focus to the Kartriq tab that started the flow); if the browser
  // blocks close(), redirect this tab to the channels page so they never land
  // on a dead tab. Error pages don't auto-close so the message stays readable.
  const appBase = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const backUrl = appBase ? `${appBase}/channels` : '';
  const closeScript = autoClose
    ? `<script>
      (function(){
        var back = ${JSON.stringify(backUrl)};
        setTimeout(function(){
          try { window.close(); } catch (e) {}
          setTimeout(function(){ if (back && !window.closed) { window.location.replace(back); } }, 600);
        }, 1200);
      })();
    </script>`
    : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; background: linear-gradient(135deg,#06D4B8,#06B6D4); color:white; min-height:100vh; display:flex; align-items:center; justify-content:center; margin:0; }
  .card { background: rgba(255,255,255,0.95); color:#0f172a; padding:32px 40px; border-radius:20px; max-width:440px; text-align:center; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
  h1 { margin:0 0 12px; font-size:22px; }
  p  { margin:0; color:#475569; line-height:1.5; font-size:14px; }
  button { margin-top:20px; background:#06D4B8; color:white; border:none; padding:10px 20px; border-radius:10px; font-weight:700; cursor:pointer; }
</style></head>
<body>
  <div class="card">
    <h1>${safeTitle}</h1>
    <p>${safeBody}</p>
    <button onclick="window.close()">Close window</button>
  </div>
  ${closeScript}
</body></html>`;
}

// ══════════════════════════════════════════════════════════════════════════
// SHOPIFY — one Partner app, each store installs it via OAuth
// ══════════════════════════════════════════════════════════════════════════

// Generic status endpoint — works for shopify / flipkart / meta
router.get('/:provider/status',
  authenticate, requireTenant, requirePermission('channels.read'),
  async (req, res) => {
    const channel = await prisma.channel.findFirst({
      where: { id: String(req.query.channelId || ''), tenantId: req.tenant.id },
      select: { id: true, credentials: true, syncError: true },
    });
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    res.json({
      connected: !!channel.credentials,
      error: channel.syncError || null,
    });
  }
);

// GET /api/v1/oauth/shopify/start?channelId=xxx&shop=mystore.myshopify.com
router.get('/shopify/start',
  authenticate, requireTenant, requirePermission('channels.update'),
  async (req, res) => {
    try {
      const { channelId, shop } = req.query;
      if (!channelId) return res.status(400).json({ error: 'channelId required' });
      if (!shop) return res.status(400).json({ error: 'shop required (e.g. mystore.myshopify.com)' });
      if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(String(shop))) {
        return res.status(400).json({ error: 'Invalid shop domain. Must be something.myshopify.com' });
      }

      const channel = await prisma.channel.findFirst({
        where: { id: String(channelId), tenantId: req.tenant.id },
      });
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
      if (channel.type !== 'SHOPIFY') return res.status(400).json({ error: 'Channel is not Shopify' });

      const [apiKey, redirectUri, scopes] = await Promise.all([
        settings.get('shopify.apiKey'),
        settings.get('shopify.redirectUri'),
        settings.get('shopify.scopes'),
      ]);
      if (!apiKey) return res.status(400).json({ error: 'shopify.apiKey not set in Admin → Settings' });
      if (!redirectUri) return res.status(400).json({ error: 'shopify.redirectUri not set in Admin → Settings' });

      const scopeList = (scopes || 'read_products,write_products,read_orders,write_orders,read_inventory,write_inventory').trim();

      const state = signState({
        provider: 'shopify',
        channelId: channel.id,
        tenantId: req.tenant.id,
        shop: String(shop),
        nonce: crypto.randomBytes(8).toString('hex'),
        exp: Date.now() + STATE_TTL_MS,
      });

      const url = `https://${shop}/admin/oauth/authorize?` +
        new URLSearchParams({
          client_id: apiKey,
          scope: scopeList,
          redirect_uri: redirectUri,
          state,
        }).toString();

      res.json({ url, state });
    } catch (err) {
      console.error('[oauth/shopify/start]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/v1/oauth/shopify/callback?code=...&hmac=...&shop=...&state=...
router.get('/shopify/callback', async (req, res) => {
  const { code, hmac, shop, state } = req.query;

  const parsed = verifyState(String(state || ''));
  if (!parsed) return res.status(400).send(renderPage('Authorization failed', 'Invalid or expired state.'));
  if (parsed.provider !== 'shopify') return res.status(400).send(renderPage('Authorization failed', 'State/provider mismatch.'));
  if (!code) return res.status(400).send(renderPage('Authorization failed', 'Missing authorization code.'));

  try {
    const [apiKey, apiSecret] = await Promise.all([
      settings.get('shopify.apiKey'),
      settings.get('shopify.apiSecret'),
    ]);
    if (!apiKey || !apiSecret) {
      return res.status(500).send(renderPage('Platform not configured', 'shopify.apiKey / apiSecret not set.'));
    }

    // Verify Shopify HMAC — https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant#step-3-verify-the-installation-request
    const params = { ...req.query };
    delete params.hmac;
    delete params.signature;
    const message = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
    const expectedHmac = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
    if (expectedHmac !== String(hmac || '')) {
      return res.status(401).send(renderPage('Authorization failed', 'HMAC verification failed.'));
    }

    // Exchange code for a permanent access token
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    });
    const { access_token, scope } = tokenRes.data;
    if (!access_token) throw new Error('Shopify did not return an access_token');

    const channel = await prisma.channel.findFirst({
      where: { id: parsed.channelId, tenantId: parsed.tenantId },
    });
    if (!channel) throw new Error('Channel no longer exists');

    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        credentials: encryptCredentials({
          shopUrl: `https://${shop}`,
          accessToken: access_token,
          scope: scope || null,
        }),
        syncError: null,
        lastSyncAt: null,
      },
    });

    res.send(renderPage(
      '✓ Connected',
      `Shopify store <b>${shop}</b> linked. You can close this window.`,
      { autoClose: true }
    ));
  } catch (err) {
    console.error('[oauth/shopify/callback]', err.response?.data || err.message);
    try {
      await prisma.channel.updateMany({
        where: { id: parsed.channelId, tenantId: parsed.tenantId },
        data: { syncError: err.response?.data?.error_description || err.message },
      });
    } catch {}
    res.status(500).send(renderPage('Authorization failed', err.response?.data?.error_description || err.message));
  }
});

// ══════════════════════════════════════════════════════════════════════════
// LAZADA — Open Platform OAuth 2.0 (Southeast Asia)
// ══════════════════════════════════════════════════════════════════════════

const LazadaAdapter = require('../services/channels/ecom/lazada');

router.get('/lazada/start',
  authenticate, requireTenant, requirePermission('channels.update'),
  async (req, res) => {
    try {
      const { channelId } = req.query;
      const region = String(req.query.region || 'SG').toUpperCase();
      if (!channelId) return res.status(400).json({ error: 'channelId required' });
      const SUPPORTED_LAZADA_REGIONS = ['SG', 'TH', 'PH', 'MY', 'VN', 'ID'];
      if (!SUPPORTED_LAZADA_REGIONS.includes(region)) {
        return res.status(400).json({ error: `Unsupported Lazada region "${region}". Use one of: ${SUPPORTED_LAZADA_REGIONS.join(', ')}.` });
      }

      const channel = await prisma.channel.findFirst({
        where: { id: String(channelId), tenantId: req.tenant.id },
      });
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
      if (channel.type !== 'LAZADA') return res.status(400).json({ error: 'Channel is not Lazada' });

      const [appKey, redirectUri] = await Promise.all([
        settings.get('lazada.appKey'),
        settings.get('lazada.redirectUri'),
      ]);
      if (!appKey) return res.status(400).json({ error: 'lazada.appKey not set in Admin → Settings' });
      if (!redirectUri) return res.status(400).json({ error: 'lazada.redirectUri not set in Admin → Settings' });

      const state = signState({
        provider: 'lazada',
        channelId: channel.id,
        tenantId: req.tenant.id,
        region,
        nonce: crypto.randomBytes(8).toString('hex'),
        exp: Date.now() + STATE_TTL_MS,
      });

      const url = `https://auth.lazada.com/oauth/authorize?` +
        new URLSearchParams({
          response_type: 'code',
          force_auth: 'true',
          redirect_uri: redirectUri,
          client_id: appKey,
          state,
        }).toString();

      res.json({ url, state, region });
    } catch (err) {
      console.error('[oauth/lazada/start]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/v1/oauth/lazada/callback?code=...&state=...
router.get('/lazada/callback', async (req, res) => {
  const { code, state } = req.query;
  const parsed = verifyState(String(state || ''));
  if (!parsed) return res.status(400).send(renderPage('Authorization failed', 'Invalid or expired state.'));
  if (parsed.provider !== 'lazada') return res.status(400).send(renderPage('Authorization failed', 'State/provider mismatch.'));
  if (!code) return res.status(400).send(renderPage('Authorization failed', 'Missing authorization code.'));

  try {
    const adapter = new LazadaAdapter({ region: parsed.region || 'SG' });
    const tokens = await adapter.exchangeAuthCode(String(code));

    const channel = await prisma.channel.findFirst({
      where: { id: parsed.channelId, tenantId: parsed.tenantId },
    });
    if (!channel) throw new Error('Channel no longer exists');

    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        credentials: encryptCredentials({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          refreshExpiresAt: tokens.refreshExpiresAt,
          region: parsed.region || 'SG',
          country: tokens.country || null,
          account: tokens.account || null,
        }),
        syncError: null,
        lastSyncAt: null,
      },
    });

    res.send(renderPage(
      '✓ Connected',
      `Lazada (${tokens.country || parsed.region}) seller <b>${tokens.account || 'account'}</b> linked. You can close this window.`,
      { autoClose: true }
    ));
  } catch (err) {
    console.error('[oauth/lazada/callback]', err.response?.data || err.message);
    try {
      await prisma.channel.updateMany({
        where: { id: parsed.channelId, tenantId: parsed.tenantId },
        data: { syncError: err.response?.data?.message || err.message },
      });
    } catch {}
    res.status(500).send(renderPage('Authorization failed', err.response?.data?.message || err.message));
  }
});

// ══════════════════════════════════════════════════════════════════════════
// SHOPEE — Open Platform OAuth (multi-region, signed callback)
// ══════════════════════════════════════════════════════════════════════════

const ShopeeAdapter = require('../services/channels/ecom/shopee');

router.get('/shopee/start',
  authenticate, requireTenant, requirePermission('channels.update'),
  async (req, res) => {
    try {
      const { channelId } = req.query;
      const region = String(req.query.region || 'SG').toUpperCase();
      if (!channelId) return res.status(400).json({ error: 'channelId required' });
      if (!ShopeeAdapter.REGION_NAMES[region]) {
        return res.status(400).json({ error: `Unsupported Shopee region "${region}".` });
      }

      const channel = await prisma.channel.findFirst({
        where: { id: String(channelId), tenantId: req.tenant.id },
      });
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
      if (channel.type !== 'SHOPEE') return res.status(400).json({ error: 'Channel is not Shopee' });

      const redirectUriBase = await settings.get('shopee.redirectUri');
      if (!redirectUriBase) return res.status(400).json({ error: 'shopee.redirectUri not set in Admin → Settings' });

      // Shopee needs the redirect URL to be an exact match registered in their
      // dashboard. We append our signed `state` as a query param so the
      // callback can pin the channel + tenant + region.
      const state = signState({
        provider: 'shopee',
        channelId: channel.id,
        tenantId: req.tenant.id,
        region,
        nonce: crypto.randomBytes(8).toString('hex'),
        exp: Date.now() + STATE_TTL_MS,
      });
      const sep = redirectUriBase.includes('?') ? '&' : '?';
      const redirectUri = `${redirectUriBase}${sep}state=${encodeURIComponent(state)}`;

      const url = await ShopeeAdapter.buildAuthorizeUrl(redirectUri);
      res.json({ url, state, region });
    } catch (err) {
      console.error('[oauth/shopee/start]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Shopee redirects back with ?code=...&shop_id=... (and our signed state).
router.get('/shopee/callback', async (req, res) => {
  const { code, shop_id, state } = req.query;
  const parsed = verifyState(String(state || ''));
  if (!parsed) return res.status(400).send(renderPage('Authorization failed', 'Invalid or expired state.'));
  if (parsed.provider !== 'shopee') return res.status(400).send(renderPage('Authorization failed', 'State/provider mismatch.'));
  if (!code || !shop_id) return res.status(400).send(renderPage('Authorization failed', 'Missing code or shop_id.'));

  try {
    const adapter = new ShopeeAdapter({ region: parsed.region || 'SG', shopId: shop_id });
    const tokens = await adapter.exchangeAuthCode(String(code), String(shop_id));

    const channel = await prisma.channel.findFirst({
      where: { id: parsed.channelId, tenantId: parsed.tenantId },
    });
    if (!channel) throw new Error('Channel no longer exists');

    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        credentials: encryptCredentials({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          shopId: String(shop_id),
          region: parsed.region || 'SG',
        }),
        syncError: null,
        lastSyncAt: null,
      },
    });

    res.send(renderPage(
      '✓ Connected',
      `Shopee shop <b>${shop_id}</b> (${parsed.region}) linked. You can close this window.`,
      { autoClose: true }
    ));
  } catch (err) {
    console.error('[oauth/shopee/callback]', err.response?.data || err.message);
    try {
      await prisma.channel.updateMany({
        where: { id: parsed.channelId, tenantId: parsed.tenantId },
        data: { syncError: err.response?.data?.message || err.message },
      });
    } catch {}
    res.status(500).send(renderPage('Authorization failed', err.response?.data?.message || err.message));
  }
});

// ══════════════════════════════════════════════════════════════════════════
// MERCADO LIBRE — Latin America OAuth 2.0 (multi-region consent host)
// ══════════════════════════════════════════════════════════════════════════

const MercadoLibreAdapter = require('../services/channels/ecom/mercado-libre');

router.get('/mercadolibre/start',
  authenticate, requireTenant, requirePermission('channels.update'),
  async (req, res) => {
    try {
      const { channelId } = req.query;
      const region = String(req.query.region || 'AR').toUpperCase();
      if (!channelId) return res.status(400).json({ error: 'channelId required' });
      if (!MercadoLibreAdapter.REGION_AUTH_HOSTS[region]) {
        return res.status(400).json({ error: `Unsupported Mercado Libre region "${region}".` });
      }

      const channel = await prisma.channel.findFirst({
        where: { id: String(channelId), tenantId: req.tenant.id },
      });
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
      if (channel.type !== 'MERCADO_LIBRE') return res.status(400).json({ error: 'Channel is not Mercado Libre' });

      const [clientId, redirectUri] = await Promise.all([
        settings.get('mercadolibre.clientId'),
        settings.get('mercadolibre.redirectUri'),
      ]);
      if (!clientId)    return res.status(400).json({ error: 'mercadolibre.clientId not set in Admin → Settings' });
      if (!redirectUri) return res.status(400).json({ error: 'mercadolibre.redirectUri not set in Admin → Settings' });

      const state = signState({
        provider: 'mercadolibre',
        channelId: channel.id,
        tenantId: req.tenant.id,
        region,
        nonce: crypto.randomBytes(8).toString('hex'),
        exp: Date.now() + STATE_TTL_MS,
      });

      const consentHost = MercadoLibreAdapter.REGION_AUTH_HOSTS[region];
      const url = `${consentHost}/authorization?` +
        new URLSearchParams({
          response_type: 'code',
          client_id: clientId,
          redirect_uri: redirectUri,
          state,
        }).toString();

      res.json({ url, state, region });
    } catch (err) {
      console.error('[oauth/mercadolibre/start]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// GET /api/v1/oauth/mercadolibre/callback?code=...&state=...
router.get('/mercadolibre/callback', async (req, res) => {
  const { code, state } = req.query;
  const parsed = verifyState(String(state || ''));
  if (!parsed) return res.status(400).send(renderPage('Authorization failed', 'Invalid or expired state.'));
  if (parsed.provider !== 'mercadolibre') return res.status(400).send(renderPage('Authorization failed', 'State/provider mismatch.'));
  if (!code) return res.status(400).send(renderPage('Authorization failed', 'Missing authorization code.'));

  try {
    const redirectUri = await settings.get('mercadolibre.redirectUri');
    if (!redirectUri) throw new Error('mercadolibre.redirectUri not configured');

    const adapter = new MercadoLibreAdapter({ region: parsed.region || 'AR' });
    const tokens = await adapter.exchangeAuthCode(String(code), redirectUri);

    const channel = await prisma.channel.findFirst({
      where: { id: parsed.channelId, tenantId: parsed.tenantId },
    });
    if (!channel) throw new Error('Channel no longer exists');

    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        credentials: encryptCredentials({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          userId: tokens.userId,
          expiresAt: tokens.expiresAt,
          region: parsed.region || 'AR',
        }),
        syncError: null,
        lastSyncAt: null,
      },
    });

    res.send(renderPage(
      '✓ Connected',
      `Mercado Libre seller <b>${tokens.userId}</b> (${parsed.region}) linked. You can close this window.`,
      { autoClose: true }
    ));
  } catch (err) {
    console.error('[oauth/mercadolibre/callback]', err.response?.data || err.message);
    try {
      await prisma.channel.updateMany({
        where: { id: parsed.channelId, tenantId: parsed.tenantId },
        data: { syncError: err.response?.data?.message || err.message },
      });
    } catch {}
    res.status(500).send(renderPage('Authorization failed', err.response?.data?.message || err.message));
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ALLEGRO — Poland marketplace OAuth 2.0 (sandbox + prod)
// ══════════════════════════════════════════════════════════════════════════

const AllegroAdapter = require('../services/channels/ecom/allegro');

router.get('/allegro/start',
  authenticate, requireTenant, requirePermission('channels.update'),
  async (req, res) => {
    try {
      const { channelId } = req.query;
      const sandbox = String(req.query.sandbox || '').toLowerCase() === 'true';
      if (!channelId) return res.status(400).json({ error: 'channelId required' });

      const channel = await prisma.channel.findFirst({
        where: { id: String(channelId), tenantId: req.tenant.id },
      });
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
      if (channel.type !== 'ALLEGRO') return res.status(400).json({ error: 'Channel is not Allegro' });

      const [clientId, redirectUri] = await Promise.all([
        settings.get('allegro.clientId'),
        settings.get('allegro.redirectUri'),
      ]);
      if (!clientId)    return res.status(400).json({ error: 'allegro.clientId not set in Admin → Settings' });
      if (!redirectUri) return res.status(400).json({ error: 'allegro.redirectUri not set in Admin → Settings' });

      const state = signState({
        provider: 'allegro',
        channelId: channel.id,
        tenantId: req.tenant.id,
        sandbox,
        nonce: crypto.randomBytes(8).toString('hex'),
        exp: Date.now() + STATE_TTL_MS,
      });

      const authHost = sandbox ? AllegroAdapter.SANDBOX_AUTH_HOST : AllegroAdapter.PROD_AUTH_HOST;
      const url = `${authHost}/auth/oauth/authorize?` +
        new URLSearchParams({
          response_type: 'code',
          client_id: clientId,
          redirect_uri: redirectUri,
          state,
        }).toString();

      res.json({ url, state, sandbox });
    } catch (err) {
      console.error('[oauth/allegro/start]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

router.get('/allegro/callback', async (req, res) => {
  const { code, state } = req.query;
  const parsed = verifyState(String(state || ''));
  if (!parsed) return res.status(400).send(renderPage('Authorization failed', 'Invalid or expired state.'));
  if (parsed.provider !== 'allegro') return res.status(400).send(renderPage('Authorization failed', 'State/provider mismatch.'));
  if (!code) return res.status(400).send(renderPage('Authorization failed', 'Missing authorization code.'));

  try {
    const redirectUri = await settings.get('allegro.redirectUri');
    if (!redirectUri) throw new Error('allegro.redirectUri not configured');

    const adapter = new AllegroAdapter({ sandbox: !!parsed.sandbox });
    const tokens = await adapter.exchangeAuthCode(String(code), redirectUri);

    const channel = await prisma.channel.findFirst({
      where: { id: parsed.channelId, tenantId: parsed.tenantId },
    });
    if (!channel) throw new Error('Channel no longer exists');

    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        credentials: encryptCredentials({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          sandbox: !!parsed.sandbox,
        }),
        syncError: null,
        lastSyncAt: null,
      },
    });

    res.send(renderPage(
      '✓ Connected',
      `Allegro seller linked${parsed.sandbox ? ' (sandbox)' : ''}. You can close this window.`,
      { autoClose: true }
    ));
  } catch (err) {
    console.error('[oauth/allegro/callback]', err.response?.data || err.message);
    try {
      await prisma.channel.updateMany({
        where: { id: parsed.channelId, tenantId: parsed.tenantId },
        data: { syncError: err.response?.data?.error_description || err.message },
      });
    } catch {}
    res.status(500).send(renderPage('Authorization failed', err.response?.data?.error_description || err.message));
  }
});

// ══════════════════════════════════════════════════════════════════════════
// WISH — Merchant Platform OAuth 2.0
// ══════════════════════════════════════════════════════════════════════════

const WishAdapter = require('../services/channels/ecom/wish');

router.get('/wish/start',
  authenticate, requireTenant, requirePermission('channels.update'),
  async (req, res) => {
    try {
      const { channelId } = req.query;
      if (!channelId) return res.status(400).json({ error: 'channelId required' });

      const channel = await prisma.channel.findFirst({
        where: { id: String(channelId), tenantId: req.tenant.id },
      });
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
      if (channel.type !== 'WISH') return res.status(400).json({ error: 'Channel is not Wish' });

      const [clientId, redirectUri] = await Promise.all([
        settings.get('wish.clientId'),
        settings.get('wish.redirectUri'),
      ]);
      if (!clientId)    return res.status(400).json({ error: 'wish.clientId not set in Admin → Settings' });
      if (!redirectUri) return res.status(400).json({ error: 'wish.redirectUri not set in Admin → Settings' });

      const state = signState({
        provider: 'wish',
        channelId: channel.id,
        tenantId: req.tenant.id,
        nonce: crypto.randomBytes(8).toString('hex'),
        exp: Date.now() + STATE_TTL_MS,
      });

      const url = `https://merchant.wish.com/v3/oauth/authorize?` +
        new URLSearchParams({
          response_type: 'code',
          client_id: clientId,
          redirect_uri: redirectUri,
          state,
        }).toString();

      res.json({ url, state });
    } catch (err) {
      console.error('[oauth/wish/start]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

router.get('/wish/callback', async (req, res) => {
  const { code, state } = req.query;
  const parsed = verifyState(String(state || ''));
  if (!parsed) return res.status(400).send(renderPage('Authorization failed', 'Invalid or expired state.'));
  if (parsed.provider !== 'wish') return res.status(400).send(renderPage('Authorization failed', 'State/provider mismatch.'));
  if (!code) return res.status(400).send(renderPage('Authorization failed', 'Missing authorization code.'));

  try {
    const redirectUri = await settings.get('wish.redirectUri');
    if (!redirectUri) throw new Error('wish.redirectUri not configured');

    const adapter = new WishAdapter({});
    const tokens = await adapter.exchangeAuthCode(String(code), redirectUri);

    const channel = await prisma.channel.findFirst({
      where: { id: parsed.channelId, tenantId: parsed.tenantId },
    });
    if (!channel) throw new Error('Channel no longer exists');

    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        credentials: encryptCredentials({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        }),
        syncError: null,
        lastSyncAt: null,
      },
    });

    res.send(renderPage(
      '✓ Connected',
      `Wish merchant account linked. You can close this window.`,
      { autoClose: true }
    ));
  } catch (err) {
    console.error('[oauth/wish/callback]', err.response?.data || err.message);
    try {
      await prisma.channel.updateMany({
        where: { id: parsed.channelId, tenantId: parsed.tenantId },
        data: { syncError: err.response?.data?.message || err.message },
      });
    } catch {}
    res.status(500).send(renderPage('Authorization failed', err.response?.data?.message || err.message));
  }
});

// ══════════════════════════════════════════════════════════════════════════
// FLIPKART — OAuth 2.0 authorization code flow
// ══════════════════════════════════════════════════════════════════════════

router.get('/flipkart/start',
  authenticate, requireTenant, requirePermission('channels.update'),
  async (req, res) => {
    try {
      const { channelId } = req.query;
      if (!channelId) return res.status(400).json({ error: 'channelId required' });

      const channel = await prisma.channel.findFirst({
        where: { id: String(channelId), tenantId: req.tenant.id },
      });
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
      if (channel.type !== 'FLIPKART') return res.status(400).json({ error: 'Channel is not Flipkart' });

      const [appId, redirectUri] = await Promise.all([
        settings.get('flipkart.appId'),
        settings.get('flipkart.redirectUri'),
      ]);
      if (!appId) return res.status(400).json({ error: 'flipkart.appId not set in Admin → Settings' });
      if (!redirectUri) return res.status(400).json({ error: 'flipkart.redirectUri not set in Admin → Settings' });

      const state = signState({
        provider: 'flipkart',
        channelId: channel.id,
        tenantId: req.tenant.id,
        nonce: crypto.randomBytes(8).toString('hex'),
        exp: Date.now() + STATE_TTL_MS,
      });

      const url = 'https://api.flipkart.net/oauth-service/oauth/authorize?' +
        new URLSearchParams({
          response_type: 'code',
          client_id: appId,
          redirect_uri: redirectUri,
          scope: 'Seller_Api',
          state,
        }).toString();

      res.json({ url, state });
    } catch (err) {
      console.error('[oauth/flipkart/start]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

router.get('/flipkart/callback', async (req, res) => {
  const { code, state } = req.query;
  const parsed = verifyState(String(state || ''));
  if (!parsed || parsed.provider !== 'flipkart') {
    return res.status(400).send(renderPage('Authorization failed', 'Invalid state.'));
  }
  if (!code) return res.status(400).send(renderPage('Authorization failed', 'Missing authorization code.'));

  try {
    const [appId, appSecret, redirectUri] = await Promise.all([
      settings.get('flipkart.appId'),
      settings.get('flipkart.appSecret'),
      settings.get('flipkart.redirectUri'),
    ]);
    if (!appId || !appSecret) return res.status(500).send(renderPage('Platform not configured', 'flipkart.appId / appSecret not set.'));

    const basic = Buffer.from(`${appId}:${appSecret}`).toString('base64');
    const tokenRes = await axios.post(
      'https://api.flipkart.net/oauth-service/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri,
      }).toString(),
      { headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const { access_token, refresh_token, expires_in } = tokenRes.data;

    const channel = await prisma.channel.findFirst({
      where: { id: parsed.channelId, tenantId: parsed.tenantId },
    });
    if (!channel) throw new Error('Channel no longer exists');

    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        credentials: encryptCredentials({
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt: new Date(Date.now() + (expires_in || 3600) * 1000).toISOString(),
        }),
        syncError: null,
      },
    });

    res.send(renderPage('✓ Connected', 'Flipkart seller account linked. You can close this window.', { autoClose: true }));
  } catch (err) {
    console.error('[oauth/flipkart/callback]', err.response?.data || err.message);
    try {
      await prisma.channel.updateMany({
        where: { id: parsed.channelId, tenantId: parsed.tenantId },
        data: { syncError: err.response?.data?.error_description || err.message },
      });
    } catch {}
    res.status(500).send(renderPage('Authorization failed', err.response?.data?.error_description || err.message));
  }
});

// ══════════════════════════════════════════════════════════════════════════
// META (Facebook / Instagram / WhatsApp) — one App ID for the whole platform
// ══════════════════════════════════════════════════════════════════════════

router.get('/meta/start',
  authenticate, requireTenant, requirePermission('channels.update'),
  async (req, res) => {
    try {
      const { channelId } = req.query;
      if (!channelId) return res.status(400).json({ error: 'channelId required' });

      const channel = await prisma.channel.findFirst({
        where: { id: String(channelId), tenantId: req.tenant.id },
      });
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
      if (!['FACEBOOK', 'INSTAGRAM', 'WHATSAPP_BUSINESS'].includes(channel.type)) {
        return res.status(400).json({ error: 'Channel is not Facebook / Instagram / WhatsApp' });
      }

      const [appId, redirectUri] = await Promise.all([
        settings.get('meta.appId'),
        settings.get('meta.redirectUri'),
      ]);
      if (!appId) return res.status(400).json({ error: 'meta.appId not set in Admin → Settings' });
      if (!redirectUri) return res.status(400).json({ error: 'meta.redirectUri not set in Admin → Settings' });

      // Scopes depend on the channel type
      const scopes = {
        FACEBOOK:          'pages_show_list,pages_manage_metadata,pages_read_engagement,catalog_management,business_management',
        INSTAGRAM:         'instagram_basic,instagram_manage_insights,instagram_shopping_tag_products,pages_show_list,business_management',
        WHATSAPP_BUSINESS: 'whatsapp_business_management,whatsapp_business_messaging,business_management',
      }[channel.type];

      const state = signState({
        provider: 'meta',
        channelType: channel.type,
        channelId: channel.id,
        tenantId: req.tenant.id,
        nonce: crypto.randomBytes(8).toString('hex'),
        exp: Date.now() + STATE_TTL_MS,
      });

      const url = 'https://www.facebook.com/v18.0/dialog/oauth?' +
        new URLSearchParams({
          client_id: appId,
          redirect_uri: redirectUri,
          state,
          scope: scopes,
          response_type: 'code',
        }).toString();

      res.json({ url, state });
    } catch (err) {
      console.error('[oauth/meta/start]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

router.get('/meta/callback', async (req, res) => {
  const { code, state } = req.query;
  const parsed = verifyState(String(state || ''));
  if (!parsed || parsed.provider !== 'meta') return res.status(400).send(renderPage('Authorization failed', 'Invalid state.'));
  if (!code) return res.status(400).send(renderPage('Authorization failed', 'Missing code.'));

  try {
    const [appId, appSecret, redirectUri] = await Promise.all([
      settings.get('meta.appId'),
      settings.get('meta.appSecret'),
      settings.get('meta.redirectUri'),
    ]);
    if (!appId || !appSecret) return res.status(500).send(renderPage('Platform not configured', 'meta.appId / appSecret not set.'));

    // Exchange code → short-lived user access token
    const tokenRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code: String(code),
      },
    });
    const shortToken = tokenRes.data.access_token;

    // Upgrade to long-lived token (60 days)
    const longRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortToken,
      },
    });
    const longToken = longRes.data.access_token;

    const channel = await prisma.channel.findFirst({
      where: { id: parsed.channelId, tenantId: parsed.tenantId },
    });
    if (!channel) throw new Error('Channel no longer exists');

    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        credentials: encryptCredentials({
          // Meta adapters read `accessToken`. Store both names so the long-lived
          // user token is available if adapters need to distinguish later.
          accessToken: longToken,
          userAccessToken: longToken,
          channelType: parsed.channelType,
          // pageId / phoneNumberId / businessAccountId still need a post-OAuth
          // "pick your page/number" step — left blank for now.
        }),
        syncError: null,
      },
    });

    res.send(renderPage('✓ Connected', `${parsed.channelType} account linked. You can close this window.`, { autoClose: true }));
  } catch (err) {
    console.error('[oauth/meta/callback]', err.response?.data || err.message);
    try {
      await prisma.channel.updateMany({
        where: { id: parsed.channelId, tenantId: parsed.tenantId },
        data: { syncError: err.response?.data?.error?.message || err.message },
      });
    } catch {}
    res.status(500).send(renderPage('Authorization failed', err.response?.data?.error?.message || err.message));
  }
});

module.exports = router;
