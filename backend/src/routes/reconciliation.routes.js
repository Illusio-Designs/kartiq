const { Router } = require('express');
const {
  authenticate, requireTenant, requirePermission, requireFeature,
} = require('../middleware/auth.middleware');
const db = require('../utils/db');

const router = Router();
router.use(authenticate, requireTenant);
router.use(requireFeature('paymentReconciliation'));

// Payment reconciliation summary.
//
// Marketplaces pay out in settlement batches (channel_settlements) rather than
// per order, so an exact per-line match isn't possible from the data we store.
// What we CAN do — and what sellers actually reconcile at month end — is compare
// the gross value of orders sold on a channel against what the channel actually
// remitted, net of refunds, and surface the gap (marketplace fees + any
// short-payment). This endpoint computes that expected-vs-settled picture per
// channel and overall.
const rangeFromQuery = (q) => {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
  return { from, to };
};

router.get('/summary', requirePermission('billing.read'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { from, to } = rangeFromQuery(req.query);
    const channelId = req.query.channelId || null;

    // Gross order value per channel — channel-fulfilled/sold orders, excluding
    // cancelled, in the window.
    const orderQ = db('orders as o')
      .leftJoin('channels as c', 'c.id', 'o.channelId')
      .where('o.tenantId', tenantId)
      .whereNotNull('o.channelId')
      .whereNot('o.status', 'CANCELLED')
      .whereBetween('o.createdAt', [from, to]);
    if (channelId) orderQ.where('o.channelId', channelId);
    const orderRows = await orderQ
      .groupBy('o.channelId', 'c.name')
      .select('o.channelId as channelId', 'c.name as channelName')
      .count('o.id as orders')
      .sum('o.total as grossOrderValue');

    // Settled payouts per channel (fundTransferDate in window).
    const setQ = db('channel_settlements as s')
      .leftJoin('channels as c', 'c.id', 's.channelId')
      .where('s.tenantId', tenantId)
      .whereBetween('s.fundTransferDate', [from, to]);
    if (channelId) setQ.where('s.channelId', channelId);
    const settleRows = await setQ
      .groupBy('s.channelId', 'c.name')
      .select('s.channelId as channelId', 'c.name as channelName')
      .count('s.id as settlements')
      .sum('s.total as settledPayout');

    // Refunds per channel (channel_returns in window).
    const retQ = db('channel_returns as r')
      .where('r.tenantId', tenantId)
      .whereBetween('r.returnDate', [from, to]);
    if (channelId) retQ.where('r.channelId', channelId);
    const returnRows = await retQ
      .groupBy('r.channelId')
      .select('r.channelId as channelId')
      .sum('r.refundAmount as refunds');

    // Merge the three per-channel aggregates.
    const byId = new Map();
    const pick = (id, name) => {
      if (!byId.has(id)) byId.set(id, { channelId: id, channelName: name || 'Unknown channel', orders: 0, grossOrderValue: 0, settledPayout: 0, refunds: 0 });
      const row = byId.get(id);
      if (name && (!row.channelName || row.channelName === 'Unknown channel')) row.channelName = name;
      return row;
    };
    for (const r of orderRows) {
      const row = pick(r.channelId, r.channelName);
      row.orders = Number(r.orders || 0);
      row.grossOrderValue = Number(r.grossOrderValue || 0);
    }
    for (const r of settleRows) {
      const row = pick(r.channelId, r.channelName);
      row.settlements = Number(r.settlements || 0);
      row.settledPayout = Number(r.settledPayout || 0);
    }
    for (const r of returnRows) {
      const row = pick(r.channelId, null);
      row.refunds = Number(r.refunds || 0);
    }

    const byChannel = Array.from(byId.values()).map((row) => {
      // Expected net to receive = gross sold − refunds. Variance vs what the
      // marketplace actually remitted. Negative variance = fees / short-payment.
      const netExpected = row.grossOrderValue - row.refunds;
      const variance = row.settledPayout - netExpected;
      return {
        ...row,
        netExpected,
        variance,
        variancePct: netExpected ? Number(((variance / netExpected) * 100).toFixed(1)) : 0,
      };
    }).sort((a, b) => b.grossOrderValue - a.grossOrderValue);

    const totals = byChannel.reduce((t, r) => ({
      orders: t.orders + r.orders,
      grossOrderValue: t.grossOrderValue + r.grossOrderValue,
      settledPayout: t.settledPayout + r.settledPayout,
      refunds: t.refunds + r.refunds,
    }), { orders: 0, grossOrderValue: 0, settledPayout: 0, refunds: 0 });
    totals.netExpected = totals.grossOrderValue - totals.refunds;
    totals.variance = totals.settledPayout - totals.netExpected;
    totals.variancePct = totals.netExpected ? Number(((totals.variance / totals.netExpected) * 100).toFixed(1)) : 0;

    // Recent settlements for the detail table.
    const settlementsQ = db('channel_settlements as s')
      .leftJoin('channels as c', 'c.id', 's.channelId')
      .where('s.tenantId', tenantId)
      .whereBetween('s.fundTransferDate', [from, to]);
    if (channelId) settlementsQ.where('s.channelId', channelId);
    const settlements = await settlementsQ
      .orderBy('s.fundTransferDate', 'desc')
      .limit(50)
      .select(
        's.id', 's.channelId', 'c.name as channelName', 's.groupId',
        's.total', 's.currency', 's.fundTransferStatus', 's.fundTransferDate',
      );

    res.json({
      range: { from, to },
      totals,
      byChannel,
      settlements,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
