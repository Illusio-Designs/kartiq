// "Amazon data" download — everything Amazon holds for an order, as JSON (complete,
// untouched) or CSV (one row per order, flattened so it opens in Excel).
// Data is fetched from Amazon on demand and kept on the order (orders.channelData),
// so a second download needs no new Amazon calls unless `fresh` is asked for.

const db = require('../utils/db');
const prisma = require('../utils/prisma');
const { getAdapter } = require('./channel.service');

const MAX_IDS = 200;
const MAX_LIVE = 25; // Amazon rate-limits order lookups, so cap live fetches per download

const money = (m) => (m && m.Amount != null ? Number(m.Amount) : '');
const sum = (items, f) => items.reduce((n, it) => n + (Number(it?.[f]?.Amount) || 0), 0);

function flatten(order, d) {
  const o = d?.order || {};
  const a = d?.shippingAddress || o.ShippingAddress || {};
  const b = d?.buyerInfo || {};
  const items = d?.items || [];
  return {
    'Amazon order id': order.channelOrderId,
    'Kartriq order': order.orderNumber,
    'Amazon status': o.OrderStatus || '',
    'Kartriq status': order.status,
    'Shipment status': order.shipmentStatus || '',
    'Tracking number': order.trackingNumber || '',
    'Courier': order.courierName || '',
    'Fulfillment channel': o.FulfillmentChannel || (order.fulfillmentType === 'CHANNEL' ? 'AFN' : 'MFN'),
    'Sales channel': o.SalesChannel || '',
    'Purchase date': o.PurchaseDate || '',
    'Last update': o.LastUpdateDate || '',
    'Ship service level': o.ShipServiceLevel || '',
    'Service level category': o.ShipmentServiceLevelCategory || '',
    'Earliest ship date': o.EarliestShipDate || '',
    'Latest ship date': o.LatestShipDate || '',
    'Earliest delivery date': o.EarliestDeliveryDate || '',
    'Latest delivery date': o.LatestDeliveryDate || '',
    'Prime': o.IsPrime ?? '',
    'Business order': o.IsBusinessOrder ?? '',
    'Payment method': o.PaymentMethod || '',
    'Order total': money(o.OrderTotal) === '' ? order.total : money(o.OrderTotal),
    'Currency': o.OrderTotal?.CurrencyCode || '',
    'Items ordered': o.NumberOfItemsUnshipped != null ? Number(o.NumberOfItemsUnshipped) + Number(o.NumberOfItemsShipped || 0) : items.reduce((n, it) => n + (Number(it.QuantityOrdered) || 0), 0),
    'Item price': sum(items, 'ItemPrice'),
    'Item tax': sum(items, 'ItemTax'),
    'Shipping price': sum(items, 'ShippingPrice'),
    'Shipping tax': sum(items, 'ShippingTax'),
    'Promotion discount': sum(items, 'PromotionDiscount'),
    'SKUs': items.map((it) => it.SellerSKU).join(' | '),
    'ASINs': items.map((it) => it.ASIN).join(' | '),
    'Products': items.map((it) => `${it.Title || ''} x${it.QuantityOrdered}`).join(' | '),
    'Buyer name': b.BuyerName || a.Name || '',
    'Buyer email': b.BuyerEmail || '',
    'Ship-to name': a.Name || '',
    'Ship-to line 1': a.AddressLine1 || '',
    'Ship-to line 2': a.AddressLine2 || '',
    'Ship-to city': a.City || '',
    'Ship-to state': a.StateOrRegion || '',
    'Ship-to pincode': a.PostalCode || '',
    'Ship-to country': a.CountryCode || '',
    'Ship-to phone': a.Phone || '',
    'Amazon notes': (d?.notes || []).join(' ; '),
  };
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  return '﻿' + [cols.map(csvCell).join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n');
}

// Returns { orders: [{ id, orderNumber, channelOrderId, data }], skipped: [{id, reason}] }.
async function loadAmazonData(ids, tenantId, { fresh = false } = {}) {
  const unique = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
  if (!unique.length) return { status: 400, error: 'Select at least one order' };
  if (unique.length > MAX_IDS) return { status: 400, error: `You can download at most ${MAX_IDS} orders at once` };
  const orders = await prisma.order.findMany({ where: { id: { in: unique }, tenantId }, take: MAX_IDS });
  const byId = new Map(orders.map((o) => [o.id, o]));
  const channels = new Map();
  const out = []; const skipped = []; let live = 0;
  for (const id of unique) {
    const o = byId.get(id);
    if (!o) { skipped.push({ id, reason: 'Order not found' }); continue; }
    if (!o.channelOrderId || !o.channelId) { skipped.push({ id, order: o.orderNumber, reason: 'Not a marketplace order' }); continue; }
    let data = null;
    if (o.channelData && !fresh) { try { data = JSON.parse(o.channelData); } catch { data = null; } }
    if (!data) {
      if (live >= MAX_LIVE) { skipped.push({ id, order: o.channelOrderId, reason: `Download fewer at a time — ${MAX_LIVE} fresh orders per download (the rest are saved after you try again)` }); continue; }
      try {
        if (!channels.has(o.channelId)) channels.set(o.channelId, await prisma.channel.findFirst({ where: { id: o.channelId, tenantId } }));
        const ch = channels.get(o.channelId);
        const adapter = ch ? getAdapter(ch) : null;
        if (!adapter || typeof adapter.fetchOrderRaw !== 'function') { skipped.push({ id, order: o.channelOrderId, reason: 'This channel does not provide a raw order download' }); continue; }
        if (live > 0) await new Promise((r) => setTimeout(r, Number(process.env.AMAZON_DATA_PAUSE_MS ?? 600)));
        live++;
        data = await adapter.fetchOrderRaw(o.channelOrderId);
        await db('orders').where({ id: o.id }).update({ channelData: JSON.stringify(data) });
      } catch (e) {
        skipped.push({ id, order: o.channelOrderId, reason: `Amazon would not return it: ${e.response?.data?.errors?.[0]?.message || e.message}` });
        continue;
      }
    }
    out.push({ order: o, data });
  }
  return { out, skipped };
}

async function buildAmazonData(ids, tenantId, { format = 'csv', fresh = false } = {}) {
  const r = await loadAmazonData(ids, tenantId, { fresh });
  if (r.error) return r;
  if (!r.out.length) return { status: 400, error: 'Nothing to download', skipped: r.skipped };
  if (format === 'json') {
    const body = JSON.stringify(r.out.map(({ order, data }) => ({
      kartriq: { id: order.id, orderNumber: order.orderNumber, status: order.status, shipmentStatus: order.shipmentStatus, trackingNumber: order.trackingNumber, courierName: order.courierName },
      amazon: data,
    })), null, 2);
    return { body, mime: 'application/json', ext: 'json', count: r.out.length, skipped: r.skipped };
  }
  return { body: toCsv(r.out.map(({ order, data }) => flatten(order, data))), mime: 'text/csv; charset=utf-8', ext: 'csv', count: r.out.length, skipped: r.skipped };
}

module.exports = { buildAmazonData, flatten, MAX_IDS, MAX_LIVE };
