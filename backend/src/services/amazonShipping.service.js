// Amazon Buy Shipping (MFN) automation.
//
// When a self-fulfilled (MFN) Amazon order is CONFIRMED and its channel has
// "auto-book courier" switched on, we do the whole booking without the seller
// choosing anything:
//
//   1. ask Amazon for eligible shipping services (rates)
//   2. pick the CHEAPEST one (ties → earliest delivery)
//   3. buy it → Amazon books the shipment + returns tracking + the label
//   4. store the label so it can be reprinted any time
//   5. mark the order SHIPPED with the tracking and deduct stock
//
// On any failure nothing is bought, the order keeps its status, and the reason
// is stored in orders.shippingError so the UI can show it with a Retry button.
// The whole thing is idempotent: an order with an ACTIVE label is never booked
// twice.

const db = require('../utils/db');
const prisma = require('../utils/prisma');
const { randomUUID } = require('crypto');
const { getAdapter } = require('./channel.service');
const { applyOrderStock } = require('./stock.service');

// Fallback parcel when products carry no weight/size. Amazon needs both to rate.
const DEFAULT_WEIGHT_G = 500;
const DEFAULT_DIMS_CM = { length: 20, width: 15, height: 10 };

function isAmazonChannelType(type) {
  return String(type || '').toUpperCase().includes('AMAZON');
}

// Parcel weight (grams) and dimensions (cm) from the order's own products.
// Product/variant weight is stored in KG. Weight = Σ(item weight × qty); size =
// the largest length/width/height seen across items (a safe single-box upper
// bound). Anything missing falls back to the defaults and is reported in
// `usedDefaults` so callers/tests can see what was assumed.
async function resolveParcel(order) {
  const items = await prisma.orderItem.findMany({
    where: { orderId: order.id },
    include: { variant: { include: { product: true } } },
  });
  let kg = 0;
  let weighted = 0;
  const dims = { length: 0, width: 0, height: 0 };
  for (const it of items) {
    const qty = Number(it.qty ?? it.quantity ?? 1) || 1;
    const w = Number(it.variant?.weight) || Number(it.variant?.product?.weight) || 0;
    if (w > 0) { kg += w * qty; weighted++; }
    let d = it.variant?.product?.dimensions;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
    if (d && typeof d === 'object') {
      dims.length = Math.max(dims.length, Number(d.length) || 0);
      dims.width = Math.max(dims.width, Number(d.width) || 0);
      dims.height = Math.max(dims.height, Number(d.height) || 0);
    }
  }
  const haveWeight = weighted > 0;
  const haveDims = dims.length > 0 && dims.width > 0 && dims.height > 0;
  return {
    weight: { value: haveWeight ? Math.max(1, Math.round(kg * 1000)) : DEFAULT_WEIGHT_G, unit: 'grams' },
    dimensions: { ...(haveDims ? dims : DEFAULT_DIMS_CM), unit: 'centimeters' },
    usedDefaults: { weight: !haveWeight, dimensions: !haveDims },
  };
}

// Cheapest rate wins; if prices tie, the earliest estimated delivery wins.
function pickCheapest(rates) {
  const usable = (rates || []).filter((r) => r && r.serviceId && Number.isFinite(Number(r.amount)));
  if (!usable.length) return null;
  return usable.slice().sort((a, b) => {
    if (a.amount !== b.amount) return a.amount - b.amount;
    const ad = a.estimatedDelivery ? new Date(a.estimatedDelivery).getTime() : Infinity;
    const bd = b.estimatedDelivery ? new Date(b.estimatedDelivery).getTime() : Infinity;
    return ad - bd;
  })[0];
}

function warehouseShipFrom(wh) {
  if (!wh) return {};
  const a = wh.address || {};
  return {
    name: wh.name, line1: a.line1, line2: a.line2, city: a.city, state: a.state,
    pincode: a.pincode, country: a.country || 'IN', phone: wh.phone || a.phone, email: a.email,
  };
}

// Persist a bought label, ship the order, move stock. Shared by the automatic
// flow and the manual "Buy label" route so both behave identically.
async function recordPurchasedLabel(order, channelId, result) {
  const labelId = randomUUID();
  await db('order_labels').insert({
    id: labelId,
    tenantId: order.tenantId,
    orderId: order.id,
    channelId,
    shipmentId: result.shipmentId || null,
    trackingNumber: result.trackingId || null,
    carrier: result.carrier || null,
    serviceName: result.serviceName || null,
    cost: result.cost?.amount ?? null,
    currency: result.cost?.currency || null,
    mime: result.label?.mime || null,
    content: result.label?.contentBase64 || null,
    status: 'ACTIVE',
  });

  if (!result.trackingId) return { labelId, shipped: false };

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      trackingNumber: result.trackingId,
      courierName: result.carrier || 'Amazon',
      channelShipmentId: result.shipmentId || null,
      status: 'SHIPPED',
      shippedAt: new Date(),
      needsApproval: false,
      shippingError: null,
    },
  });
  // Deduct stock for the now-shipped self-fulfilled order (idempotent).
  if (updated.fulfillmentType === 'SELF' && updated.warehouseId) {
    const items = await prisma.orderItem.findMany({ where: { orderId: updated.id } });
    await applyOrderStock(updated, items);
  }
  return { labelId, shipped: true, order: updated };
}

async function recordError(orderId, message) {
  await prisma.order.update({
    where: { id: orderId },
    data: { shippingError: String(message).slice(0, 1000) },
  }).catch(() => {});
}

// Main entry. Never throws: returns { booked, skipped?, error?, ... }.
async function autoBookAmazonShipping(orderId, { tenantId, force = false } = {}) {
  try {
    const order = await prisma.order.findFirst({ where: { id: orderId, ...(tenantId ? { tenantId } : {}) } });
    if (!order) return { booked: false, skipped: 'order not found' };
    if (!order.channelId || !order.channelOrderId) return { booked: false, skipped: 'not a channel order' };
    if (order.fulfillmentType !== 'SELF') return { booked: false, skipped: 'not self-fulfilled (FBA/channel ships it)' };
    if (['SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'].includes(order.status)) {
      return { booked: false, skipped: `order is ${order.status}` };
    }

    const channel = await prisma.channel.findFirst({ where: { id: order.channelId, tenantId: order.tenantId } });
    if (!channel) return { booked: false, skipped: 'channel not found' };
    if (!isAmazonChannelType(channel.type)) return { booked: false, skipped: 'not an Amazon channel' };
    if (!force && !channel.autoBookShipping) return { booked: false, skipped: 'auto-book courier is off for this channel' };

    // Idempotency: never buy a second label for an order that already has one.
    const existing = await db('order_labels')
      .where({ tenantId: order.tenantId, orderId: order.id, status: 'ACTIVE' }).first();
    if (existing) return { booked: false, skipped: 'label already bought', labelId: existing.id };

    const adapter = getAdapter(channel);
    if (typeof adapter.getMfnRates !== 'function' || typeof adapter.buyMfnShipping !== 'function') {
      return { booked: false, skipped: 'channel does not support Amazon Buy Shipping' };
    }

    const wh = order.warehouseId
      ? await prisma.warehouse.findFirst({ where: { id: order.warehouseId, tenantId: order.tenantId } })
      : null;
    if (!wh) {
      const msg = 'No ship-from warehouse on this order';
      await recordError(order.id, msg);
      return { booked: false, error: msg };
    }
    const shipFrom = warehouseShipFrom(wh);
    if (!shipFrom.pincode || !shipFrom.city) {
      const msg = `Warehouse "${wh.name}" has no city/pincode — add its address so Amazon can quote a courier`;
      await recordError(order.id, msg);
      return { booked: false, error: msg };
    }

    const parcel = await resolveParcel(order);
    const rates = await adapter.getMfnRates(order.channelOrderId, {
      shipFrom, weight: parcel.weight, dimensions: parcel.dimensions,
    });
    const best = pickCheapest(rates);
    if (!best) {
      const msg = 'Amazon returned no eligible courier for this order';
      await recordError(order.id, msg);
      return { booked: false, error: msg };
    }

    const result = await adapter.buyMfnShipping(order.channelOrderId, {
      shipFrom, weight: parcel.weight, dimensions: parcel.dimensions,
      shippingServiceId: best.serviceId, shippingServiceOfferId: best.serviceOfferId,
    });
    const saved = await recordPurchasedLabel(order, channel.id, result);
    return {
      booked: true,
      shipped: saved.shipped,
      labelId: saved.labelId,
      trackingNumber: result.trackingId || null,
      carrier: result.carrier || null,
      cost: result.cost || null,
      chosen: { serviceId: best.serviceId, amount: best.amount, carrier: best.carrier },
      ratesConsidered: rates.length,
      usedDefaults: parcel.usedDefaults,
      hasLabel: !!result.label,
    };
  } catch (err) {
    await recordError(orderId, err.message);
    return { booked: false, error: err.message };
  }
}

// The stored, ACTIVE label for an order (or null).
async function getActiveLabel(orderId, tenantId) {
  return db('order_labels').where({ tenantId, orderId, status: 'ACTIVE' }).orderBy('createdAt', 'desc').first();
}

// Void a label on Amazon and mark it CANCELLED locally.
async function cancelOrderLabel(orderId, tenantId) {
  const label = await getActiveLabel(orderId, tenantId);
  if (!label) return { cancelled: false, error: 'No active label for this order' };
  const channel = await prisma.channel.findFirst({ where: { id: label.channelId, tenantId } });
  if (!channel) return { cancelled: false, error: 'Channel not found' };
  const adapter = getAdapter(channel);
  if (label.shipmentId) await adapter.cancelMfnShipping(label.shipmentId);
  await db('order_labels').where({ id: label.id }).update({ status: 'CANCELLED' });
  return { cancelled: true, labelId: label.id };
}

module.exports = {
  autoBookAmazonShipping, getActiveLabel, cancelOrderLabel, recordPurchasedLabel,
  resolveParcel, pickCheapest, DEFAULT_WEIGHT_G, DEFAULT_DIMS_CM,
};
