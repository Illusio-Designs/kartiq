const { Router } = require('express');
const {
  authenticate, requireTenant, requirePermission,
} = require('../middleware/auth.middleware');
const prisma = require('../utils/prisma');
const db = require('../utils/db');

const router = Router();
router.use(authenticate, requireTenant);

router.get('/sales', requirePermission('reports.read'), async (req, res) => {
  const { from, to, channelId } = req.query;
  const where = { tenantId: req.tenant.id, status: { notIn: ['CANCELLED'] } };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(String(from));
    if (to)   where.createdAt.lte = new Date(String(to));
  }
  if (channelId) where.channelId = String(channelId);

  const [orders, revenue, avgOrder] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.aggregate({ where, _sum: { total: true } }),
    prisma.order.aggregate({ where, _avg: { total: true } }),
  ]);
  res.json({
    orders,
    revenue: revenue._sum.total || 0,
    avgOrder: avgOrder._avg.total || 0,
  });
});

router.get('/inventory-valuation', requirePermission('reports.read'), async (req, res) => {
  const items = await prisma.inventoryItem.findMany({
    where: { tenantId: req.tenant.id },
    // Include the product so the report can show its name; without this the
    // frontend's `item.variant.product.name` was always blank.
    include: { variant: { include: { product: true } }, warehouse: true },
  });
  // Guard against an inventory row whose variant is missing (orphaned/deleted)
  // — reading `i.variant.costPrice` on null previously 500'd the whole report.
  const valuation = items.map((i) => ({
    ...i,
    value: Number(i.variant?.costPrice || 0) * (i.quantityOnHand || 0),
  }));
  const total = valuation.reduce((s, i) => s + i.value, 0);
  res.json({ items: valuation, totalValue: total });
});

router.get('/top-products', requirePermission('reports.read'), async (req, res) => {
  try {
    const { from, to } = req.query;
    // Raw join so we can (a) filter by the ORDER's date and (b) return real
    // product names/SKUs — the shim's groupBy can't do either cleanly.
    const rows = await db('order_items as oi')
      .join('orders as o', 'o.id', 'oi.orderId')
      .leftJoin('product_variants as v', 'v.id', 'oi.variantId')
      .leftJoin('products as p', 'p.id', 'v.productId')
      .where('oi.tenantId', req.tenant.id)
      .modify((q) => {
        if (from) q.where('o.createdAt', '>=', new Date(String(from)));
        if (to)   q.where('o.createdAt', '<=', new Date(String(to)));
      })
      .groupBy('oi.variantId', 'v.sku', 'p.name', 'v.name')
      .select('oi.variantId as variantId', 'v.sku as sku')
      .select(db.raw('COALESCE(p.name, v.name) as name'))
      .sum({ qty: 'oi.qty' })
      .sum({ revenue: 'oi.total' })
      .orderBy('qty', 'desc')
      .limit(10)
      .catch(() => []);
    res.json({
      products: rows.map((r) => ({
        variantId: r.variantId,
        name: r.name || '—',
        sku: r.sku || '—',
        qty: Number(r.qty || 0),
        revenue: Number(r.revenue || 0),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch top products' });
  }
});

router.get('/revenue-series', requirePermission('reports.read'), async (req, res) => {
  try {
    const { from, to } = req.query;
    // Resolve the window: explicit range, or the trailing 12 months.
    const end = to ? new Date(String(to)) : new Date();
    let start;
    if (from) {
      start = new Date(String(from));
    } else {
      start = new Date(end);
      start.setMonth(start.getMonth() - 11);
      start.setDate(1);
    }

    // Sum order totals per month, excluding cancelled orders (same filter as /sales).
    const rows = await db('orders')
      .where('tenantId', req.tenant.id)
      .whereNotIn('status', ['CANCELLED'])
      .where('createdAt', '>=', start)
      .where('createdAt', '<=', end)
      .groupByRaw("DATE_FORMAT(createdAt, '%Y-%m')")
      .select(db.raw("DATE_FORMAT(createdAt, '%Y-%m') as month"))
      .sum({ earnings: 'total' })
      .catch(() => []);

    const byMonth = new Map(rows.map((r) => [r.month, Number(r.earnings || 0)]));

    // Fill every month in the window with 0 so the chart is continuous.
    const series = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= last) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      series.push({ month: key, earnings: byMonth.get(key) || 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    res.json({ series });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch revenue series' });
  }
});

module.exports = router;
