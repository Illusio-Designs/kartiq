# Kartriq — Omnichannel ERP

A multi-tenant SaaS ERP for D2C brands, marketplaces and warehouses: inventory,
orders, purchases, invoices, returns, shipments and reconciliation across every
sales channel (Amazon, Shopify, Flipkart and 50+ others).

**Stack**
- **Backend**: Node.js + Express + Knex.js + MySQL (JavaScript, CommonJS)
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind + Zustand + React Query
- **Mobile**: Expo (React Router) + NativeWind + Zustand
- **Auth**: JWT (7-day) + Google Identity Services
- **Multi-tenancy**: every resource scoped by `tenantId`; User → Roles → Permissions RBAC

> **Heads-up:** `backend/src/utils/prisma.js` is **not** real Prisma ORM. It is a
> custom Knex-backed shim that exposes a Prisma-like API. The DB schema lives
> in raw SQL at [backend/src/config/schema.sql.js](backend/src/config/schema.sql.js).

---

## Project Structure

```
e:/kartriq/
├── backend/                    ← Express API (port 5001)
│   ├── src/
│   │   ├── index.js               ← Entry point — runs initDb then listens
│   │   ├── bootstrap/initDb.js    ← Auto-migrate + conditional seed on boot
│   │   ├── config/schema.sql.js   ← All CREATE TABLE statements (source of truth)
│   │   ├── routes/                ← Route files per module
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middleware/auth.middleware.js  ← JWT, RBAC, plan features
│   │   ├── jobs/                  ← cron + billing background jobs
│   │   ├── scripts/seed.js        ← Idempotent seeder (upserts)
│   │   ├── scripts/test.js        ← e2e test suite (vanilla http.request)
│   │   └── utils/
│   │       ├── prisma.js          ← Knex-backed Prisma-like shim (NOT real Prisma)
│   │       ├── db.js              ← Raw Knex instance
│   │       └── crypto.js          ← AES-256-GCM for channel credentials
│   ├── .env                       ← DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY
│   └── .seed-state.json           ← Auto-generated, gates re-seeding
│
├── frontend/                      ← Next.js app (port 3000)
│   ├── app/                       ← App Router pages
│   ├── components/
│   ├── lib/api.ts                 ← Axios + typed API methods
│   └── store/auth.store.ts        ← Zustand: user, token, tenant, plan, permissions
│
├── mobile/                        ← Expo app
│   └── app/                       ← expo-router entry
│
├── docs/                          ← Design notes, specs
└── CLAUDE.md                      ← Architecture & contributor guide
```

---

## Prerequisites

- **Node.js** 18+
- **XAMPP** (for MySQL on `localhost:3306`)
- **npm**
- For mobile: **Expo Go** app on a device, or iOS/Android simulator

---

## Quick Start

### 1. Start MySQL (XAMPP)

Open the XAMPP control panel → start **MySQL**.

Open phpMyAdmin at `http://localhost/phpmyadmin` and create an empty database
named **`kartriq`** (one time only).

### 2. Backend

```bash
cd e:/kartriq/backend
npm install         # runs `prisma generate` via postinstall
npm run dev
```

On first boot, `initDb` will automatically:
1. apply all Prisma migrations to your `kartriq` DB
2. run the seed (permissions, plans, roles, admin user, sample data)

API runs on `http://localhost:5001`.

### 3. Frontend

```bash
cd e:/kartriq/frontend
npm install
npm run dev
```

App runs on `http://localhost:3000`.

**Default login:** `admin@kartriq.com` / `admin123`

---

## Environment Variables

### `backend/.env`

```env
# MySQL on XAMPP — default root password is empty
DATABASE_URL="mysql://root@localhost:3306/kartriq"

PORT=5001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# JWT — change in production, min 32 chars
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production_min_32_chars

# AES-256-GCM (64 hex chars) — for encrypting channel credentials
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000

# Google Sign-In (Google Identity Services — ID tokens, no redirect URI)
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Dev convenience
DEV_AUTH_BYPASS=true        # enables `Authorization: Bearer dev:<email>` for seeded users
DISABLE_RATE_LIMIT=true     # required when running the e2e test suite
```

### `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1
```

The fallback baseURL in [frontend/lib/api.ts](frontend/lib/api.ts) is
`http://localhost:5001/api/v1` — the file is optional in dev.

---

## Database Workflow

The DB is bootstrapped by [backend/src/bootstrap/initDb.js](backend/src/bootstrap/initDb.js)
on every `npm run dev`:

1. Runs every `CREATE TABLE IF NOT EXISTS` from `schema.sql.js`.
2. Applies the additive `ALTER TABLE ADD COLUMN IF NOT EXISTS` list inside `initDb.js`.
3. Inspects row counts in `plans` and `users` — if either is empty, runs `seed.js`.
4. Starts Express on `PORT`.

The seed is idempotent (everything upserts), so it's safe to re-run any time.
To force a re-seed, delete `backend/.seed-state.json` and restart.

### Changing the schema

- **New table** → add the `CREATE TABLE` statement to
  [backend/src/config/schema.sql.js](backend/src/config/schema.sql.js).
- **New column on an existing table** → add an `ALTER TABLE … ADD COLUMN IF NOT EXISTS …`
  entry to the `migrations` array in `initDb.js`. (Editing `CREATE TABLE` alone
  will NOT alter tables that already exist on a teammate's DB.)

Restart the dev server to apply. Teammates just `git pull && npm run dev`.

### Useful scripts — `backend/package.json`

| Script                          | Purpose                                       |
|---------------------------------|-----------------------------------------------|
| `npm run dev`                   | nodemon + auto-migrate + conditional seed     |
| `npm start`                     | `node src/index.js` (same init flow)          |
| `npm run seed`                  | Run the seed manually                         |
| `npm run cron:run`              | Run channel sync background jobs              |
| `npm run billing:run`           | Run billing/metering background jobs          |
| `npm run test:backend:server`   | Start the API with rate limits disabled       |
| `npm run test:backend`          | Run the e2e suite against a running server    |

### Running the e2e tests

```bash
# Terminal 1
cd backend
$env:DISABLE_RATE_LIMIT="true"; npm run test:backend:server

# Terminal 2
cd backend
npm run test:backend
```

Tests use vanilla `http.request` (no framework). Comment out test groups in
[backend/src/scripts/test.js](backend/src/scripts/test.js) to run a subset.

---

## API Endpoints (v1)

All routes live under `/api/v1`. Health check: `GET /health`.

| Module           | Base path                          |
|------------------|------------------------------------|
| Auth             | `/auth` (login, register, google, me, change-password) |
| Products         | `/products`                        |
| Inventory        | `/inventory`                       |
| Orders           | `/orders`                          |
| Purchases        | `/purchases`                       |
| Vendors          | `/vendors`                         |
| Warehouses       | `/warehouses`                      |
| Channels         | `/channels`                        |
| Customers        | `/customers`                       |
| Invoices         | `/invoices`                        |
| Shipments        | `/shipments`                       |
| Movements        | `/movements`                       |
| Dashboard        | `/dashboard`                       |
| Reports          | `/reports`                         |
| Plans            | `/plans`                           |
| Billing          | `/billing` (plan, invoices, cards)  |
| Roles & Users    | `/roles`, `/users`                 |
| Admin            | `/admin` (platform-admin only)     |
| Public           | `/public` (SEO, blog, pricing)     |

### Response shape contracts

LIST endpoints return an envelope (the frontend depends on this — never return a bare array except for the noted resources):

| Resource    | Shape                                       |
|-------------|---------------------------------------------|
| orders      | `{ orders, total, page, limit }`            |
| products    | `{ products, total }`                       |
| inventory   | `{ items, total, page, limit }`             |
| customers   | `{ customers, total }`                      |
| invoices    | `{ invoices, total }`                       |
| shipments   | `{ shipments, total, page, limit }`         |
| movements   | `{ movements, total, page, limit }`         |
| vendors     | plain array (always full set)               |
| warehouses  | plain array (always full set)               |

---

## Modules

- **Inventory** — Real-time stock across warehouses, low-stock alerts, adjustments
- **Orders** — Omnichannel order management, fulfillment, cancellation
- **Purchase Orders** — Vendor POs, approval, receiving, cost tracking
- **Warehouses** — Multi-warehouse, per-warehouse stock (soft-delete on remove)
- **Channels** — Amazon SP-API, Shopify, Flipkart, Instagram, WhatsApp, Shiprocket, Delhivery; AES-256-GCM credential storage; cron sync
- **Customers** — B2B/retail profiles, GSTIN, order history
- **Invoices** — Billing, payment recording (idempotent pay), GST
- **Shipments** — Courier tracking (`trackingNumber`, no `awb` column)
- **Returns** — Return requests, approvals, restocking
- **Reports** — Sales analytics, inventory valuation, top products
- **Dashboard** — KPIs, recent orders, revenue trends
- **RBAC** — Tenant-scoped roles + permission catalog (module × action); `*` = full access
- **Plans & Billing** — Feature-based plans (no usage limits), Razorpay checkout and auto-renewal
- **Public site** — SEO settings, blog, pricing page

---

## Multi-Tenancy & RBAC at a glance

- Every authenticated request has `req.tenant`, `req.user`, `req.plan`, `req.permissions`
  attached by [backend/src/middleware/auth.middleware.js](backend/src/middleware/auth.middleware.js).
- All DB queries **must** filter by `tenantId` (except global resources like `plans`).
- Permission model: User → Roles → Permissions (e.g. `products.create`, `orders.view`).
  Permission checks are cached in-process for 10s and invalidated on logout.
- Platform admins (founders) can pass `x-tenant-id` to impersonate any tenant.
- Plans gate features and channel categories only; there are no usage limits or wallet.

---

## Troubleshooting

**`EPERM: operation not permitted, rename …query_engine-windows.dll.node`**
A leftover from a previous Prisma install. Stop any running `node` / `nodemon`
processes — the file is held open. (The current codebase doesn't use Prisma ORM.)

**`Can't reach database server at localhost:3306`**
XAMPP MySQL isn't running. Start it from the XAMPP control panel.

**`Access denied for user 'root'@'localhost'`**
XAMPP's default MySQL root password is empty. In `backend/.env`, use
`mysql://root@localhost:3306/kartriq` (no password), **not**
`mysql://root:password@localhost:3306/kartriq`.

**`Database 'kartriq' doesn't exist`**
Create it once in phpMyAdmin — Prisma migrations create tables, not the database.

**Added a column to `schema.sql.js` but the table still has no such column**
`CREATE TABLE IF NOT EXISTS` is a no-op when the table already exists. Add an
`ALTER TABLE … ADD COLUMN IF NOT EXISTS …` entry to the `migrations` array in
`initDb.js` and restart.

**`Unknown column 'foo' in 'field list'`**
The Prisma shim silently passes through unknown fields to the SQL layer. Check
[backend/src/config/schema.sql.js](backend/src/config/schema.sql.js) for the
exact column name (e.g. `trackingNumber` not `awb`; `gstIn` not `gstin`;
`isB2B` boolean not a `type` enum).

**Seed didn't re-run after a fresh DB**
Delete `backend/.seed-state.json` and restart — it re-seeds when `plans` or
`users` are empty on next boot.

**E2E tests rejected with 429**
Start the server with `DISABLE_RATE_LIMIT=true` (see "Running the e2e tests").

---

## Further reading

- [CLAUDE.md](CLAUDE.md) — full architecture + contributor checklist (route conventions, field-name gotchas, page checklist)
- [docs/](docs/) — design notes and specs

---

## License

Proprietary — internal project.
