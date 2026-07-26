# Kartriq Channel Registration Guide

**Step-by-step: how to register / get API credentials on each channel's own portal, and where to plug them into Kartriq.**

This is the companion to [`API_INTEGRATION_GUIDE.md`](./API_INTEGRATION_GUIDE.md). That guide explains *how* connections work inside Kartriq; **this doc is the checklist for the external paperwork** — registering a developer app, getting keys, and passing marketplace approval — one section per channel.

---

## How to read this doc

Each channel is one of two kinds:

- **🔐 OAuth channel** — you (the platform owner / founder) register **one** developer app per provider and paste its client ID/secret into **Admin → Settings** once. Sellers then just click "Connect with…" — they never see a secret. Do this setup a single time.
- **📋 API-key channel** — there's no platform app to register. Each **seller** obtains their own API credentials from the marketplace and pastes them into Kartriq's Connect form. Your job as platform owner is mostly to tell sellers where to get the keys (this doc).

Some marketplaces (Myntra, Meesho, Nykaa, Flipkart…) are **⚠️ approval-gated**: the seller must apply and be approved before any API access is granted. Budget days-to-weeks for those.

### Values you'll reuse everywhere

Replace `YOUR-DOMAIN` with your deployment host (the value of `PUBLIC_API_URL`).

| Purpose | Value |
|---|---|
| **OAuth callback / redirect URL** | `https://YOUR-DOMAIN/api/v1/oauth/<provider>/callback` |
| **Inbound webhook URL** (per channel) | `https://YOUR-DOMAIN/api/v1/webhooks/channels/<channelId>` |
| **Where platform app secrets go** | Admin → Settings (`/admin/settings`), or env vars |

> Env fallback rule: a setting key like `amazon.clientId` falls back to env var `AMAZON_CLIENTID` (dot → underscore, uppercased). So `shopify.apiSecret` → `SHOPIFY_APISECRET`.

---

# 🔐 OAuth channels (one-time platform setup)

## 1. Amazon (SP‑API) — `provider = amazon`

**Callback to register:** `https://YOUR-DOMAIN/api/v1/oauth/amazon/callback`
**Kartriq settings:** `amazon.appId`, `amazon.clientId`, `amazon.clientSecret`, `amazon.redirectUri`

1. **Account:** Use a **Professional** selling account in your target region (e.g. Amazon.in). Sign in to **Seller Central**.
2. **Register as a developer:** **Apps & Services → Develop Apps** → complete the **Developer Profile**. Choose **Public developer** (you serve multiple sellers). Fill the data-security questionnaire (Kartriq encrypts credentials AES‑256‑GCM). **Submit and wait for approval** (days → weeks).
3. **Create the app:** **Develop Apps → Add new app client** → API type **SP API** → app name "Kartriq".
4. **Request roles** (only what you use):
   - Orders + Inventory and Order Tracking → pulling orders
   - Product Listing → inventory/listing updates
   - Notifications → webhooks
   - Direct-to-Consumer Shipping → shipping / MCF
   - Roles touching buyer **PII** are *restricted* and need justification in review.
5. **Get LWA credentials:** on the app, **LWA credentials → View** → copy **Client ID** (`amazon.clientId`) and **Client Secret** (`amazon.clientSecret`). The **App ID** on the app row → `amazon.appId`.
6. **Set the redirect URI** in the app's OAuth settings to the callback above (must match `amazon.redirectUri` exactly).
7. **No AWS/IAM needed** — SP‑API dropped the SigV4/IAM requirement; LWA credentials are enough.
8. **Test:** Draft apps can be self-authorized (**Authorize** button) with your own seller account before you publish to the Appstore.

## 2. Flipkart — `provider = flipkart` ⚠️ approval-gated

**Callback:** `https://YOUR-DOMAIN/api/v1/oauth/flipkart/callback`
**Kartriq settings:** `flipkart.appId`, `flipkart.appSecret`, `flipkart.redirectUri`

1. Log in to the **Flipkart Seller Portal** and get **Seller API** access approved for your account.
2. Register an app in the Flipkart Seller API console → obtain **Application ID** (`flipkart.appId`) and **Application Secret** (`flipkart.appSecret`).
3. Register the callback URL above as the redirect URI (`flipkart.redirectUri`).
4. Scope used by Kartriq: `Seller_Api`. Docs: `https://seller.flipkart.com/api-docs/`.

## 3. Shopify — `provider = shopify`

**Callback:** `https://YOUR-DOMAIN/api/v1/oauth/shopify/callback`
**Kartriq settings:** `shopify.apiKey`, `shopify.apiSecret`, `shopify.redirectUri`, `shopify.scopes`

1. Create a **Shopify Partner** account → **Apps → Create app**.
2. Copy the **API key** (`shopify.apiKey`) and **API secret** (`shopify.apiSecret`).
3. Add the callback above under **App setup → Allowed redirection URL(s)** (`shopify.redirectUri`).
4. Scopes (`shopify.scopes`) — default is `read_products,write_products,read_orders,write_orders,read_inventory,write_inventory`. Set the same list in the app's requested scopes.
5. When a seller connects they enter their `*.myshopify.com` store URL; the connect flow requires `?shop=`.

## 4. Meta — Instagram / Facebook / WhatsApp Business — `provider = meta`

**Callback:** `https://YOUR-DOMAIN/api/v1/oauth/meta/callback`
**Kartriq settings:** `meta.appId`, `meta.appSecret`, `meta.redirectUri`

1. **Meta for Developers → My Apps → Create App** (Business type). One app covers Instagram, Facebook, and WhatsApp.
2. Copy **App ID** (`meta.appId`) and **App Secret** (`meta.appSecret`).
3. Add the callback above under **Facebook Login → Valid OAuth Redirect URIs** (`meta.redirectUri`).
4. Add the products you need (Instagram Graph API, WhatsApp, Facebook Login). Kartriq requests per-channel scopes automatically (e.g. WhatsApp: `whatsapp_business_management`, `whatsapp_business_messaging`; Instagram: `instagram_basic`, `instagram_manage_insights`, `instagram_shopping_tag_products`).
5. Kartriq exchanges the short-lived token for a 60‑day long-lived token. WhatsApp orders arrive via webhook (Graph verify challenge is handled at `GET /webhooks/channels/:id`).
6. Going live to non-test users requires Meta **App Review** for the requested permissions.

## 5. Other global marketplaces (OAuth)

Same pattern — register one app, paste ID/secret, set the callback `https://YOUR-DOMAIN/api/v1/oauth/<provider>/callback`:

| Channel | provider | Kartriq settings | Register at |
|---|---|---|---|
| Lazada | `lazada` | `lazada.appKey`, `lazada.redirectUri` | Lazada Open Platform |
| Shopee | `shopee` | `shopee.redirectUri` (+ partner key/id) | Shopee Open Platform |
| Mercado Libre | `mercadolibre` | `mercadolibre.clientId`, `mercadolibre.redirectUri` | Mercado Libre Developers |
| Allegro | `allegro` | `allegro.clientId`, `allegro.redirectUri` | Allegro Developer (sandbox flag supported) |
| Wish | `wish` | `wish.clientId`, `wish.redirectUri` | Wish Merchant / Developer |

---

# 📋 API-key channels (per-seller credentials)

No platform app to register — the seller gets their own keys and pastes them into **Channels → [channel] → Connect**. Below is exactly what each Connect form asks for and where the seller obtains it.

## Marketplaces (⚠️ most are approval-gated)

### Myntra — apply at `https://vendorhub.myntra.com`
Onboarding is invite/approval-based. Once approved as a Myntra vendor with API access, the seller enters:
| Field | Where to get it |
|---|---|
| Supplier ID | Myntra Vendor Hub account |
| API Key | Vendor Hub → API/Integrations |
| Secret Key | Vendor Hub → API/Integrations |

### Meesho — apply at `https://supplier.meesho.com`
| Field | Where to get it |
|---|---|
| API Key | Meesho Supplier Panel → API access (approval required) |

Docs: `https://supplier.meesho.com/api`.

### Nykaa — seller-approval required
| Field | Where to get it |
|---|---|
| Seller ID | Nykaa seller account |
| (plus API key/secret as issued) | Nykaa seller onboarding/API team |

> Other approval-gated marketplaces (Ajio, Tata CLiQ, JioMart, Snapdeal, etc.) follow the same shape — apply on their seller portal, get keys, paste into the Connect form. The exact fields are defined per channel in `backend/src/data/channel-catalog.js` (`credentialsSchema`).

## Own-store platforms

### WooCommerce
| Field | Where to get it |
|---|---|
| Store URL (e.g. `https://mystore.com`) | the seller's site |
| Consumer Key | WooCommerce → Settings → Advanced → REST API → Add key (Read/Write) |
| Consumer Secret | same screen |

### Magento / Adobe Commerce
| Field | Where to get it |
|---|---|
| Store Base URL | the seller's Magento site |
| REST Access Token | Magento Admin → System → Integrations → create integration → Access Token |

## Logistics partners

### Shiprocket — sign up at `https://app.shiprocket.in/register`
| Field | Where to get it |
|---|---|
| Shiprocket Email | Shiprocket account login |
| Shiprocket Password | Shiprocket account password |

Kartriq exchanges these for a ~10‑day API token automatically. Docs: `https://apidocs.shiprocket.in/`.

### Delhivery — portal `https://app.delhivery.com`
| Field | Where to get it |
|---|---|
| API Token | Delhivery panel → API/Integration settings (request from your Delhivery account manager) |

Docs: `https://dev.delhivery.com/docs`.

> Other logistics aggregators (Fship, Bluedart, Xpressbees, NimbusPost, iThink, Shipway, etc.) are the same paste-form pattern — usually a single **API Key** or token from the courier's dashboard. Check the channel's Connect form for the exact fields.

---

## After registration — connecting in Kartriq

Once credentials exist (OAuth app configured, or seller keys in hand):

1. **Channels** → find the channel → **Connect**.
2. OAuth channel → approve in the popup; API-key channel → paste the fields above → **Save** (Kartriq runs a live `testConnection()`).
3. **Map SKUs** in the listings tab so orders/inventory sync.
4. **Test** and **Sync orders** on the channel detail page.

See [`API_INTEGRATION_GUIDE.md §3`](./API_INTEGRATION_GUIDE.md) for the full connect flow and troubleshooting.

---

## Registration checklist (quick reference)

| Channel | Kind | Register / apply at | Kartriq settings or fields |
|---|---|---|---|
| Amazon SP‑API | 🔐 OAuth | Seller Central → Develop Apps | `amazon.appId/clientId/clientSecret/redirectUri` |
| Flipkart | 🔐 OAuth ⚠️ | Flipkart Seller API portal | `flipkart.appId/appSecret/redirectUri` |
| Shopify | 🔐 OAuth | Shopify Partners | `shopify.apiKey/apiSecret/redirectUri/scopes` |
| Meta (IG/FB/WA) | 🔐 OAuth | Meta for Developers | `meta.appId/appSecret/redirectUri` |
| Lazada / Shopee / MercadoLibre / Allegro / Wish | 🔐 OAuth | provider open platform | see table above |
| Myntra | 📋 ⚠️ | vendorhub.myntra.com | Supplier ID, API Key, Secret Key |
| Meesho | 📋 ⚠️ | supplier.meesho.com | API Key |
| Nykaa | 📋 ⚠️ | Nykaa seller onboarding | Seller ID (+ keys) |
| WooCommerce | 📋 | seller's WordPress site | Store URL, Consumer Key, Consumer Secret |
| Magento | 📋 | seller's Magento admin | Base URL, REST Access Token |
| Shiprocket | 📋 | app.shiprocket.in/register | Email, Password |
| Delhivery | 📋 | app.delhivery.com | API Token |

The definitive per-channel field list is always `credentialsSchema` in `backend/src/data/channel-catalog.js`; the OAuth provider list is `backend/src/routes/oauth.routes.js`.
