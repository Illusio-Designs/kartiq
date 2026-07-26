# Kartriq API Integration Guide

**How to connect Kartriq to sales & logistics channels like Amazon, Myntra, Flipkart, Shopify, Shiprocket, and 50+ others.**

This is a practical, end-to-end guide. It covers what happens under the hood, the two connection models (OAuth vs. API keys), the one-time platform setup a founder/admin does, and the per-channel steps a seller does in the dashboard.

---

## 1. How integrations work (the mental model)

Kartriq is **adapter-based**. For every channel a tenant connects, there is exactly **one `channels` row** in the database. That row holds:

- `type` — which channel (e.g. `AMAZON`, `MYNTRA`, `SHIPROCKET`)
- `category` — one of 14 categories (`ECOM`, `QUICKCOM`, `LOGISTICS`, `OWNSTORE`, `SOCIAL`, `B2B`, `CUSTOM`, `ACCOUNTING`, `POS_SYSTEM`, `PAYMENT`, `TAX`, `CRM`, `RETURNS`, `FULFILLMENT`)
- `credentials` — the channel's API secrets, **AES‑256‑GCM encrypted** (never stored or returned in plaintext)

At runtime, `getAdapter(channel)` in `backend/src/services/channel.service.js` decrypts the credentials and instantiates the right adapter class (one per channel `type`, organized under `backend/src/services/channels/<category>/`). Every adapter implements a common interface:

| Method | Purpose |
|---|---|
| `testConnection()` | Verify credentials work |
| `fetchOrders(since)` | Pull new orders from the channel |
| `updateInventoryLevel(sku, qty)` | Push stock to the channel |
| `updateListing(sku, fields)` | Update price/listing data |
| `parseWebhook(body)` / `validateWebhookSignature(...)` | Handle real-time push events |
| `getRates` / `createShipment` / `trackShipment` (logistics) | Shipping operations |

### Data flow

```
                 orders  ────────►
  Marketplace  ──(poll every 5m OR webhook)──►  Kartriq
  (Amazon,                                        │
   Myntra, …)  ◄──inventory (push every 15m)──────┘
                 tracking ──(poll every 10m)──►  Kartriq
```

- **Orders flow IN** — pulled on a cron every ~5 min, or pushed instantly via webhooks.
- **Inventory flows OUT** — Kartriq pushes available stock to each channel every ~15 min.
- **Tracking flows IN** — shipment status polled every ~10 min.

Cron intervals live in `backend/src/jobs/cron.job.js` and are tunable via env (`CRON_ORDER_SYNC_MIN`, `CRON_INVENTORY_MIN`, `CRON_TRACKING_MIN`).

---

## 2. Two connection models

Which one a channel uses is determined by its catalog entry in `backend/src/data/channel-catalog.js`.

### Model A — OAuth ("Connect with…" popup)

The tenant clicks **Connect**, a provider login popup opens, they approve, and a per-seller token is stored back on their `channels` row automatically. **No copy-pasting of secrets.**

Used by: **Amazon (SP‑API)**, **Shopify**, **Flipkart**, **Meta** (Instagram / Facebook / WhatsApp), **Lazada**, **Shopee**, **Mercado Libre**, **Allegro**, **Wish**.

**Prerequisite:** the founder/admin must register *one* developer app per provider and enter its client ID/secret in **Admin → Settings** (see §4). This is a one-time platform setup, not per seller.

### Model B — API keys (paste form)

The tenant pastes credentials (API key, secret, token, store URL, etc.) into a form. The fields are driven by the channel's `credentialsSchema` in the catalog. Kartriq encrypts them and calls `testConnection()`.

Used by: most **logistics** partners (**Shiprocket**, **Delhivery**, **Bluedart**, **Xpressbees**…), **WooCommerce**, and marketplaces that issue static API keys.

### Model C — Manual / webhook-only

`OFFLINE`, `POS`, `WHOLESALE`, `DISTRIBUTOR`, `OTHER` use a no-op adapter (manual entry). `CUSTOM_WEBHOOK`, `WEBSITE`, `B2B_PORTAL` receive orders via an inbound webhook URL with no credentials required.

> **Note on Myntra & Meesho:** these are marketplaces where onboarding is invite/approval-based and API access is granted per seller. In Kartriq they appear in the catalog; connecting uses the paste-form (Model B) once you have partner API credentials, or they may be marked "request integration" if your account tier doesn't yet include them. Check the channel's status badge in the catalog (§3).

---

## 3. Connecting a channel from the dashboard (seller steps)

This is the common path for every channel.

1. **Go to `Channels`** in the dashboard (`/channels`). You'll see the catalog grouped by category with a search box.
2. **Find your channel** (e.g. "Amazon", "Myntra") and check its status badge:
   - **Available** — you can connect now.
   - **Connected** — already linked.
   - **Plan locked** — your plan doesn't include this category; upgrade required (returns HTTP 402 with the required plan).
   - **Not available / Coming soon** — click **Request** to file an integration request.
3. **Click Connect.** Kartriq creates the `channels` row (`channelApi.create({ name, type, category })`) and opens the **Connect** modal.
4. **Complete the connection:**
   - **OAuth channel** → click "Connect with Amazon/Shopify/…", approve in the popup. The modal polls until it shows **Connected**.
   - **API-key channel** → fill the form fields and **Save**. Kartriq encrypts them and runs a live `testConnection()`.
5. **Verify** on the channel detail page (`/channels/[id]`): you'll see a **Connected** badge, `lastSyncAt`, and a `syncError` banner if anything failed.
6. **Map your SKUs** (listings tab) so the channel's SKU maps to your product/variant. Orders and inventory sync rely on this mapping (`channel_listings` table, unique on `channelId + channelSku`).
7. **First sync:** click **Sync orders** / **Sync inventory** to run immediately, or let the cron pick it up.

### Relevant API methods (`frontend/lib/api.ts`)

```
channelApi.catalog()               // GET /channels/catalog
channelApi.create({name,type,category})
channelApi.connect(id, credentials) // POST /channels/:id/connect  (paste-form)
channelApi.test(id)                 // GET  /channels/:id/test
channelApi.syncOrders(id)           // POST /channels/:id/sync/orders
channelApi.syncInventory(id)        // POST /channels/:id/sync/inventory
oauthApi.amazonStart(id) / shopifyStart(id) / flipkartStart(id) / metaStart(id) …
oauthApi.status(provider, channelId)
```

---

## 4. One-time platform setup (founder/admin)

OAuth channels won't work until the founder registers a developer app per provider and stores its credentials. These are **platform-level app secrets** (shared by all tenants), kept in the `platform_settings` table (secret rows AES‑encrypted), with a `process.env` fallback.

Set them in **Admin → Settings** (`/admin/settings`), or via env vars.

| Provider | Settings keys (env fallback in CAPS) | Where to register |
|---|---|---|
| Amazon SP‑API | `amazon.appId`, `amazon.clientId`, `amazon.clientSecret`, `amazon.redirectUri` | Amazon Seller Central → Develop Apps (SP‑API + LWA) |
| Shopify | `shopify.apiKey`, `shopify.apiSecret`, `shopify.redirectUri`, `shopify.scopes` | Shopify Partners → Apps |
| Flipkart | `flipkart.appId`, `flipkart.appSecret`, `flipkart.redirectUri` | Flipkart Seller API portal |
| Meta (IG/FB/WA) | `meta.appId`, `meta.appSecret`, `meta.redirectUri` | Meta for Developers → App |
| Lazada / Shopee / etc. | `lazada.appKey`, `shopee.redirectUri`, … | Respective open-platform consoles |

### Redirect / callback URL format

Every OAuth provider must be configured with this callback (replace the host with your deployment domain, from `PUBLIC_API_URL`):

```
https://YOUR-DOMAIN/api/v1/oauth/<provider>/callback

e.g.  https://app.kartriq.com/api/v1/oauth/amazon/callback
      https://app.kartriq.com/api/v1/oauth/shopify/callback
```

### Webhook URL format (for real-time order push)

Give this to the marketplace's webhook settings. The `:id` is the channel row's ID (shown on the channel detail page as `webhookUrl`):

```
https://YOUR-DOMAIN/api/v1/webhooks/channels/<channelId>
```

Kartriq verifies the signature (`x-shopify-hmac-sha256`, `x-amz-signature`, `x-hub-signature-256`, etc.) before importing.

### Required environment variables

| Var | Purpose |
|---|---|
| `ENCRYPTION_KEY` | 64‑hex chars (32 bytes) — encrypts all channel credentials. **Required.** |
| `JWT_SECRET` | Also signs the OAuth `state` blob (15‑min TTL). |
| `PUBLIC_API_URL` | Base URL used to build callback & webhook URLs. |
| `CHANNEL_MODE` | `sandbox` or `production` (selects API base URLs). |
| `CRON_ORDER_SYNC_MIN` / `CRON_INVENTORY_MIN` / `CRON_TRACKING_MIN` | Sync intervals (default 5 / 15 / 10 min). |

---

## 5. Channel-by-channel quick reference

### Amazon (SP‑API) — OAuth
- **Model:** OAuth. Founder registers one SP‑API app (LWA client ID/secret) in Seller Central; each seller authorizes via `/oauth/amazon/start`.
- **Region-aware:** channel `type` maps to region (`AMAZON`→IN, `AMAZON_US`→US, …); marketplace IDs in `backend/src/config/channel-endpoints.js` (IN = `A21TJRUUN4KGV`).
- **Stored per seller:** `{ sellerId, refreshToken, region }`. Access tokens are minted on demand via LWA refresh.
- **Orders:** `GET /orders/v0/orders`. **Inventory:** requires the Feeds API (roadmap). **Reviews:** Solicitations API.
- **Amazon MCF / Smart Biz** fulfillment endpoints: `POST /channels/:id/mcf/fulfill`, `/mcf/track/:orderNumber`, `/mcf/inventory`.

### Myntra — paste-form / request
- **Model:** API keys (Model B) once you have Myntra partner/seller API credentials, or **Request integration** if not yet enabled for your plan.
- Onboarding is approval-based on Myntra's side; obtain seller API access from your Myntra partner manager, then paste the credentials into the Connect form. SKU mapping in the listings tab is required for order/inventory sync.

### Flipkart — OAuth
- Founder registers a Flipkart Seller API app; scope `Seller_Api`. Sellers authorize via `/oauth/flipkart/start`. Stored: `{ accessToken, refreshToken, expiresAt }`.

### Shopify (own store) — OAuth
- `?shop=yourstore.myshopify.com` → approve → stores `{ shopUrl, accessToken, scope }`.
- Default scopes: read/write products, orders, inventory. API base `https://{shop}/admin/api/2024-01`.

### WooCommerce — paste-form
- Paste store URL + consumer key/secret from WooCommerce → Settings → Advanced → REST API.

### Shiprocket (logistics) — paste-form
- Email/password → Kartriq exchanges for a 10‑day token. Supports `getRates`, `createShipment` (`/orders/create/adhoc`), `trackShipment`, `cancelShipment`, `getPickupLocations`.

### Delhivery (logistics) — paste-form
- API token (`Token {token}` header). Supports `checkServiceability`, `createShipment` (waybill), `trackShipment`.

### Instagram / Facebook / WhatsApp Business (social) — OAuth (Meta)
- One Meta app covers all three. Short-lived token is exchanged for a 60‑day long-lived token. WhatsApp orders arrive via `parseWebhook` (order-type messages); no order polling.

> For the full up-to-date channel matrix and status legend, see [`docs/CHANNELS.md`](./CHANNELS.md). The two definitive registries in code are the `channels.type` ENUM in `backend/src/config/schema.sql.js` and the `getAdapter` switch in `backend/src/services/channel.service.js`.

---

## 6. Adding a brand-new channel (developer steps)

If a channel isn't in the catalog yet:

1. **Add the `type`** to the `channels.type` ENUM in `backend/src/config/schema.sql.js` (and a migration in `backend/src/bootstrap/initDb.js` if the table already exists).
2. **Add a catalog entry** in `backend/src/data/channel-catalog.js` — set `type`, `category`, `name`, `integrated: true`, `features`, and a `credentialsSchema` (drives the Connect form) or mark it OAuth.
3. **Register the category** for the type in `CHANNEL_CATEGORY` in `backend/src/services/channel.service.js`.
4. **Write the adapter** under `backend/src/services/channels/<category>/yourchannel.js`, extending `BaseAdapter` from `_base.js`. Implement at minimum `testConnection`, `fetchOrders`, and (for sales channels) `updateInventoryLevel`; for logistics implement `getRates`/`createShipment`/`trackShipment`.
5. **Add it to the `getAdapter` switch** and the category barrel `index.js`.
6. **OAuth?** Add `/start` + `/callback` handlers in `backend/src/routes/oauth.routes.js` and the provider's app secrets to `platform_settings` / env.
7. **Webhooks?** Ensure `parseWebhook` + `validateWebhookSignature` are implemented so `POST /webhooks/channels/:id` can accept push events.
8. **Frontend:** the catalog page and Connect modal render automatically from the catalog entry — no page changes needed unless you add a custom flow.

---

## 7. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `syncError` banner on channel detail | Bad/expired credentials — re-run **Connect** / **Update credentials**, then **Test**. |
| OAuth popup shows an error page | Founder app secrets missing in Admin → Settings, or the redirect URL registered with the provider doesn't match `https://YOUR-DOMAIN/api/v1/oauth/<provider>/callback`. |
| Orders not importing | Check SKU mapping in the listings tab; unmapped SKUs are skipped. Confirm `lastSyncAt` is advancing (cron running, `DISABLE_CRON` not set). |
| Inventory not updating on channel | Adapter must implement `updateInventoryLevel`; some channels (e.g. Amazon) need the Feeds API which may be pending. |
| Webhook events rejected | Signature mismatch — verify the `webhookSecret` and that the marketplace is configured with the exact webhook URL. |
| HTTP 402 when connecting | Plan limit / category locked — upgrade the tenant's plan. |

---

### Related docs
- [`docs/CHANNEL_REGISTRATION.md`](./CHANNEL_REGISTRATION.md) — step-by-step: how to register / get API credentials on each channel's own portal.
- [`docs/INTEGRATIONS.md`](./INTEGRATIONS.md) — deep platform-OAuth setup and per-provider registration.
- [`docs/CHANNELS.md`](./CHANNELS.md) — full channel inventory matrix and status legend.
- [`docs/CHANNEL_ROADMAP.md`](./CHANNEL_ROADMAP.md) — planned/pending channels.
