// Prisma → Knex compatibility shim.
// Wraps the Knex query builder with a Prisma-like API so all existing
// controllers/routes/services continue working without changes.
//
// Usage in consuming files remains: const prisma = require('../utils/prisma');
//   await prisma.user.findMany({ where: { tenantId }, include: {...}, orderBy: {...} });
//
// Under the hood this builds Knex queries against mysql2.

const db = require('./db');
const { v4: uuid } = require('uuid');

// ── WHERE clause builder ────────────────────────────────────────────
function applyWhere(qb, where = {}) {
  for (const [key, val] of Object.entries(where)) {
    if (key === 'AND') {
      for (const cond of val) applyWhere(qb, cond);
    } else if (key === 'OR') {
      qb.where(function () {
        val.forEach((cond, i) => {
          const method = i === 0 ? 'where' : 'orWhere';
          this[method](function () { applyWhere(this, cond); });
        });
      });
    } else if (key === 'NOT') {
      qb.whereNot(function () { applyWhere(this, val); });
    } else if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      // Prisma filter operators: contains, startsWith, endsWith, gt, gte, lt, lte, in, notIn, not, equals
      for (const [op, operand] of Object.entries(val)) {
        switch (op) {
          case 'contains':   qb.where(key, 'like', `%${operand}%`); break;
          case 'startsWith': qb.where(key, 'like', `${operand}%`); break;
          case 'endsWith':   qb.where(key, 'like', `%${operand}`); break;
          case 'gt':         qb.where(key, '>', operand); break;
          case 'gte':        qb.where(key, '>=', operand); break;
          case 'lt':         qb.where(key, '<', operand); break;
          case 'lte':        qb.where(key, '<=', operand); break;
          case 'in':         qb.whereIn(key, operand); break;
          case 'notIn':      qb.whereNotIn(key, operand); break;
          case 'not':        operand === null ? qb.whereNotNull(key) : qb.whereNot(key, operand); break;
          case 'equals':     operand === null ? qb.whereNull(key) : qb.where(key, operand); break;
          case 'increment':  /* handled in update data, not where */ break;
          default:           qb.where(key, operand);
        }
      }
    } else if (val === null) {
      qb.whereNull(key);
    } else {
      qb.where(key, val);
    }
  }
  return qb;
}

// ── ORDER BY builder ────────────────────────────────────────────────
function applyOrderBy(qb, orderBy) {
  if (!orderBy) return qb;
  if (Array.isArray(orderBy)) {
    for (const item of orderBy) applyOrderBy(qb, item);
    return qb;
  }
  for (const [key, dir] of Object.entries(orderBy)) {
    if (typeof dir === 'object') {
      // Nested: { variant: { product: { name: 'asc' } } } — flatten to first-level only
      // (deep ordering requires JOINs; skip for compat, use first level)
      continue;
    }
    qb.orderBy(key, dir);
  }
  return qb;
}

// ── SELECT / INCLUDE: Prisma include loads relations; we do separate queries ─
async function loadIncludes(rows, table, include, conn = db) {
  if (!include || !rows.length) return rows;
  const relations = RELATIONS[table] || {};
  for (const [relName, relOpts] of Object.entries(include)) {
    if (!relOpts) continue;
    const rel = relations[relName];
    if (!rel) continue; // unknown relation, skip

    const ids = rows.map(r => r[rel.localKey || 'id']);
    let relQuery = conn(rel.table).whereIn(rel.foreignKey, ids);

    if (typeof relOpts === 'object' && !Array.isArray(relOpts)) {
      if (relOpts.where) applyWhere(relQuery, relOpts.where);
      if (relOpts.orderBy) applyOrderBy(relQuery, relOpts.orderBy);
      if (relOpts.take) relQuery = relQuery.limit(relOpts.take);
      if (relOpts.select) {
        // Always keep the relation's foreign key in the projection so the
        // in-memory join below still matches, even if the caller didn't ask
        // for it. Without this a nested `select` drops the join key → empty.
        const cols = new Set(Object.keys(relOpts.select).filter(k => relOpts.select[k]));
        cols.add(rel.foreignKey);
        relQuery = relQuery.select([...cols]);
      }
      if (relOpts.include) {
        const relRows = deserializeRows(await relQuery, rel.table);
        const nested = await loadIncludes(relRows, rel.table, relOpts.include, conn);
        for (const row of rows) {
          row[relName] = rel.type === 'one'
            ? nested.find(r => r[rel.foreignKey] === row[rel.localKey || 'id']) || null
            : nested.filter(r => r[rel.foreignKey] === row[rel.localKey || 'id']);
        }
        continue;
      }
    }

    const relRows = deserializeRows(await relQuery, rel.table);
    for (const row of rows) {
      row[relName] = rel.type === 'one'
        ? relRows.find(r => r[rel.foreignKey] === row[rel.localKey || 'id']) || null
        : relRows.filter(r => r[rel.foreignKey] === row[rel.localKey || 'id']);
    }
  }
  return rows;
}

// ── COUNT includes (_count: { select: { orders: true } }) ───────────
async function loadCounts(rows, table, countSpec, conn = db) {
  if (!countSpec?.select || !rows.length) return rows;
  const relations = RELATIONS[table] || {};
  for (const [relName, enabled] of Object.entries(countSpec.select)) {
    if (!enabled) continue;
    const rel = relations[relName];
    if (!rel) continue;
    const ids = rows.map(r => r.id);
    const counts = await conn(rel.table)
      .whereIn(rel.foreignKey, ids)
      .groupBy(rel.foreignKey)
      .select(rel.foreignKey)
      .count('* as _count');
    const countMap = Object.fromEntries(counts.map(c => [c[rel.foreignKey], Number(c._count)]));
    for (const row of rows) {
      if (!row._count) row._count = {};
      row._count[relName] = countMap[row.id] || 0;
    }
  }
  return rows;
}

// ── Relation map (models → their relations) ─────────────────────────
// Each relation: { table, foreignKey, localKey?, type: 'one'|'many' }
const RELATIONS = {
  tenants: {
    subscription: { table: 'subscriptions', foreignKey: 'tenantId', type: 'one' },
    users: { table: 'users', foreignKey: 'tenantId', type: 'many' },
    roles: { table: 'tenant_roles', foreignKey: 'tenantId', type: 'many' },
    orders: { table: 'orders', foreignKey: 'tenantId', type: 'many' },
    products: { table: 'products', foreignKey: 'tenantId', type: 'many' },
    warehouses: { table: 'warehouses', foreignKey: 'tenantId', type: 'many' },
    vendors: { table: 'vendors', foreignKey: 'tenantId', type: 'many' },
    supportTickets: { table: 'support_tickets', foreignKey: 'tenantId', type: 'many' },
    usageMeters: { table: 'usage_meters', foreignKey: 'tenantId', type: 'many' },
    invoicesBilling: { table: 'billing_invoices', foreignKey: 'tenantId', type: 'many' },
  },
  users: {
    tenant: { table: 'tenants', foreignKey: 'id', localKey: 'tenantId', type: 'one' },
    roles: { table: 'user_roles', foreignKey: 'userId', type: 'many' },
    orders: { table: 'orders', foreignKey: 'createdById', type: 'many' },
    purchaseOrders: { table: 'purchase_orders', foreignKey: 'createdById', type: 'many' },
    channelRequests: { table: 'channel_requests', foreignKey: 'requestedBy', type: 'many' },
  },
  user_roles: {
    role: { table: 'tenant_roles', foreignKey: 'id', localKey: 'roleId', type: 'one' },
    user: { table: 'users', foreignKey: 'id', localKey: 'userId', type: 'one' },
  },
  tenant_roles: {
    permissions: { table: 'role_permissions', foreignKey: 'roleId', type: 'many' },
    users: { table: 'user_roles', foreignKey: 'roleId', type: 'many' },
  },
  role_permissions: {
    permission: { table: 'permissions', foreignKey: 'id', localKey: 'permissionId', type: 'one' },
    role: { table: 'tenant_roles', foreignKey: 'id', localKey: 'roleId', type: 'one' },
  },
  subscriptions: {
    plan: { table: 'plans', foreignKey: 'id', localKey: 'planId', type: 'one' },
    tenant: { table: 'tenants', foreignKey: 'id', localKey: 'tenantId', type: 'one' },
    invoices: { table: 'billing_invoices', foreignKey: 'subscriptionId', type: 'many' },
  },
  orders: {
    channel: { table: 'channels', foreignKey: 'id', localKey: 'channelId', type: 'one' },
    customer: { table: 'customers', foreignKey: 'id', localKey: 'customerId', type: 'one' },
    warehouse: { table: 'warehouses', foreignKey: 'id', localKey: 'warehouseId', type: 'one' },
    createdBy: { table: 'users', foreignKey: 'id', localKey: 'createdById', type: 'one' },
    items: { table: 'order_items', foreignKey: 'orderId', type: 'many' },
    invoices: { table: 'invoices', foreignKey: 'orderId', type: 'many' },
    returns: { table: 'returns', foreignKey: 'orderId', type: 'many' },
  },
  order_items: {
    order: { table: 'orders', foreignKey: 'id', localKey: 'orderId', type: 'one' },
    variant: { table: 'product_variants', foreignKey: 'id', localKey: 'variantId', type: 'one' },
  },
  products: {
    category: { table: 'categories', foreignKey: 'id', localKey: 'categoryId', type: 'one' },
    brand: { table: 'brands', foreignKey: 'id', localKey: 'brandId', type: 'one' },
    variants: { table: 'product_variants', foreignKey: 'productId', type: 'many' },
    inventoryItems: { table: 'inventory_items', foreignKey: 'productId', type: 'many' },
    channelListings: { table: 'channel_listings', foreignKey: 'productId', type: 'many' },
  },
  product_variants: {
    product: { table: 'products', foreignKey: 'id', localKey: 'productId', type: 'one' },
    inventoryItems: { table: 'inventory_items', foreignKey: 'variantId', type: 'many' },
    orderItems: { table: 'order_items', foreignKey: 'variantId', type: 'many' },
    purchaseItems: { table: 'purchase_order_items', foreignKey: 'variantId', type: 'many' },
    channelListings: { table: 'channel_listings', foreignKey: 'variantId', type: 'many' },
  },
  channels: {
    orders: { table: 'orders', foreignKey: 'channelId', type: 'many' },
    listings: { table: 'channel_listings', foreignKey: 'channelId', type: 'many' },
  },
  channel_listings: {
    channel: { table: 'channels', foreignKey: 'id', localKey: 'channelId', type: 'one' },
    product: { table: 'products', foreignKey: 'id', localKey: 'productId', type: 'one' },
    variant: { table: 'product_variants', foreignKey: 'id', localKey: 'variantId', type: 'one' },
  },
  channel_requests: {
    user: { table: 'users', foreignKey: 'id', localKey: 'requestedBy', type: 'one' },
  },
  warehouses: {
    inventoryItems: { table: 'inventory_items', foreignKey: 'warehouseId', type: 'many' },
    stockMovements: { table: 'stock_movements', foreignKey: 'warehouseId', type: 'many' },
    ordersFrom: { table: 'orders', foreignKey: 'warehouseId', type: 'many' },
  },
  inventory_items: {
    warehouse: { table: 'warehouses', foreignKey: 'id', localKey: 'warehouseId', type: 'one' },
    product: { table: 'products', foreignKey: 'id', localKey: 'productId', type: 'one' },
    variant: { table: 'product_variants', foreignKey: 'id', localKey: 'variantId', type: 'one' },
  },
  stock_movements: {
    warehouse: { table: 'warehouses', foreignKey: 'id', localKey: 'warehouseId', type: 'one' },
  },
  vendors: {
    purchaseOrders: { table: 'purchase_orders', foreignKey: 'vendorId', type: 'many' },
  },
  purchase_orders: {
    vendor: { table: 'vendors', foreignKey: 'id', localKey: 'vendorId', type: 'one' },
    items: { table: 'purchase_order_items', foreignKey: 'purchaseOrderId', type: 'many' },
    invoices: { table: 'invoices', foreignKey: 'purchaseOrderId', type: 'many' },
    createdBy: { table: 'users', foreignKey: 'id', localKey: 'createdById', type: 'one' },
  },
  purchase_order_items: {
    purchaseOrder: { table: 'purchase_orders', foreignKey: 'id', localKey: 'purchaseOrderId', type: 'one' },
    variant: { table: 'product_variants', foreignKey: 'id', localKey: 'variantId', type: 'one' },
  },
  customers: {
    orders: { table: 'orders', foreignKey: 'customerId', type: 'many' },
  },
  invoices: {
    payments: { table: 'payments', foreignKey: 'invoiceId', type: 'many' },
    order: { table: 'orders', foreignKey: 'id', localKey: 'orderId', type: 'one' },
    purchaseOrder: { table: 'purchase_orders', foreignKey: 'id', localKey: 'purchaseOrderId', type: 'one' },
  },
  payments: {
    invoice: { table: 'invoices', foreignKey: 'id', localKey: 'invoiceId', type: 'one' },
  },
  support_tickets: {
    tenant: { table: 'tenants', foreignKey: 'id', localKey: 'tenantId', type: 'one' },
    messages: { table: 'ticket_messages', foreignKey: 'ticketId', type: 'many' },
  },
  ticket_messages: {
    ticket: { table: 'support_tickets', foreignKey: 'id', localKey: 'ticketId', type: 'one' },
  },
  blog_posts: {},
  seo_settings: {},
  public_content: {},
  platform_settings: {},
  audit_logs: {},
  usage_meters: {},
  billing_invoices: {
    tenant: { table: 'tenants', foreignKey: 'id', localKey: 'tenantId', type: 'one' },
    subscription: { table: 'subscriptions', foreignKey: 'id', localKey: 'subscriptionId', type: 'one' },
  },
  plans: {
    subscriptions: { table: 'subscriptions', foreignKey: 'planId', type: 'many' },
  },
  permissions: {
    rolePermissions: { table: 'role_permissions', foreignKey: 'permissionId', type: 'many' },
  },
};

// ── Model → table name mapping ──────────────────────────────────────
const TABLE_MAP = {
  user: 'users', tenant: 'tenants', plan: 'plans', permission: 'permissions',
  tenantRole: 'tenant_roles', rolePermission: 'role_permissions', userRole: 'user_roles',
  subscription: 'subscriptions', usageMeter: 'usage_meters', billingInvoice: 'billing_invoices',
  blogPost: 'blog_posts', seoSetting: 'seo_settings', publicContent: 'public_content',
  platformSetting: 'platform_settings', auditLog: 'audit_logs',
  channelRequest: 'channel_requests', channel: 'channels', channelListing: 'channel_listings',
  category: 'categories', brand: 'brands', product: 'products', productVariant: 'product_variants',
  warehouse: 'warehouses', inventoryItem: 'inventory_items', stockMovement: 'stock_movements',
  vendor: 'vendors', purchaseOrder: 'purchase_orders', purchaseOrderItem: 'purchase_order_items',
  customer: 'customers', order: 'orders', orderItem: 'order_items',
  return: 'returns', invoice: 'invoices', payment: 'payments', shipment: 'shipments',
  supportTicket: 'support_tickets', ticketMessage: 'ticket_messages',
  tenantWallet: 'tenant_wallets', walletTransaction: 'wallet_transactions',
  lead: 'leads',
  changelogEntry: 'changelog_entries',
  helpFaq: 'help_faqs',
  notification: 'notifications',
};

// ── UPDATE data builder (handles { increment } etc.) ────────────────
function buildUpdateData(data, conn = db) {
  const plain = {};
  const raw = [];
  for (const [key, val] of Object.entries(data)) {
    if (val && typeof val === 'object' && val.increment !== undefined) {
      // `??` is knex identifier binding — escapes/validates the column name
      // instead of interpolating it raw (identifier-injection surface).
      raw.push({ key, expr: conn.raw('?? + ?', [key, val.increment]) });
    } else if (val && typeof val === 'object' && val.decrement !== undefined) {
      raw.push({ key, expr: conn.raw('?? - ?', [key, val.decrement]) });
    } else {
      plain[key] = val === undefined ? null : val;
    }
  }
  return { plain, raw };
}

// ── Nested create builder (Prisma: items: { create: [...] }) ────────
async function handleNestedCreates(table, parentId, data, trx) {
  const conn = trx || db;
  const relations = RELATIONS[table] || {};
  for (const [key, val] of Object.entries(data)) {
    if (!val || typeof val !== 'object') continue;
    const rel = relations[key];
    if (!rel) continue;
    if (val.create) {
      const items = Array.isArray(val.create) ? val.create : [val.create];
      for (const item of items) {
        const row = { id: uuid(), ...item, [rel.foreignKey]: parentId };
        if (!NO_CREATED_AT.has(rel.table) && row.createdAt === undefined) row.createdAt = new Date();
        if (!NO_UPDATED_AT.has(rel.table) && row.updatedAt === undefined) row.updatedAt = new Date();
        await conn(rel.table).insert(serializeRow(row, rel.table));
      }
    }
    if (val.createMany) {
      const items = val.createMany.data || val.createMany;
      for (const item of (Array.isArray(items) ? items : [items])) {
        const row = { id: uuid(), ...item, [rel.foreignKey]: parentId };
        if (!NO_CREATED_AT.has(rel.table) && row.createdAt === undefined) row.createdAt = new Date();
        if (!NO_UPDATED_AT.has(rel.table) && row.updatedAt === undefined) row.updatedAt = new Date();
        try {
          await conn(rel.table).insert(serializeRow(row, rel.table));
        } catch (e) {
          if (val.createMany.skipDuplicates && e.code === 'ER_DUP_ENTRY') continue;
          throw e;
        }
      }
    }
  }
}

// ── Unique where → plain where ──────────────────────────────────────
// Prisma: { where: { tenantId_code: { tenantId, code } } }
// We flatten compound keys: { tenantId, code }
function flattenUniqueWhere(where) {
  const flat = {};
  for (const [key, val] of Object.entries(where)) {
    if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      // Check if it looks like a compound key (all values are primitives)
      const allPrimitive = Object.values(val).every(v => typeof v !== 'object' || v === null || v instanceof Date);
      if (allPrimitive && !['contains', 'startsWith', 'endsWith', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'not', 'equals', 'increment', 'decrement'].includes(Object.keys(val)[0])) {
        Object.assign(flat, val);
        continue;
      }
    }
    flat[key] = val;
  }
  return flat;
}

// ── JSON field handling ─────────────────────────────────────────────
// Serialization/deserialization is driven by the per-table JSON_FIELDS map
// so only columns actually declared as JSON are (de)serialized. When a table
// isn't in the map we fall back to a conservative heuristic, but we never
// parse arbitrary free-text columns for a table whose JSON columns are known.
function serializeRow(data, table) { // eslint-disable-line no-unused-vars
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined || v instanceof Date) {
      out[k] = v;
      continue;
    }
    if (typeof v === 'object' && (v.increment !== undefined || v.decrement !== undefined)) {
      out[k] = v; // increment/decrement markers are handled elsewhere
      continue;
    }
    const isContainer = Array.isArray(v) || typeof v === 'object';
    if (!isContainer) {
      out[k] = v;
      continue;
    }
    // Declared JSON column → stringify. Any other container value also gets
    // stringified as a safe fallback (a raw object can't be stored in a column
    // regardless), so declared-ness only matters on the read/deserialize side.
    out[k] = JSON.stringify(v);
  }
  return out;
}

function deserializeRow(row, table) {
  if (!row) return row;
  const jsonFields = table ? JSON_FIELDS[table] : undefined;
  if (jsonFields) {
    // Table known: only parse the columns declared as JSON. An empty list
    // means this table has no JSON columns → parse nothing (never guess).
    for (const k of jsonFields) {
      const v = row[k];
      if (typeof v === 'string') {
        try { row[k] = JSON.parse(v); } catch {}
      }
    }
    return row;
  }
  // Table not in the map → conservative fallback heuristic.
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
      try { row[k] = JSON.parse(v); } catch {}
    }
  }
  return row;
}

function deserializeRows(rows, table) {
  return rows.map(r => deserializeRow(r, table));
}

// JSON fields by table — these get auto-serialized/deserialized
const JSON_FIELDS = {
  users: [], channels: ['credentials'], products: ['dimensions', 'images', 'tags'],
  product_variants: ['attributes'], warehouses: ['address'], vendors: ['address', 'bankDetails'],
  customers: ['address'], orders: ['shippingAddress', 'billingAddress'],
  plans: ['features', 'meteredRates'], billing_invoices: ['lineItems'],
  audit_logs: ['metadata'], public_content: ['data'], blog_posts: ['tags'],
};

// Tables that do NOT have these timestamp columns — skip auto-adding them
const NO_UPDATED_AT = new Set([
  'permissions', 'role_permissions', 'user_roles', 'audit_logs',
  'stock_movements', 'order_items', 'purchase_order_items', 'ticket_messages', 'payments',
  'wallet_transactions', 'notifications',
]);
const NO_CREATED_AT = new Set([
  'role_permissions', 'user_roles', 'order_items', 'purchase_order_items', 'payments', 'usage_meters',
  'seo_settings', 'inventory_items',
]);

// ── Model proxy factory ─────────────────────────────────────────────
// `conn` is the Knex connection to run against — the global pool (`db`) by
// default, or a transaction (`trx`) when built for a $transaction callback.
// Threading it through every query (and through loadIncludes/loadCounts/
// buildUpdateData/handleNestedCreates) is what makes $transaction actually
// atomic instead of leaking onto the global pool.
function createModel(modelName, conn = db) {
  const table = TABLE_MAP[modelName];
  if (!table) throw new Error(`Unknown model: ${modelName}`);

  return {
    async findMany(opts = {}) {
      let q = conn(table);
      if (opts.where) applyWhere(q, flattenUniqueWhere(opts.where));
      if (opts.orderBy) applyOrderBy(q, opts.orderBy);
      if (opts.skip) q = q.offset(opts.skip);
      if (opts.take) q = q.limit(opts.take);
      if (opts.select) q = q.select(Object.keys(opts.select).filter(k => opts.select[k]));
      let rows = deserializeRows(await q, table);
      if (opts.include) rows = await loadIncludes(rows, table, opts.include, conn);
      if (opts._count) rows = await loadCounts(rows, table, opts._count, conn);
      return rows;
    },

    async findUnique(opts = {}) {
      let q = conn(table);
      if (opts.where) applyWhere(q, flattenUniqueWhere(opts.where));
      if (opts.select) q = q.select(Object.keys(opts.select).filter(k => opts.select[k]));
      let row = deserializeRow(await q.first(), table);
      if (row && opts.include) [row] = await loadIncludes([row], table, opts.include, conn);
      if (row && opts._count) [row] = await loadCounts([row], table, opts._count, conn);
      return row || null;
    },

    // findFirst has its own implementation: unlike findUnique it honours
    // orderBy/skip and takes the first matching row (take:1), returning null
    // when nothing matches.
    async findFirst(opts = {}) {
      let q = conn(table);
      if (opts.where) applyWhere(q, flattenUniqueWhere(opts.where));
      if (opts.orderBy) applyOrderBy(q, opts.orderBy);
      if (opts.skip) q = q.offset(opts.skip);
      q = q.limit(1);
      if (opts.select) q = q.select(Object.keys(opts.select).filter(k => opts.select[k]));
      const results = await q;
      let row = results.length ? deserializeRow(results[0], table) : null;
      if (row && opts.include) [row] = await loadIncludes([row], table, opts.include, conn);
      if (row && opts._count) [row] = await loadCounts([row], table, opts._count, conn);
      return row || null;
    },

    async create(opts = {}) {
      const { data = {}, include } = opts;
      const nested = {};
      const plain = {};
      const relations = RELATIONS[table] || {};
      for (const [k, v] of Object.entries(data)) {
        if (relations[k] && v && typeof v === 'object' && (v.create || v.createMany)) {
          nested[k] = v;
        } else {
          plain[k] = v;
        }
      }
      const id = plain.id || uuid();
      const timestamps = {};
      if (!NO_CREATED_AT.has(table)) timestamps.createdAt = new Date();
      if (!NO_UPDATED_AT.has(table)) timestamps.updatedAt = new Date();
      const row = serializeRow({ id, ...timestamps, ...plain }, table);
      await conn(table).insert(row);
      await handleNestedCreates(table, id, nested, conn);
      const result = deserializeRow(await conn(table).where({ id }).first(), table);
      if (result && include) {
        const [enriched] = await loadIncludes([result], table, include, conn);
        return enriched;
      }
      return result;
    },

    async createMany(opts = {}) {
      const items = opts.data || [];
      let count = 0;
      for (const item of items) {
        const ts = {};
        if (!NO_CREATED_AT.has(table)) ts.createdAt = new Date();
        if (!NO_UPDATED_AT.has(table)) ts.updatedAt = new Date();
        const row = serializeRow({ id: uuid(), ...ts, ...item }, table);
        try {
          await conn(table).insert(row);
          count++;
        } catch (e) {
          if (opts.skipDuplicates && e.code === 'ER_DUP_ENTRY') continue;
          throw e;
        }
      }
      return { count };
    },

    async update(opts = {}) {
      const { where = {}, data = {}, include } = opts;
      const flatWhere = flattenUniqueWhere(where);
      const autoTs = NO_UPDATED_AT.has(table) ? {} : { updatedAt: new Date() };
      const { plain, raw } = buildUpdateData({ ...autoTs, ...data }, conn);
      const serialized = serializeRow(plain, table);
      // Handle nested creates in update
      const relations = RELATIONS[table] || {};
      for (const [k, v] of Object.entries(data)) {
        if (relations[k] && v && typeof v === 'object' && (v.create || v.createMany)) {
          const existing = await conn(table).where(flatWhere).first();
          if (existing) await handleNestedCreates(table, existing.id, { [k]: v }, conn);
          delete serialized[k];
        }
      }
      let q = conn(table).where(flatWhere);
      if (raw.length) {
        const updates = { ...serialized };
        for (const r of raw) updates[r.key] = r.expr;
        await q.update(updates);
      } else {
        await q.update(serialized);
      }
      const result = deserializeRow(await conn(table).where(flatWhere).first(), table);
      if (result && include) {
        const [enriched] = await loadIncludes([result], table, include, conn);
        return enriched;
      }
      return result;
    },

    async updateMany(opts = {}) {
      const { where = {}, data = {} } = opts;
      const autoTs2 = NO_UPDATED_AT.has(table) ? {} : { updatedAt: new Date() };
      const { plain, raw } = buildUpdateData({ ...autoTs2, ...data }, conn);
      const serialized = serializeRow(plain, table);
      let q = conn(table);
      applyWhere(q, flattenUniqueWhere(where));
      // Knex `.update()` resolves to the number of affected rows — return it.
      let affected;
      if (raw.length) {
        const updates = { ...serialized };
        for (const r of raw) updates[r.key] = r.expr;
        affected = await q.update(updates);
      } else {
        affected = await q.update(serialized);
      }
      return { count: Number(affected) || 0 };
    },

    async upsert(opts = {}) {
      const { where = {}, update: updateData = {}, create: createData = {} } = opts;
      const flatWhere = flattenUniqueWhere(where);
      const nonTimestamp = Object.keys(updateData).filter(k => k !== 'updatedAt' && k !== 'createdAt');
      const existing = await conn(table).where(flatWhere).first();
      if (existing) {
        // Skip update if there's nothing meaningful to update (e.g. junction tables)
        if (nonTimestamp.length === 0) return deserializeRow(existing, table);
        return this.update({ where, data: updateData, include: opts.include });
      }
      // No row yet — attempt the create, but tolerate a concurrent first-writer
      // that inserted the same unique key between our SELECT and INSERT. On a
      // duplicate-key error (statement-level rollback in InnoDB — the outer
      // transaction survives) fall back to updating the now-existing row.
      try {
        return await this.create({ data: createData, include: opts.include });
      } catch (e) {
        const dup = e && (e.code === 'ER_DUP_ENTRY' || e.errno === 1062);
        if (!dup) throw e;
        if (nonTimestamp.length === 0) {
          const row = await conn(table).where(flatWhere).first();
          return deserializeRow(row, table);
        }
        return this.update({ where, data: updateData, include: opts.include });
      }
    },

    async delete(opts = {}) {
      const flatWhere = flattenUniqueWhere(opts.where || {});
      const row = await conn(table).where(flatWhere).first();
      await conn(table).where(flatWhere).del();
      return row;
    },

    async deleteMany(opts = {}) {
      let q = conn(table);
      if (opts.where) applyWhere(q, flattenUniqueWhere(opts.where));
      const count = await q.del();
      return { count };
    },

    async count(opts = {}) {
      let q = conn(table);
      if (opts.where) applyWhere(q, flattenUniqueWhere(opts.where));
      const [{ count }] = await q.count('* as count');
      return Number(count);
    },

    async aggregate(opts = {}) {
      const result = {};
      if (opts._sum) {
        for (const [field, enabled] of Object.entries(opts._sum)) {
          if (!enabled) continue;
          let sq = conn(table);
          if (opts.where) applyWhere(sq, flattenUniqueWhere(opts.where));
          const [row] = await sq.sum(`${field} as total`);
          if (!result._sum) result._sum = {};
          // Use == null so a real 0 sum stays 0 (not coerced to null).
          const total = row == null ? null : row.total;
          result._sum[field] = total == null ? null : Number(total);
        }
      }
      if (opts._avg) {
        for (const [field, enabled] of Object.entries(opts._avg)) {
          if (!enabled) continue;
          let sq = conn(table);
          if (opts.where) applyWhere(sq, flattenUniqueWhere(opts.where));
          const [row] = await sq.avg(`${field} as avg`);
          if (!result._avg) result._avg = {};
          const avg = row == null ? null : row.avg;
          result._avg[field] = avg == null ? null : Number(avg);
        }
      }
      if (opts._count) {
        let cq = conn(table);
        if (opts.where) applyWhere(cq, flattenUniqueWhere(opts.where));
        const [row] = await cq.count('* as count');
        result._count = Number(row.count);
      }
      return result;
    },

    async groupBy(opts = {}) {
      const { by = [], where, _count, _sum, orderBy, take } = opts;
      let q = conn(table).select(by);
      if (where) applyWhere(q, flattenUniqueWhere(where));
      q = q.groupBy(by);
      if (_count) {
        for (const [field, enabled] of Object.entries(_count)) {
          if (enabled) q = q.count(`${field} as _count_${field}`);
        }
      }
      if (_sum) {
        for (const [field, enabled] of Object.entries(_sum)) {
          if (enabled) q = q.sum(`${field} as _sum_${field}`);
        }
      }
      if (orderBy) {
        if (orderBy._sum) {
          for (const [field, dir] of Object.entries(orderBy._sum)) {
            q = q.orderBy(`_sum_${field}`, dir);
          }
        } else {
          applyOrderBy(q, orderBy);
        }
      }
      if (take) q = q.limit(take);
      const rows = await q;
      // Reshape to Prisma format: { field, _count: { field: N }, _sum: { field: N } }
      return rows.map(r => {
        const out = {};
        for (const col of by) out[col] = r[col];
        if (_count) {
          out._count = {};
          for (const f of Object.keys(_count)) out._count[f] = Number(r[`_count_${f}`] || 0);
        }
        if (_sum) {
          out._sum = {};
          for (const f of Object.keys(_sum)) out._sum[f] = Number(r[`_sum_${f}`] || 0);
        }
        return out;
      });
    },
  };
}

// ── Build the prisma-like proxy ─────────────────────────────────────
const prisma = new Proxy({}, {
  get(target, prop) {
    if (prop === '$transaction') {
      return async (fnOrArray) => {
        if (typeof fnOrArray === 'function') {
          return db.transaction(async (trx) => {
            // Build a transaction-scoped proxy: every model call runs on `trx`,
            // so all writes inside the callback commit/roll back atomically.
            // This is what makes the documented `async (tx) => { await tx.x… }`
            // pattern truly transactional instead of leaking onto the pool.
            const txProxy = new Proxy({}, {
              get(_t, p) {
                if (p === 'then' || p === 'catch' || typeof p !== 'string') return undefined;
                if (p === '$transaction') return async (fn) => fn(txProxy); // reuse this trx
                if (p === '$executeRaw' || p === '$executeRawUnsafe') {
                  return (sql, ...params) => {
                    if (typeof sql === 'object' && sql.strings) {
                      return trx.raw(sql.strings.join('?'), sql.values || params).then(([r]) => r.affectedRows || 0);
                    }
                    return trx.raw(sql, params).then(([r]) => r.affectedRows || 0);
                  };
                }
                if (p === '$queryRaw' || p === '$queryRawUnsafe') {
                  return (sql, ...params) => {
                    if (typeof sql === 'object' && sql.strings) {
                      return trx.raw(sql.strings.join('?'), sql.values || params).then(([rows]) => rows);
                    }
                    return trx.raw(sql, params).then(([rows]) => rows);
                  };
                }
                return createModel(p, trx);
              },
            });
            return fnOrArray(txProxy);
          });
        }
        // Array form: callers pass already-invoked promises (which executed on
        // the global pool before reaching here), so we can only await them
        // together. Prefer the function form when true atomicity is required.
        return db.transaction(async () => {
          const results = [];
          for (const p of fnOrArray) results.push(await p);
          return results;
        });
      };
    }
    if (prop === '$executeRaw' || prop === '$executeRawUnsafe') {
      return (sql, ...params) => {
        if (typeof sql === 'object' && sql.strings) {
          // Tagged template literal
          const text = sql.strings.join('?');
          return db.raw(text, sql.values || params).then(([result]) => result.affectedRows || 0);
        }
        return db.raw(sql, params).then(([result]) => result.affectedRows || 0);
      };
    }
    if (prop === '$queryRaw' || prop === '$queryRawUnsafe') {
      return (sql, ...params) => {
        if (typeof sql === 'object' && sql.strings) {
          const text = sql.strings.join('?');
          return db.raw(text, sql.values || params).then(([rows]) => rows);
        }
        return db.raw(sql, params).then(([rows]) => rows);
      };
    }
    if (prop === '$disconnect') return () => db.destroy();
    if (prop === 'then' || prop === 'catch') return undefined; // prevent promise detection
    if (typeof prop !== 'string') return undefined;
    // Return a model proxy for any model name
    return createModel(prop);
  },
});

module.exports = prisma;
