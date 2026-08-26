// Order-driven stock movements for SELF-fulfilled (MFN / Shopify / custom) orders.
//
// The loop the seller cares about:
//   reserve on order  →  deduct (OUTBOUND) on ship  →  release on cancel
//                                                    →  add back (RETURN) on return/RTO
//
// Kartriq is the source of truth for merchant-fulfilled stock: it seeds from the
// channel catalogue once, then owns the number here, and the inventory-push job
// syncs the new availability out to every channel (so selling on one channel
// lowers stock everywhere — no overselling). FBA/CHANNEL orders never touch
// inventory (Amazon owns that stock).
//
// applyOrderStock() is IDEMPOTENT — it keys off order.stockStatus, so calling it
// repeatedly (on every sync / status change) only ever applies each transition
// once.

const db = require('../utils/db');
const prisma = require('../utils/prisma');
const { randomUUID } = require('crypto');

const SHIPPED_STATES = ['SHIPPED', 'PARTIALLY_SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

// Atomically adjust an existing inventory row. Returns the number of rows
// changed (0 if the SKU isn't tracked in this warehouse — then we skip, since
// we can't move stock that isn't there).
async function adjustInventory(tenantId, warehouseId, variantId, { onHand = 0, reserved = 0, available = 0 }) {
  return db('inventory_items')
    .where({ tenantId, warehouseId, variantId })
    .update({
      quantityOnHand: db.raw('quantityOnHand + ?', [onHand]),
      quantityReserved: db.raw('quantityReserved + ?', [reserved]),
      quantityAvailable: db.raw('quantityAvailable + ?', [available]),
      updatedAt: new Date(),
    });
}

async function recordMovement(tenantId, warehouseId, variantId, type, quantity, orderId) {
  await db('stock_movements').insert({
    id: randomUUID(),
    tenantId, warehouseId, variantId, type,
    quantity: Math.abs(quantity),
    referenceId: orderId || null,
    referenceType: 'ORDER',
    notes: null,
    createdAt: new Date(),
  });
}

// Make sure a (warehouse, variant) inventory row exists, creating a zero row if
// not. This is what makes merchant-fulfilled (MFN) products actually show up in
// Inventory: an order syncs → we guarantee its SKUs have a row in the seller's
// warehouse (qty 0) → the seller sets the real quantity from Kartriq. Without
// this, adjustInventory (an UPDATE) silently no-ops for a SKU that was never
// seeded by a catalog pull, and the product never appears.
async function ensureInventoryRow(tenantId, warehouseId, variantId) {
  const existing = await db('inventory_items').where({ tenantId, warehouseId, variantId }).first();
  if (existing) return;
  const variant = await db('product_variants').where({ id: variantId }).first();
  if (!variant || !variant.productId) return;
  try {
    await db('inventory_items').insert({
      id: randomUUID(),
      tenantId, warehouseId,
      productId: variant.productId,
      variantId,
      quantityOnHand: 0, quantityReserved: 0, quantityAvailable: 0,
      reorderPoint: 0, reorderQty: 0,
      updatedAt: new Date(),
    });
  } catch {
    // UNIQUE(warehouseId, variantId) race — another path created it. Ignore.
  }
}

// Ensure inventory rows exist for every SKU on a self-fulfilled order, without
// moving any stock. Called on every order sync (new AND existing) so an MFN
// order's products always surface in Inventory — even ones imported before the
// row-seeding existed, and even when the order's status hasn't changed.
async function ensureInventoryForOrder(order, items) {
  if (!order || order.fulfillmentType !== 'SELF' || !order.warehouseId) return;
  if (!Array.isArray(items) || !items.length) return;
  for (const it of items) {
    if (it.variantId) await ensureInventoryRow(order.tenantId, order.warehouseId, it.variantId);
  }
}

// Drive the order's stock to the correct state for its current status.
// `items` = [{ variantId, qty }]. Best-effort: never throws into the caller.
async function applyOrderStock(order, items) {
  try {
    if (!order || order.fulfillmentType !== 'SELF') return;       // FBA/channel-fulfilled: skip
    if (!order.warehouseId || !Array.isArray(items) || !items.length) return;

    const tid = order.tenantId;
    const wh = order.warehouseId;

    // Guarantee every SKU on this order has an inventory row in the warehouse,
    // so merchant-fulfilled products appear in Inventory (seller then sets qty).
    for (const it of items) {
      if (it.variantId) await ensureInventoryRow(tid, wh, it.variantId);
    }
    const ss = order.stockStatus || null;
    const st = String(order.status || '').toUpperCase();
    const isShipped = SHIPPED_STATES.includes(st);
    const isReturned = st === 'RETURNED' || st === 'REFUNDED';
    const isCancelled = st === 'CANCELLED';

    const setSS = async (val) => {
      await prisma.order.update({ where: { id: order.id }, data: { stockStatus: val } }).catch(() => {});
      order.stockStatus = val;
    };
    const forEachItem = async (fn) => {
      for (const it of items) {
        if (it.variantId && Number(it.qty) > 0) await fn(it.variantId, Number(it.qty));
      }
    };

    // Returned / RTO — bring stock back if it had been deducted; release if only reserved.
    if (isReturned) {
      if (ss === 'DEDUCTED') {
        await forEachItem(async (v, q) => {
          const n = await adjustInventory(tid, wh, v, { onHand: q, available: q });
          if (n) await recordMovement(tid, wh, v, 'RETURN', q, order.id);
        });
        await setSS('RETURNED');
      } else if (ss === 'RESERVED') {
        await forEachItem((v, q) => adjustInventory(tid, wh, v, { reserved: -q, available: q }));
        await setSS('RELEASED');
      }
      return;
    }

    // Cancelled — release a reservation, or bring back stock if already shipped-then-cancelled.
    if (isCancelled) {
      if (ss === 'RESERVED') {
        await forEachItem((v, q) => adjustInventory(tid, wh, v, { reserved: -q, available: q }));
        await setSS('RELEASED');
      } else if (ss === 'DEDUCTED') {
        await forEachItem(async (v, q) => {
          const n = await adjustInventory(tid, wh, v, { onHand: q, available: q });
          if (n) await recordMovement(tid, wh, v, 'RETURN', q, order.id);
        });
        await setSS('RETURNED');
      }
      return;
    }

    // Shipped — finalise the sale (OUTBOUND). Convert a reservation, or deduct fresh.
    if (isShipped) {
      if (ss === 'RESERVED') {
        await forEachItem(async (v, q) => {
          const n = await adjustInventory(tid, wh, v, { onHand: -q, reserved: -q });
          if (n) await recordMovement(tid, wh, v, 'OUTBOUND', q, order.id);
        });
        await setSS('DEDUCTED');
      } else if (ss === null) {
        await forEachItem(async (v, q) => {
          const n = await adjustInventory(tid, wh, v, { onHand: -q, available: -q });
          if (n) await recordMovement(tid, wh, v, 'OUTBOUND', q, order.id);
        });
        await setSS('DEDUCTED');
      }
      return;
    }

    // Open order, not yet shipped — reserve so it can't be oversold.
    if (ss === null) {
      await forEachItem((v, q) => adjustInventory(tid, wh, v, { reserved: q, available: -q }));
      await setSS('RESERVED');
    }
  } catch (e) {
    console.warn(`[stock] applyOrderStock failed for order ${order?.id}: ${e.message}`);
  }
}

// One-shot backfill: seed inventory rows for existing self-fulfilled orders so
// their (MFN) products appear in Inventory without waiting for another sync.
// Bounded + idempotent — safe to run on boot. Returns a small summary.
async function backfillSelfOrderInventory({ limit = 2000 } = {}) {
  const orders = await db('orders')
    .where({ fulfillmentType: 'SELF' })
    .whereNotNull('warehouseId')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .select('id', 'tenantId', 'warehouseId', 'fulfillmentType');
  let seeded = 0;
  for (const o of orders) {
    const items = await db('order_items').where({ orderId: o.id }).select('variantId');
    for (const it of items) {
      if (!it.variantId) continue;
      const before = await db('inventory_items')
        .where({ tenantId: o.tenantId, warehouseId: o.warehouseId, variantId: it.variantId }).first();
      if (before) continue;
      await ensureInventoryRow(o.tenantId, o.warehouseId, it.variantId);
      seeded++;
    }
  }
  return { orders: orders.length, seeded };
}

module.exports = { applyOrderStock, ensureInventoryRow, ensureInventoryForOrder, backfillSelfOrderInventory };
