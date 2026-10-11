// Buyer-data retention — Amazon's Data Protection Policy requires personally
// identifiable information (PII) from Amazon orders to be deleted within 30 days
// after delivery. This job removes it from CLOSED Amazon orders:
//
//   • orders: shipping/billing address reduced to state + country, cached raw Amazon
//     copy (orders.channelData) removed
//   • order_labels: the label file/link (it prints the buyer's name and address)
//   • customers created from those orders: name, email, phone, address cleared
//
// Kept: order number, items, amounts, tax details, tracking number, courier, status
// (business and legal records). Manual / non-Amazon orders and B2B customers are never touched.
// Safe to run repeatedly: an order is marked with piiPurgedAt and skipped afterwards.

const db = require('../utils/db');
const { audit } = require('./audit.service');

const CLOSED = ['DELIVERED', 'RETURNED', 'CANCELLED'];
const RETENTION_DAYS = Math.min(30, Math.max(1, Number(process.env.PII_RETENTION_DAYS) || 30)); // never longer than 30
const BATCH = 500;

function stateAndCountry(raw) {
  let a = raw;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = null; } }
  if (!a || typeof a !== 'object') return null;
  const keep = {};
  if (a.state) keep.state = a.state;
  if (a.country) keep.country = a.country;
  return Object.keys(keep).length ? JSON.stringify(keep) : null;
}

async function purgeBuyerData({ now = new Date(), days = RETENTION_DAYS } = {}) {
  const cutoff = new Date(now.getTime() - days * 24 * 3600 * 1000);
  const totals = { orders: 0, labels: 0, customers: 0, cutoff: cutoff.toISOString(), days };

  for (let round = 0; round < 40; round++) { // up to 20,000 orders per run
    const rows = await db('orders as o')
      .join('channels as c', 'c.id', 'o.channelId')
      .whereNull('o.piiPurgedAt')
      .whereIn('o.status', CLOSED)
      .where('c.type', 'like', 'AMAZON%')
      // closed more than N days ago: delivery date when known, otherwise last change
      .whereRaw('COALESCE(o.deliveredAt, o.updatedAt) < ?', [cutoff])
      .select('o.id', 'o.tenantId', 'o.customerId', 'o.shippingAddress')
      .limit(BATCH);
    if (!rows.length) break;

    const ids = rows.map((r) => r.id);
    await db.transaction(async (trx) => {
      for (const r of rows) {
        await trx('orders').where({ id: r.id }).update({
          shippingAddress: stateAndCountry(r.shippingAddress),
          billingAddress: null,
          channelData: null,
          piiPurgedAt: now,
        });
      }
      totals.labels += await trx('order_labels').whereIn('orderId', ids).update({ content: null, url: null });
    });
    totals.orders += rows.length;

    // Customers: clear only when ALL of their orders are purged, and they are not B2B.
    const customerIds = [...new Set(rows.map((r) => r.customerId).filter(Boolean))];
    for (const cid of customerIds) {
      const open = await db('orders').where({ customerId: cid }).whereNull('piiPurgedAt').first('id');
      if (open) continue;
      const n = await db('customers').where({ id: cid }).where((b) => b.where('isB2B', 0).orWhereNull('isB2B')).whereNull('gstIn')
        .update({ name: 'Deleted customer', email: null, phone: null, address: null, city: null, updatedAt: now });
      totals.customers += n;
    }
  }

  if (totals.orders) {
    await audit({ action: 'retention.purge', resource: 'orders', metadata: totals });
  }
  return totals;
}

module.exports = { purgeBuyerData, RETENTION_DAYS };
