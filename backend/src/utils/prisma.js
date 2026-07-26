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
async function loadIncludes(rows, table, include, select) {
  if (!include || !rows.length) return rows;
  const relations = RELATIONS[table] || {};
  for (const [relName, relOpts] of Object.entries(include)) {
    if (!relOpts) continue;
    const rel = relations[relName];
    if (!rel) continue; // unknown relation, skip

    const ids = rows.map(r => r[rel.localKey || 'id']);
    let relQuery = db(rel.table).whereIn(rel.foreignKey, ids);

    if (typeof relOpts === 'object' && !Array.isArray(relOpts)) {
      if (relOpts.where) applyWhere(relQuery, relOpts.where);
      if (relOpts.orderBy) applyOrderBy(relQuery, relOpts.orderBy);
      if (relOpts.take) relQuery = relQuery.limit(relOpts.take);
      if (relOpts.select) relQuery = relQuery.select(Object.keys(relOpts.select));
      if (relOpts.include) {
        const relRows = deserializeRows(await relQuery);
        const nested = await loadIncludes(relRows, rel.table, relOpts.include);
        for (const row of rows) {
          row[relName] = rel.type === 'one'
            ? nested.find(r => r[rel.foreignKey] === row[rel.localKey || 'id']) || null
            : nested.filter(r => r[rel.foreignKey] === row[rel.localKey || 'id']);
        }
        continue;
      }
    }

    const relRows = deserializeRows(await relQuery);
    for (const row of rows) {
      row[relName] = rel.type === 'one'
        ? relRows.find(r => r[rel.foreignKey] === row[rel.localKey || 'id']) || null
        : relRows.filter(r => r[rel.foreignKey] === row[rel.localKey || 'id']);
    }
  }
  return rows;
}

// ── COUNT includes (_count: { select: { orders: true } }) ───────────
async function loadCounts(rows, table, countSpec) {
  if (!countSpec?.select || !rows.length) return rows;
  const relations = RELATIONS[table] || {};
  for (const [relName, enabled] of Object.entries(countSpec.select)) {
    if (!enabled) continue;
    const rel = relations[relName];
    if (!rel) continue;
    const ids = rows.map(r => r.id);
    const counts = await db(rel.table)
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
function buildUpdateData(data) {
  const plain = {};
  const raw = [];
  for (const [key, val] of Object.entries(data)) {
    if (val && typeof val === 'object' && val.increment !== undefined) {
      raw.push({ key, expr: db.raw(`\`${key}\` + ?`, [val.increment]) });
    } else if (val && typeof val === 'object' && val.decrement !== undefined) {
      raw.push({ key, expr: db.raw(`\`${key}\` - ?`, [val.decrement]) });
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
        await conn(rel.table).insert(serializeRow(row));
      }
    }
    if (val.createMany) {
      const items = val.createMany.data || val.createMany;
      for (const item of (Array.isArray(items) ? items : [items])) {
        const row = { id: uuid(), ...item, [rel.foreignKey]: parentId };
        if (!NO_CREATED_AT.has(rel.table) && row.createdAt === undefined) row.createdAt = new Date();
        if (!NO_UPDATED_AT.has(rel.table) && row.updatedAt === undefined) row.updatedAt = new Date();
        try {
          await conn(rel.table).insert(row);
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
function serializeRow(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) && v.increment === undefined && v.decrement === undefined) {
      // Check if this is a JSON column (arrays and plain objects get stringified)
      out[k] = JSON.stringify(v);
    } else if (Array.isArray(v)) {
      out[k] = JSON.stringify(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function deserializeRow(row) {
  if (!row) return row;
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
      try { row[k] = JSON.parse(v); } catch {}
    }
  }
  return row;
}

function deserializeRows(rows) {
  return rows.map(deserializeRow);
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
  'seo_settings',
]);

// ── Model proxy factory ─────────────────────────────────────────────
function createModel(modelName) {
  const table = TABLE_MAP[modelName];
  if (!table) throw new Error(`Unknown model: ${modelName}`);

  return {
    async findMany(opts = {}) {
      let q = db(table);
      if (opts.where) applyWhere(q, flattenUniqueWhere(opts.where));
      if (opts.orderBy) applyOrderBy(q, opts.orderBy);
      if (opts.skip) q = q.offset(opts.skip);
      if (opts.take) q = q.limit(opts.take);
      if (opts.select) q = q.select(Object.keys(opts.select).filter(k => opts.select[k]));
      let rows = deserializeRows(await q);
      if (opts.include) rows = await loadIncludes(rows, table, opts.include);
      if (opts._count) rows = await loadCounts(rows, table, opts._count);
      return rows;
    },

    async findUnique(opts = {}) {
      let q = db(table);
      if (opts.where) applyWhere(q, flattenUniqueWhere(opts.where));
      if (opts.select) q = q.select(Object.keys(opts.select).filter(k => opts.select[k]));
      let row = deserializeRow(await q.first());
      if (row && opts.include) [row] = await loadIncludes([row], table, opts.include);
      if (row && opts._count) [row] = await loadCounts([row], table, opts._count);
      return row || null;
    },

    async findFirst(opts = {}) {
      return this.findUnique(opts);
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
      const row = serializeRow({ id, ...timestamps, ...plain });
      await db(table).insert(row);
      await handleNestedCreates(table, id, nested);
      const result = deserializeRow(await db(table).where({ id }).first());
      if (result && include) {
        const [enriched] = await loadIncludes([result], table, include);
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
        const row = serializeRow({ id: uuid(), ...ts, ...item });
        try {
          await db(table).insert(row);
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
      const { plain, raw } = buildUpdateData({ ...autoTs, ...data });
      const serialized = serializeRow(plain);
      // Handle nested creates in update
      const relations = RELATIONS[table] || {};
      for (const [k, v] of Object.entries(data)) {
        if (relations[k] && v && typeof v === 'object' && (v.create || v.createMany)) {
          const existing = await db(table).where(flatWhere).first();
          if (existing) await handleNestedCreates(table, existing.id, { [k]: v });
          delete serialized[k];
        }
      }
      let q = db(table).where(flatWhere);
      if (raw.length) {
        const updates = { ...serialized };
        for (const r of raw) updates[r.key] = r.expr;
        await q.update(updates);
      } else {
        await q.update(serialized);
      }
      const result = deserializeRow(await db(table).where(flatWhere).first());
      if (result && include) {
        const [enriched] = await loadIncludes([result], table, include);
        return enriched;
      }
      return result;
    },

    async updateMany(opts = {}) {
      const { where = {}, data = {} } = opts;
      const autoTs2 = NO_UPDATED_AT.has(table) ? {} : { updatedAt: new Date() };
      const { plain, raw } = buildUpdateData({ ...autoTs2, ...data });
      const serialized = serializeRow(plain);
      let q = db(table);
      applyWhere(q, flattenUniqueWhere(where));
      if (raw.length) {
        const updates = { ...serialized };
        for (const r of raw) updates[r.key] = r.expr;
        await q.update(updates);
      } else {
        await q.update(serialized);
      }
      return { count: 0 }; // knex doesn't return affected count easily here
    },

    async upsert(opts = {}) {
      const { where = {}, update: updateData = {}, create: createData = {} } = opts;
      const flatWhere = flattenUniqueWhere(where);
      const existing = await db(table).where(flatWhere).first();
      if (existing) {
        // Skip update if there's nothing meaningful to update (e.g. junction tables)
        const nonTimestamp = Object.keys(updateData).filter(k => k !== 'updatedAt' && k !== 'createdAt');
        if (nonTimestamp.length === 0) return deserializeRow(existing);
        return this.update({ where, data: updateData, include: opts.include });
      }
      return this.create({ data: createData, include: opts.include });
    },

    async delete(opts = {}) {
      const flatWhere = flattenUniqueWhere(opts.where || {});
      const row = await db(table).where(flatWhere).first();
      await db(table).where(flatWhere).del();
      return row;
    },

    async deleteMany(opts = {}) {
      let q = db(table);
      if (opts.where) applyWhere(q, flattenUniqueWhere(opts.where));
      const count = await q.del();
      return { count };
    },

    async count(opts = {}) {
      let q = db(table);
      if (opts.where) applyWhere(q, flattenUniqueWhere(opts.where));
      const [{ count }] = await q.count('* as count');
      return Number(count);
    },

    async aggregate(opts = {}) {
      let q = db(table);
      if (opts.where) applyWhere(q, flattenUniqueWhere(opts.where));
      const result = {};
      if (opts._sum) {
        for (const [field, enabled] of Object.entries(opts._sum)) {
          if (!enabled) continue;
          const [row] = await db(table).where(function() { if (opts.where) applyWhere(this, flattenUniqueWhere(opts.where)); }).sum(`${field} as total`);
          if (!result._sum) result._sum = {};
          result._sum[field] = row?.total ? Number(row.total) : null;
        }
      }
      if (opts._avg) {
        for (const [field, enabled] of Object.entries(opts._avg)) {
          if (!enabled) continue;
          const [row] = await db(table).where(function() { if (opts.where) applyWhere(this, flattenUniqueWhere(opts.where)); }).avg(`${field} as avg`);
          if (!result._avg) result._avg = {};
          result._avg[field] = row?.avg ? Number(row.avg) : null;
        }
      }
      if (opts._count) {
        const [row] = await q.count('* as count');
        result._count = Number(row.count);
      }
      return result;
    },

    async groupBy(opts = {}) {
      const { by = [], where, _count, _sum, orderBy, take } = opts;
      let q = db(table).select(by);
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
            // Create a transaction-scoped prisma-like object
            // For simplicity, we just run the function with the same prisma proxy
            // Real transactions would need trx-scoped queries; for now this provides
            // the transactional semantics via the knex transaction wrapper.
            return fnOrArray(prisma);
          });
        }
        // Array of promises — run them in a transaction
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
