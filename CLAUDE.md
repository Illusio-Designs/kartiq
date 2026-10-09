# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (`/backend`)
```bash
npm run dev                  # Start dev server (port 5001) — auto-migrates + seeds on boot
npm start                    # Production start
npm run db:seed              # Run seed manually
npm run db:studio            # Prisma Studio GUI (port 5555)
npm run test:all             # ONE command: runs every check + writes backend/test-report/report.html
npm run test:amazon-shipping # Amazon FBA/MFN: Confirm → label → shipment status (Amazon Easy Ship / Buy Shipping / own courier), packing slips (fake Amazon + fake couriers)
npm run test:backend         # Run e2e test suite (requires server running)
npm run test:backend:server  # Start server with rate limits disabled (for tests)
npm run cron:run             # Run background sync jobs
npm run billing:run          # Run billing/metering jobs
```

### Frontend (`/frontend`)
```bash
npm run dev    # Start Next.js dev server (port 3000)
npm run build  # Production build
npm run lint   # ESLint
```

### Mobile (`/mobile`)
```bash
npm start      # Start Expo dev server
npm run ios    # iOS simulator
npm run android
```

### Running Tests
```bash
# Terminal 1
cd backend && DISABLE_RATE_LIMIT=true npm run test:backend:server

# Terminal 2
cd backend && npm run test:backend
```

Tests are vanilla Node.js `http.request` (no framework). To run a subset, comment out test groups in `backend/src/scripts/test.js`.

---

## Architecture

Kartriq is a multi-tenant SaaS ERP for omnichannel inventory and order management (Amazon, Shopify, Flipkart, 50+ channels). It is a monorepo with three packages: `backend` (Express.js), `frontend` (Next.js 14), and `mobile` (Expo/React Native).

### Stack
- **Backend**: Node.js + Express, Knex.js query builder, MySQL
- **Frontend**: Next.js 14 App Router, Zustand, React Query, Axios
- **Database**: MySQL (XAMPP locally). Schema bootstrap is raw SQL via `backend/src/config/schema.sql.js`

### The "Prisma" Shim
`backend/src/utils/prisma.js` is **not real Prisma ORM** — it is a custom Knex-based shim that exposes a Prisma-like API (`prisma.model.findMany`, `.create`, `.update`, etc.) backed by raw SQL. All routes use this shim. Do not install or use actual Prisma ORM for queries; use the shim or `backend/src/utils/db.js` (raw Knex) directly.

When creating a record via the shim, only pass fields that exist as columns in the DB table (`schema.sql.js` is the source of truth). Unknown fields are silently inserted as columns and will cause a DB error if the column doesn't exist.

### Multi-Tenancy & RBAC
Every resource is scoped to a `tenant`. The middleware in `backend/src/middleware/auth.middleware.js` attaches `req.tenant`, `req.user`, `req.plan`, and `req.permissions` to every authenticated request. All DB queries must filter by `tenantId`.

Permission model: **User → Roles → Permissions** (e.g., `products.create`, `orders.view`). Wildcard `*` = full access. Platform admins (founders) can pass `x-tenant-id` header to impersonate any tenant. Permission checks are cached in-process with a 10s TTL; cache is invalidated on logout.

### Auth Flow
- JWT (7-day expiry, stored in `localStorage` on the client)
- Email/password (bcryptjs) or Google Identity Services (verified server-side via `OAuth2Client`)
- Dev bypass: set `DEV_AUTH_BYPASS=true` and use `Authorization: Bearer dev:<email>` — only works with seeded users

### Database Bootstrap
On every `npm run dev`, `backend/src/bootstrap/initDb.js` runs:
1. Executes all `CREATE TABLE IF NOT EXISTS` from `schema.sql.js`
2. Applies additive column migrations (`ALTER TABLE ADD COLUMN IF NOT EXISTS`)
3. Checks row counts in `plans`, `users` — if empty, runs `seed.js`

Seed is idempotent (upserts). To force a re-seed, delete `backend/.seed-state.json` and restart.

**Schema changes**: Edit `schema.sql.js` for new tables, or add `ALTER TABLE` statements to `initDb.js` for new columns. Restart dev server to apply.

### Plan & Billing
Plans differ only by price, feature flags and allowed channel categories — there are **no usage limits** (SKUs, users, warehouses, roles, channels and orders are unlimited) and **no Pay-As-You-Go / wallet / overage billing**; `enforceLimit()`, the wallet service, usage meters and the `tenant_wallets` / `wallet_transactions` / `usage_meters` tables were removed (`initDb.js` drops them on boot). Feature flags gate entire modules via `requireFeature()`, and `features.channelCategories` gates which channel categories a plan can connect. Plan payment is Razorpay checkout; saved cards drive auto-renewal (`billing.job.js`). Referral rewards are only recorded on the `referrals` row for manual settlement.

### Channel Integrations
Channels fall into categories: e-commerce (Amazon SP-API OAuth, Shopify OAuth), social (Instagram, WhatsApp), logistics (Shiprocket, Delhivery — tracking only), POS, and B2B. Channel API credentials are stored AES-256-GCM encrypted (`backend/src/utils/crypto.js`) using `ENCRYPTION_KEY`. Background jobs in `backend/src/jobs/cron.job.js` poll channels for orders and push inventory updates.

**Amazon** is a single `AMAZON` catalog entry covering every country (Region selector; 21 marketplaces in `config/channel-endpoints.js`). Amazon FBA (`AMAZON_FBA`) and Smart Biz (`AMAZON_SMARTBIZ`, India only) are add-ons on that card (`groupedUnder: 'AMAZON'`, hidden from the list): `POST /channels/:id/amazon-addons` creates them reusing the parent's encrypted credentials. Legacy `AMAZON_<REGION>` channel types still resolve in `channel.service.js` / `oauth.routes.js` for existing rows.

### Key Files
| File | Purpose |
|------|---------|
| `backend/src/index.js` | Express app entry, route registration, global error handler |
| `backend/src/middleware/auth.middleware.js` | JWT verify, permission/plan-feature enforcement |
| `backend/src/bootstrap/initDb.js` | DB auto-migrate + conditional seed |
| `backend/src/config/schema.sql.js` | All `CREATE TABLE` statements — source of truth for column names |
| `backend/src/utils/prisma.js` | Knex-backed Prisma-like shim (not real Prisma) |
| `backend/src/utils/db.js` | Raw Knex instance |
| `backend/src/utils/crypto.js` | AES-256-GCM encrypt/decrypt for channel credentials |
| `backend/src/scripts/seed.js` | Idempotent seeder (plans, admin user, sample data) |
| `backend/src/scripts/test.js` | e2e test suite |
| `frontend/store/auth.store.ts` | Zustand store: user, token, tenant, plan, permissions |
| `frontend/lib/api.ts` | Axios instance + all typed API methods |

### Adding a Route
1. Create `backend/src/routes/foo.routes.js` with `authenticate`, `requireTenant`, `requirePermission('foos.view')` middleware chain
2. Always filter queries by `req.tenant.id`
3. Register in `backend/src/index.js`: `app.use(\`${api}/foos\`, fooRoutes)`
4. Add table to `schema.sql.js` if needed; add the corresponding `api.ts` method in the frontend

### Frontend Data Flow
- `frontend/lib/api.ts`: Axios instance auto-attaches JWT from `localStorage`; 401 responses redirect to `/login`; 402 responses redirect to `upgradeUrl` when the backend sends one (trial/past-due lockout, plan-feature gate)
- `frontend/store/auth.store.ts`: Populated after login via `/auth/me`; `hasPermission()` and `hasFeature()` are used throughout pages to conditionally render UI

### Auth Self-Service Endpoints
These endpoints let the currently-logged-in user update their own data without requiring admin permissions:

| Endpoint | Purpose |
|---|---|
| `PATCH /auth/me` | Update own `name` and `phone` |
| `POST /auth/change-password` | Change own password (requires `currentPassword`, `newPassword`) — returns 400 if wrong current password or if account is OAuth-only |
| `PATCH /billing/tenant` | Update tenant `businessName` and `gstin` — requires `billing.manage` |

The settings page (`frontend/app/settings/page.tsx`) wires these: profile tab → `authApi.updateMe`, company tab → `billingApi.updateTenant`, security tab → `authApi.changePassword`, notifications tab → `localStorage`.

---

## API Response Shape Contracts

All LIST endpoints must return a consistent envelope. **Do not return bare arrays** — the frontend relies on this shape:

| Resource | Response shape |
|---|---|
| orders | `{ orders, total, page, limit }` |
| products | `{ products, total }` |
| inventory | `{ items, total, page, limit }` |
| customers | `{ customers, total }` |
| invoices | `{ invoices, total }` |
| shipments | `{ shipments, total, page, limit }` |
| movements | `{ movements, total, page, limit }` |
| vendors | plain array `[...]` (no pagination — always fetches all) |
| warehouses | plain array `[...]` (no pagination — always fetches all) |

The frontend pages all guard against both shapes: `data?.orders || data || []`.

---

## Known Field Name Conventions

These caused real bugs — always verify against `schema.sql.js` before adding a new field to a Zod schema or frontend form:

| Table | Correct column | Wrong (was used) |
|---|---|---|
| `shipments` | `trackingNumber` | `awb` |
| `customers` | `isB2B` (boolean) | `type` enum `RETAIL/B2B` |
| `customers` | `gstIn` | `gstin` |
| `invoices` pay body | `reference` | `paymentReference` |

When creating a `shipments` row, the route accepts `orderId` (to look up the order), then strips it and writes `orderNumber` to the DB. The `shipments` table has no `orderId` or `awb` column.

### Key table columns (commonly referenced, not exhaustive)

**`users`**: `id, email, password, name, avatar, phone, provider, providerId, role, isPlatformAdmin, tenantId, isActive, emailVerified, createdAt, updatedAt`
- `phone` was added via `initDb.js` migration (not in `schema.sql.js`)

**`tenants`**: `id, slug, businessName, legalName, ownerEmail, ownerName, phone, gstin, country, industry, companySize, website, logo, status, trialEndsAt, createdAt, updatedAt`

**`shipments`**: `id, tenantId, orderNumber, trackingNumber, courierName, weight, charges, trackingUrl, status, createdAt, updatedAt`
- No `orderId`, no `awb` column

**`customers`**: `id, tenantId, name, email, phone, gstIn, isB2B, address, city, state, country, createdAt, updatedAt`
- `isB2B` is boolean; `gstIn` not `gstin`

---

## Backend Route Checklist

When adding or editing a backend route, verify:

- [ ] All `GET /` list endpoints include `page`/`limit`/`skip` query params and return `{ data, total }` (or plain array for small-set resources like vendors/warehouses)
- [ ] All `DELETE` routes check tenant ownership before deleting
- [ ] All billing `GET` routes have `requirePermission('billing.read')` — billing endpoints without permission checks expose financial data cross-tenant
- [ ] Pay/mark-paid endpoints guard against double-payment: check `if (existing.status === 'PAID') return 400`
- [ ] `PATCH /:id/status` endpoints must validate the status value against an enum via Zod — never write `data: { status: req.body.status }` directly
- [ ] Unbounded queries (e.g. `findMany` with no `take`) must have a default limit — use `Math.min(maxAllowed, Number(req.query.limit) || default)`
- [ ] Shipment create: accept `orderId`, look up `order.orderNumber`, write `orderNumber` to the `shipments` table (no `orderId` or `awb` column exists)
- [ ] Customer create/update: use `isB2B` boolean, not `type` enum

---

## Frontend Page Checklist

When adding or editing a frontend page:

- [ ] Use the typed API helper from `frontend/lib/api.ts` — never `api.get('/raw-path')` directly in pages
- [ ] Pagination: show `Pagination` component only when `total > pageSize`, not `total > 0`
- [ ] Delete actions need a confirm modal before calling the delete mutation
- [ ] Edit modals should pre-populate from the existing record and call `.update()` not `.create()`
- [ ] "This Month" or other time-based stats must derive from real `createdAt` dates, not `Math.floor(total * factor)` or hardcoded arithmetic like `count * 1000 + 9845.20`
- [ ] Variant/SKU selectors in forms must use a dropdown populated from the API — never ask users to paste UUIDs
- [ ] Dashboard summary fields from the API are **counts**, not currency values — `lowStockCount` is a number of SKUs, not a monetary amount; never display a count as `formatCurrency()`
- [ ] `c.name?.slice(0, 2)` — always null-guard string fields before calling string methods; use `(c.name || c.type || '?').slice(0, 2)` pattern
- [ ] File uploads in forms: use `FileReader.readAsDataURL()` to convert `File` objects to base64 strings before including in the JSON payload; do not discard the `images` state
- [ ] Settings page pattern: profile → `authApi.updateMe`, company → `billingApi.updateTenant`, password → `authApi.changePassword`, notification prefs → `localStorage`

---

## Environment Variables

### Backend (`.env`)
```
DATABASE_URL=mysql://root@localhost:3306/kartriq
PORT=5001
JWT_SECRET=<min 32 chars>
ENCRYPTION_KEY=<64 hex chars>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FRONTEND_URL=http://localhost:3000
# Dev flags
DEV_AUTH_BYPASS=true
DISABLE_RATE_LIMIT=true
```

### Frontend (`.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1
```

The fallback baseURL in `frontend/lib/api.ts` is `http://localhost:5001/api/v1`. If `.env.local` is missing, the app will connect to port 5001.

---

## Common Gotchas

- **Windows DLL lock**: If `npm install` fails with `EPERM rename query_engine-windows.dll.node`, stop the dev server first (it holds a file lock).
- **DB doesn't exist**: XAMPP creates the MySQL instance but not the `kartriq` database — create it once via phpMyAdmin; migrations handle the rest.
- **Prisma shim ≠ Prisma ORM**: `utils/prisma.js` is a Knex wrapper. Passing unknown field names to `.create()` or `.update()` will cause a DB column-not-found error at runtime. Always check `schema.sql.js` for actual column names before writing data.
- **Tenant isolation**: Never write a query without a `tenantId` filter unless the resource is explicitly global (plans, public content).
- **Vendor/warehouse delete is soft**: Both `DELETE /vendors/:id` and `DELETE /warehouses/:id` set `isActive = false` rather than hard-deleting. The `GET /` list for both filters `isActive: true` so soft-deleted records disappear from listings.
- **Invoice pay is idempotent**: Attempting to pay an already-`PAID` invoice returns `400`. Partial payments set status to `PARTIALLY_PAID`; full payment sets `PAID` and records `paidAt`.
- **No plan limits / wallet**: Don't reintroduce usage limits, `enforceLimit`, overage or wallet code. Plans gate features and channel categories only.
- **Self-service vs admin user updates**: `PUT /users/:id` requires `users.update` permission and is for admin managing team members. For the logged-in user updating their own profile, use `PATCH /auth/me` instead.
- **`PATCH /auth/change-password` OAuth guard**: The endpoint returns `400` if the user's account has no password (Google-only sign-in). The frontend should handle this gracefully.
- **New columns via migration**: Adding a column to an existing table requires an entry in the `migrations` array inside `backend/src/bootstrap/initDb.js` — not just in `schema.sql.js`. The `schema.sql.js` `CREATE TABLE IF NOT EXISTS` won't add columns to tables that already exist.

---

## Shipping: Confirm → label → shipment status

Self-shipped (MFN) Amazon orders have ONE button, **Confirm**, then **Download label**. Logic lives in `backend/src/services/shipping/shipment.service.js`; status vocabulary in `shipping/status.js`.

- `channels.mfnShipping` = `AMAZON` (Amazon arranges the courier: **Easy Ship** for region IN, **Buy Shipping** elsewhere) or `OWN` (seller's own courier partner: `channels.shippingProviderId` → a connected LOGISTICS channel; supported: iThink, Shiprocket, Delhivery, Xpressbees). Validated server-side in `PUT /channels/:id`.
- `POST /orders/:id/book-shipping` (Confirm), `GET /orders/:id/label`, `DELETE /orders/:id/label` (cancel booking, only before pickup), `POST /orders/:id/shipment/refresh`, `GET /orders/:id/shipment` (timeline), bulk `POST /orders/book-shipping` and `POST /orders/labels`.
- `orders.shipmentStatus` (BOOKED → PICKUP_SCHEDULED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED; exceptions DELIVERY_FAILED, RTO_INITIATED, RTO_DELIVERED) moves forward only; history in `order_shipment_events`. Order is CONFIRMED when booked, SHIPPED (stock leaves the shelf) when the courier picks up. The cron `pollShipmentStatus` (every ~10 min) and the Refresh button update it.
- Channel `needsReauth` (Amazon "invalid grant") drives the red banner + **Re-authorise** on the channel's manage page; `/oauth/amazon/status` returns `authorizedAt`.
- Courier-adapter details (endpoints, status words) were written from public docs and are **unverified against live accounts** — treat as best effort until smoke-tested.
- New npm packages used lazily (`pdf-lib`, `fflate`): the server must run "NPM install" after deploy.
