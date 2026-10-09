// Shipment service — "Confirm" an order and follow the parcel to the door.
//
// One flow for every self-shipped (MFN) order; only the provider differs:
//
//   channel.mfnShipping = 'AMAZON'  → Amazon arranges the courier
//        India (IN)  : Easy Ship — schedule a pickup slot, Amazon books the courier + label
//        elsewhere   : Buy Shipping — cheapest quoted service, label comes back at once
//   channel.mfnShipping = 'OWN'     → the seller's own courier partner (a connected
//        LOGISTICS channel: iThink, Shiprocket, Delhivery, Xpressbees, …)
//
// Confirm books the courier and stores the label (order → CONFIRMED, shipment BOOKED).
// A background poll (and the Refresh button) then moves the SHIPMENT status forward;
// the order becomes SHIPPED — and stock leaves the shelf — when the courier picks up.
// Everything is idempotent (an order with an ACTIVE label is never booked twice) and
// errors never throw to callers: they are stored in orders.shippingError.

const axios = require('axios');
const db = require('../../utils/db');
const prisma = require('../../utils/prisma');
const { randomUUID } = require('crypto');
const { getAdapter, confirmChannelShipment } = require('../channel.service');
const { applyOrderStock, unshipOrderStock } = require('../stock.service');
const { normalizeStatus, orderStatusFor, canMove, TERMINAL } = require('./status');
const { resolveParcel, pickCheapest, warehouseShipFrom, getActiveLabel } = require('../amazonShipping.service');

const BULK_CONFIRM_MAX = 50;
const CANCELLABLE = ['BOOKED', 'PICKUP_SCHEDULED']; // before the courier collects
const CLOSED_ORDER = ['SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];

const isAmazonType = (t) => String(t || '').toUpperCase().includes('AMAZON');
const msg = (e) => String(e?.response?.data?.message || e?.response?.data?.error || e?.message || e).slice(0, 500);

function parcelForCourier(parcel) {
  return {
    weightKg: Math.max(0.01, (parcel.weight?.value || 500) / 1000),
    lengthCm: parcel.dimensions?.length, widthCm: parcel.dimensions?.width, heightCm: parcel.dimensions?.height,
  };
}

async function recordError(orderId, message) {
  await prisma.order.update({ where: { id: orderId }, data: { shippingError: String(message).slice(0, 1000) } }).catch(() => {});
}

async function addEvent(order, status, rawStatus, note) {
  await db('order_shipment_events').insert({
    id: randomUUID(), tenantId: order.tenantId, orderId: order.id,
    status, rawStatus: rawStatus ? String(rawStatus).slice(0, 191) : null, note: note ? String(note).slice(0, 500) : null,
  });
}

// Move an order's shipment status (forward-only), keeping the ORDER status and stock in step.
async function applyShipmentStatus(order, next, { raw = null, note = null, force = false } = {}) {
  if (!next) return { changed: false };
  if (!force && !canMove(order.shipmentStatus, next)) return { changed: false };
  const data = { shipmentStatus: next === 'CANCELLED' ? null : next, shipmentStatusAt: new Date() };
  const orderStatus = orderStatusFor(next);
  if (orderStatus && !['CANCELLED'].includes(order.status)) {
    // never drag an order backwards (e.g. DELIVERED → SHIPPED)
    const rank = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'RETURNED'];
    if (rank.indexOf(orderStatus) >= rank.indexOf(order.status) || orderStatus === 'RETURNED') data.status = orderStatus;
  }
  if (data.status === 'SHIPPED' && !order.shippedAt) data.shippedAt = new Date();
  if (data.status === 'DELIVERED') data.deliveredAt = new Date();
  const updated = await prisma.order.update({ where: { id: order.id }, data });
  await addEvent(order, next, raw, note);
  // Stock leaves the shelf when the courier collects the parcel (idempotent).
  if (data.status === 'SHIPPED' && updated.fulfillmentType === 'SELF' && updated.warehouseId) {
    const items = await prisma.orderItem.findMany({ where: { orderId: updated.id } });
    await applyOrderStock(updated, items).catch(() => {});
  }
  return { changed: true, order: updated };
}

// ── Provider resolution ──────────────────────────────────────────────────────

async function loadContext(orderId, tenantId) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: { customer: true, items: { include: { variant: { include: { product: true } } } } },
  });
  if (!order) return { error: 'Order not found', status: 404 };
  const channel = order.channelId ? await prisma.channel.findFirst({ where: { id: order.channelId, tenantId } }) : null;
  return { order, channel };
}

// Decide who books this order, or why it can't be booked.
async function resolveProvider(order, channel) {
  if (!channel || !order.channelOrderId) return { skip: 'Not a marketplace order' };
  if (order.fulfillmentType !== 'SELF') return { skip: 'Fulfilled by the marketplace (FBA) — no label needed' };
  if (!isAmazonType(channel.type)) return { skip: 'Booking is available for Amazon orders' };
  if (String(channel.mfnShipping || 'AMAZON').toUpperCase() === 'OWN') {
    if (!channel.shippingProviderId) return { error: 'Choose your courier partner in Manage channel first' };
    const courier = await prisma.channel.findFirst({ where: { id: channel.shippingProviderId, tenantId: order.tenantId } });
    if (!courier || courier.category !== 'LOGISTICS' && !courier.isActive) return { error: 'Your courier partner is not connected any more — reconnect it under Channels' };
    if (!courier.credentials) return { error: `${courier.name} is not connected — connect it under Channels first` };
    return { kind: 'COURIER', courier };
  }
  const region = String(getAdapter(channel).region || 'IN').toUpperCase();
  return { kind: region === 'IN' ? 'EASYSHIP' : 'BUYSHIPPING' };
}

async function savedLabel({ order, channelId, shipmentId, tracking, carrier, serviceName, cost, currency, label, url }) {
  const id = randomUUID();
  await db('order_labels').insert({
    id, tenantId: order.tenantId, orderId: order.id, channelId, shipmentId: shipmentId || null,
    trackingNumber: tracking || null, carrier: carrier || null, serviceName: serviceName || null,
    cost: cost ?? null, currency: currency || null, mime: label?.mime || (url ? 'application/pdf' : null),
    content: label?.contentBase64 || null, url: url || null, status: 'ACTIVE',
  });
  return id;
}

// After a successful booking: order → CONFIRMED, shipment BOOKED (+ optional first status).
async function finishBooking(order, b) {
  await prisma.order.update({
    where: { id: order.id },
    data: {
      trackingNumber: b.tracking || null, courierName: b.carrier || null, channelShipmentId: b.shipmentId || null,
      shipmentProvider: b.provider, shippingError: null, needsApproval: false,
      ...(['PENDING', 'PROCESSING'].includes(order.status) ? { status: 'CONFIRMED' } : {}),
    },
  });
  const fresh = await prisma.order.findFirst({ where: { id: order.id } });
  await applyShipmentStatus({ ...fresh, shipmentStatus: null }, 'BOOKED', { raw: 'Booked', force: true });
  if (b.firstStatus && b.firstStatus !== 'BOOKED') {
    const again = await prisma.order.findFirst({ where: { id: order.id } });
    await applyShipmentStatus(again, b.firstStatus, { raw: b.firstRaw });
  }
  // Own courier: tell the marketplace the tracking now (Amazon wants it within the
  // handling time). Amazon's own couriers already report it themselves.
  if (!String(b.provider).startsWith('AMAZON_')) {
    const r = await confirmChannelShipment(fresh, { trackingNumber: b.tracking, courierName: b.carrier });
    return { marketplaceConfirmed: !!r?.confirmed, marketplaceNote: r?.error || r?.skipped || null };
  }
  return {};
}

// ── Confirm (book) ───────────────────────────────────────────────────────────

async function bookAmazonEasyShip(order, channel, wh, parcel) {
  const adapter = getAdapter(channel);
  const slots = await adapter.listHandoverSlots(order.channelOrderId, { weight: parcel.weight, dimensions: parcel.dimensions });
  if (!slots.length) throw new Error('Amazon has no pickup slot available for this order right now');
  const slot = slots[0]; // earliest open slot
  const pkg = await adapter.createScheduledPackage(order.channelOrderId, slot, { weight: parcel.weight, dimensions: parcel.dimensions });
  let label = null; let labelError = null;
  try { label = await adapter.getEasyShipLabel(order.channelOrderId); } catch (e) { labelError = msg(e); }
  const labelId = await savedLabel({
    order, channelId: channel.id, shipmentId: pkg.packageId, tracking: pkg.trackingId, carrier: 'Amazon Easy Ship', serviceName: 'Easy Ship', label,
  });
  return {
    provider: 'AMAZON_EASYSHIP', tracking: pkg.trackingId, carrier: 'Amazon Easy Ship', shipmentId: pkg.packageId, labelId,
    hasLabel: !!label, labelError, firstStatus: pkg.packageStatus ? normalizeStatus(pkg.packageStatus) : 'PICKUP_SCHEDULED',
    firstRaw: pkg.packageStatus || 'ReadyForPickup',
  };
}

async function bookAmazonBuyShipping(order, channel, wh, parcel) {
  const adapter = getAdapter(channel);
  const shipFrom = warehouseShipFrom(wh);
  const rates = await adapter.getMfnRates(order.channelOrderId, { shipFrom, weight: parcel.weight, dimensions: parcel.dimensions });
  const best = pickCheapest(rates);
  if (!best) throw new Error('Amazon returned no eligible courier for this order');
  const r = await adapter.buyMfnShipping(order.channelOrderId, {
    shipFrom, weight: parcel.weight, dimensions: parcel.dimensions, shippingServiceId: best.serviceId, shippingServiceOfferId: best.serviceOfferId,
  });
  const labelId = await savedLabel({
    order, channelId: channel.id, shipmentId: r.shipmentId, tracking: r.trackingId, carrier: r.carrier, serviceName: r.serviceName,
    cost: r.cost?.amount, currency: r.cost?.currency, label: r.label,
  });
  return { provider: 'AMAZON_BUY', tracking: r.trackingId, carrier: r.carrier || 'Amazon', shipmentId: r.shipmentId, labelId, hasLabel: !!r.label, cost: r.cost || null };
}

async function bookCourier(order, courier, wh, parcel) {
  const adapter = getAdapter(courier);
  const forAdapter = { ...order, parcel: parcelForCourier(parcel) };
  const whAddr = { ...(wh?.address || {}), name: wh?.name, phone: wh?.phone };
  const fn = typeof adapter.bookShipment === 'function' ? 'bookShipment' : 'createShipment';
  if (typeof adapter[fn] !== 'function') throw new Error(`${courier.name} cannot book shipments yet`);
  const r = await adapter[fn](forAdapter, courier, whAddr);
  const awb = r.awbCode || r.waybill || r.trackingNumber || r.awb || null;
  if (!awb) throw new Error(`${courier.name} did not return a tracking number`);
  const ref = r.shipmentId || awb;
  let url = null; let labelError = null;
  if (typeof adapter.getLabel === 'function') {
    try { url = (await adapter.getLabel(courier.type === 'SHIPROCKET' ? ref : awb)).url; } catch (e) { labelError = msg(e); }
  } else labelError = `${courier.name} does not provide a label through the API yet — print it from their panel`;
  const labelId = await savedLabel({ order, channelId: courier.id, shipmentId: String(ref), tracking: awb, carrier: r.courierName || courier.name, serviceName: courier.name, url });
  return {
    provider: courier.type, tracking: awb, carrier: r.courierName || courier.name, shipmentId: String(ref), labelId, hasLabel: !!url, labelError,
    firstStatus: r.pickup && !r.pickup.error ? 'PICKUP_SCHEDULED' : 'BOOKED',
  };
}

// The seller's "Confirm" click. Returns { booked, error?, skipped?, ... } — never throws.
async function confirmOrder(orderId, { tenantId } = {}) {
  try {
    const ctx = await loadContext(orderId, tenantId);
    if (ctx.error) return { booked: false, skipped: ctx.error, notFound: true };
    const { order, channel } = ctx;
    if (CLOSED_ORDER.includes(order.status)) return { booked: false, skipped: `Order is ${order.status.toLowerCase()}` };

    const existing = await getActiveLabel(order.id, tenantId);
    if (existing) return { booked: false, skipped: 'Already confirmed — label saved', labelId: existing.id };

    const provider = await resolveProvider(order, channel);
    if (provider.skip) return { booked: false, skipped: provider.skip };
    if (provider.error) { await recordError(order.id, provider.error); return { booked: false, error: provider.error }; }

    const wh = order.warehouseId ? await prisma.warehouse.findFirst({ where: { id: order.warehouseId, tenantId } }) : null;
    if (!wh) { const m = 'No ship-from warehouse on this order'; await recordError(order.id, m); return { booked: false, error: m }; }
    const a = wh.address || {};
    if (!a.pincode || !a.city) {
      const m = `Warehouse "${wh.name}" has no city/pincode — add its address so the courier can collect`;
      await recordError(order.id, m); return { booked: false, error: m };
    }

    const parcel = await resolveParcel(order);
    let b;
    if (provider.kind === 'EASYSHIP') b = await bookAmazonEasyShip(order, channel, wh, parcel);
    else if (provider.kind === 'BUYSHIPPING') b = await bookAmazonBuyShipping(order, channel, wh, parcel);
    else b = await bookCourier(order, provider.courier, wh, parcel);

    const fin = await finishBooking(order, b);
    return {
      booked: true, labelId: b.labelId, trackingNumber: b.tracking || null, carrier: b.carrier || null, provider: b.provider,
      hasLabel: b.hasLabel, labelError: b.labelError || null, usedDefaults: parcel.usedDefaults, cost: b.cost || null,
      marketplaceConfirmed: fin.marketplaceConfirmed, marketplaceNote: fin.marketplaceNote || null,
    };
  } catch (err) {
    let m = msg(err);
    // Amazon says "access denied": the app has not been given the shipping role yet. Say what to do.
    if (/Easy Ship .*\(40[13]\)|Buy Shipping.*\(40[13]\)|mfn.*\(40[13]\)/i.test(m)) {
      m = 'Amazon has not given Kartriq permission to book pickups yet (403 access denied). Ask Amazon to approve the "Direct-to-Consumer Shipping" role for the app, add it to the app, then press Re-authorise on the channel — "Check now" on the channel page shows when it works. Meanwhile schedule the pickup in Seller Central, or switch the channel to your own courier. (Amazon said: ' + m.replace(/^Amazon[^:]*failed \(\d+\): /, '').replace(/ — common causes.*$/, '') + ')';
    }
    await recordError(orderId, m);
    return { booked: false, error: m };
  }
}

async function confirmBulk(ids, tenantId) {
  const unique = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
  if (!unique.length) return { status: 400, error: 'Select at least one order' };
  if (unique.length > BULK_CONFIRM_MAX) return { status: 400, error: `You can confirm at most ${BULK_CONFIRM_MAX} orders at once` };
  const results = [];
  for (const id of unique) { // one by one: couriers rate-limit and each booking can cost money
    const order = await prisma.order.findFirst({ where: { id, tenantId } });
    const r = await confirmOrder(id, { tenantId });
    results.push({
      id, order: order ? (order.orderNumber || order.channelOrderId || id) : id,
      booked: !!r.booked, trackingNumber: r.trackingNumber || null, carrier: r.carrier || null,
      reason: r.error || r.skipped || r.labelError || null, kind: r.booked ? 'booked' : r.error ? 'error' : 'skipped',
    });
  }
  return { results, booked: results.filter((x) => x.booked).length, failed: results.filter((x) => x.kind === 'error').length, skipped: results.filter((x) => x.kind === 'skipped').length };
}

// ── Label file ───────────────────────────────────────────────────────────────

// Bytes of an order's label. Uses what's stored; otherwise fetches it (courier
// link, or Amazon's Easy Ship document) once and keeps it.
async function getLabelFile(orderId, tenantId) {
  const label = await getActiveLabel(orderId, tenantId);
  if (!label) return { error: 'No label for this order yet — press Confirm first', status: 404 };
  if (label.content) return { label, buffer: Buffer.from(label.content, 'base64'), mime: label.mime || 'application/pdf' };
  try {
    let got = null;
    if (label.url) {
      const res = await axios.get(label.url, { responseType: 'arraybuffer', timeout: 20000 });
      const buf = Buffer.from(res.data);
      got = { contentBase64: buf.toString('base64'), mime: String(res.headers['content-type'] || 'application/pdf').split(';')[0] };
    } else if (label.carrier === 'Amazon Easy Ship') {
      const order = await prisma.order.findFirst({ where: { id: orderId, tenantId } });
      const channel = await prisma.channel.findFirst({ where: { id: label.channelId, tenantId } });
      got = await getAdapter(channel).getEasyShipLabel(order.channelOrderId);
    }
    if (!got) return { error: `${label.carrier || 'The courier'} does not give a label through the API — print it from their panel (tracking ${label.trackingNumber || '-'})`, status: 404, label };
    await db('order_labels').where({ id: label.id }).update({ content: got.contentBase64, mime: got.mime });
    return { label: { ...label, content: got.contentBase64, mime: got.mime }, buffer: Buffer.from(got.contentBase64, 'base64'), mime: got.mime };
  } catch (e) {
    return { error: `Label is not ready yet: ${msg(e)}`, status: 502, label };
  }
}

// ── Status refresh ───────────────────────────────────────────────────────────

async function fetchRawStatus(order) {
  const label = await getActiveLabel(order.id, order.tenantId);
  if (!label) return { none: true };
  if (order.shipmentProvider === 'AMAZON_EASYSHIP') {
    const ch = await prisma.channel.findFirst({ where: { id: label.channelId, tenantId: order.tenantId } });
    const r = await getAdapter(ch).getScheduledPackage(order.channelOrderId, label.shipmentId);
    return { raw: r.packageStatus };
  }
  if (order.shipmentProvider === 'AMAZON_BUY') return { none: true }; // Amazon gives no tracking feed for Buy Shipping
  const courier = await prisma.channel.findFirst({ where: { id: label.channelId, tenantId: order.tenantId } });
  if (!courier) return { none: true };
  const adapter = getAdapter(courier);
  if (typeof adapter.trackShipment !== 'function') return { none: true };
  const r = await adapter.trackShipment(order.trackingNumber);
  return { raw: r.currentStatus || r.status || null };
}

async function refreshShipment(orderId, { tenantId } = {}) {
  const order = await prisma.order.findFirst({ where: { id: orderId, ...(tenantId ? { tenantId } : {}) } });
  if (!order) return { error: 'Order not found' };
  if (!order.shipmentStatus) return { changed: false, status: null };
  if (TERMINAL.includes(order.shipmentStatus)) return { changed: false, status: order.shipmentStatus };
  try {
    const { raw, none } = await fetchRawStatus(order);
    if (none || !raw) return { changed: false, status: order.shipmentStatus };
    const next = normalizeStatus(raw);
    if (!next) return { changed: false, status: order.shipmentStatus, unknown: raw };
    if (next === 'CANCELLED') { // cancelled from the courier's / Amazon's side
      await db('order_labels').where({ tenantId: order.tenantId, orderId: order.id, status: 'ACTIVE' }).update({ status: 'CANCELLED' });
      await unshipAfterCancel(order);
      await addEvent(order, 'CANCELLED', raw, 'Cancelled by the courier');
      return { changed: true, status: null };
    }
    const r = await applyShipmentStatus(order, next, { raw });
    return { changed: r.changed, status: r.changed ? next : order.shipmentStatus };
  } catch (e) {
    return { changed: false, status: order.shipmentStatus, error: msg(e) };
  }
}

// ── Cancel booking (only until pickup) ───────────────────────────────────────

async function unshipAfterCancel(order) {
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      ...(order.status === 'SHIPPED' ? { status: 'CONFIRMED', shippedAt: null } : {}),
      trackingNumber: null, courierName: null, channelShipmentId: null, shipmentStatus: null, shipmentStatusAt: new Date(), shipmentProvider: null,
    },
  });
  if (order.status === 'SHIPPED') await unshipOrderStock({ ...updated, stockStatus: order.stockStatus });
}

async function cancelBooking(orderId, tenantId) {
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId } });
  if (!order) return { cancelled: false, error: 'Order not found', status: 404 };
  const label = await getActiveLabel(orderId, tenantId);
  if (!label) return { cancelled: false, error: 'No active booking for this order', status: 404 };
  if (order.shipmentStatus && !CANCELLABLE.includes(order.shipmentStatus)) {
    return { cancelled: false, error: 'The courier has already picked this parcel up — it can no longer be cancelled', status: 409 };
  }
  try {
    const ch = await prisma.channel.findFirst({ where: { id: label.channelId, tenantId } });
    if (!ch) return { cancelled: false, error: 'Channel not found', status: 404 };
    const adapter = getAdapter(ch);
    if (order.shipmentProvider === 'AMAZON_EASYSHIP') await adapter.cancelScheduledPackage(order.channelOrderId, label.shipmentId);
    else if (order.shipmentProvider === 'AMAZON_BUY') await adapter.cancelMfnShipping(label.shipmentId);
    else if (typeof adapter.cancelShipment === 'function') await adapter.cancelShipment(order.trackingNumber);
    else return { cancelled: false, error: `${ch.name} cannot cancel through the API — cancel it in their panel`, status: 400 };
  } catch (e) {
    return { cancelled: false, error: msg(e), status: 502 };
  }
  await db('order_labels').where({ id: label.id }).update({ status: 'CANCELLED' });
  await unshipAfterCancel(order);
  await addEvent(order, 'CANCELLED', null, 'Booking cancelled');
  return { cancelled: true, labelId: label.id };
}

async function getHistory(orderId, tenantId) {
  return db('order_shipment_events').where({ tenantId, orderId }).orderBy('createdAt', 'asc');
}

// Background poll: every order whose parcel is still on its way.
async function pollOpenShipments({ limit = 200 } = {}) {
  const rows = await db('orders').whereNotNull('shipmentStatus').whereNotIn('shipmentStatus', TERMINAL).orderBy('shipmentStatusAt', 'asc').limit(limit).select('id', 'tenantId');
  let changed = 0;
  for (const r of rows) {
    const out = await refreshShipment(r.id, { tenantId: r.tenantId });
    if (out.changed) changed++;
  }
  return { checked: rows.length, changed };
}

module.exports = {
  confirmOrder, confirmBulk, getLabelFile, refreshShipment, cancelBooking, getHistory, pollOpenShipments,
  applyShipmentStatus, resolveProvider, BULK_CONFIRM_MAX, CANCELLABLE,
};
