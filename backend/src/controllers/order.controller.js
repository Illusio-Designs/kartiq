const { z } = require('zod');
const prisma = require('../utils/prisma');
const { notifyTenant } = require('../services/notifications.service');
const { confirmChannelShipment } = require('../services/channel.service');
const { applyOrderStock } = require('../services/stock.service');
const { stampRetentionOnDelivery } = require('../services/vms.service');

// Move stock for a self-fulfilled order after its status changed (deduct on
// ship, release on cancel, add back on return). Best-effort, idempotent.
async function moveOrderStock(order) {
  if (!order || order.fulfillmentType !== 'SELF' || !order.warehouseId) return;
  const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
  await applyOrderStock(order, items);
}

// Accept either full variant reference (variantId) or a lightweight one (sku / productName).
// If sku is provided, we look up the variant server-side. If neither works, a placeholder
// variant is created so manual orders with ad-hoc items don't fail.
const orderItemSchema = z.object({
  variantId: z.string().optional(),
  sku: z.string().optional(),
  productName: z.string().optional(),
  name: z.string().optional(), // alias for productName (web frontend uses this)
  qty: z.number().int().min(1).optional(),
  quantity: z.number().int().min(1).optional(), // mobile alias
  unitPrice: z.number(),
  discount: z.number().optional().default(0),
  tax: z.number().optional().default(0),
  total: z.number().optional(), // ignored — recomputed
}).refine(
  (i) => i.variantId || i.sku || i.productName || i.name,
  { message: 'Each item needs variantId, sku, productName, or name' }
);

const createOrderSchema = z.object({
  // channelId and customerId are OPTIONAL for manual orders (walk-in, offline)
  channelId: z.string().optional(),
  channelOrderId: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().optional(), // for walk-ins
  warehouseId: z.string().optional(),
  shippingAddress: z.any().optional(),
  billingAddress: z.any().optional(),
  paymentMethod: z.string().optional(),
  items: z.array(orderItemSchema).min(1),
  discount: z.number().optional().default(0),
  shippingCharge: z.number().optional().default(0),
  subtotal: z.number().optional(), // ignored — recomputed
  total: z.number().optional(),    // ignored — recomputed
  tax: z.number().optional().default(0),
  notes: z.string().optional(),
});

const tid = (req) => req.tenant.id;
const generateOrderNumber = () => `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const getOrders = async (req, res) => {
  try {
    const { page = '1', limit = '20', status, channelId, search, risk, needsApproval, fulfillment, completeness, dateFrom, dateTo, source } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    // Knex-backed Prisma shim — unknown columns pass through to SQL directly
    const where = { tenantId: tid(req) };
    if (status) where.status = String(status);
    // Date range on createdAt — the field the Orders table's Date column shows,
    // and one every order has (orderedAt is null for manual/older orders, so
    // filtering on it silently dropped rows). dateTo is inclusive of the day.
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(String(dateFrom));
      if (dateTo) { const d = new Date(String(dateTo)); d.setHours(23, 59, 59, 999); where.createdAt.lte = d; }
    }
    if (channelId) where.channelId = String(channelId);
    if (search) where.orderNumber = { contains: String(search) };
    if (risk) where.rtoRiskLevel = String(risk).toUpperCase();
    if (needsApproval === 'true') where.needsApproval = true;
    else if (needsApproval === 'false') where.needsApproval = false;
    if (fulfillment) {
      // Comma-separated list → OR match (e.g. fulfillment=CHANNEL,DROPSHIP)
      const types = String(fulfillment).toUpperCase().split(',').map(s => s.trim()).filter(Boolean);
      where.fulfillmentType = types.length > 1 ? { in: types } : types[0];
    }
    if (completeness) where.dataCompleteness = String(completeness).toUpperCase();
    // Order source: auto-synced orders carry a channelOrderId from the
    // marketplace; manually-created orders don't.
    if (source === 'auto') where.channelOrderId = { not: null };
    else if (source === 'manual') where.channelOrderId = null;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where, skip, take: Number(limit),
        include: { channel: true, customer: true, items: { include: { variant: { include: { product: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);
    res.json({ orders, total, page: Number(page), limit: Number(limit) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
};

const getOrder = async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: tid(req) },
      include: { channel: true, customer: true, warehouse: true, items: { include: { variant: { include: { product: true } } } }, invoices: true, returns: true },
    });
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    res.json(order);
  } catch {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
};

// Aggregated order counts for the stat cards. Scoped to the tenant and,
// optionally, one channel (?channelId=). Returns a breakdown by order status
// and by fulfilment type (SELF = self-shipped/MFN, CHANNEL = marketplace/FBA)
// so the UI can show "for both" fulfilment paths side by side. Computed with a
// single grouped query per axis rather than pulling every order into memory.
const getOrderStats = async (req, res) => {
  try {
    const where = { tenantId: tid(req) };
    if (req.query.channelId) where.channelId = String(req.query.channelId);

    const [byStatus, byFulfillment, byRisk, needsReview, total] = await Promise.all([
      prisma.order.groupBy({ by: ['status'], where, _count: { status: true } }),
      prisma.order.groupBy({ by: ['fulfillmentType'], where, _count: { fulfillmentType: true } }),
      // RTO risk breakdown (High / Medium / Low) across the same scope.
      prisma.order.groupBy({ by: ['rtoRiskLevel'], where, _count: { rtoRiskLevel: true } }),
      // Orders held for a human decision before fulfilment (pre-ship only).
      prisma.order.count({ where: { ...where, needsApproval: true, status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING'] } } }),
      prisma.order.count({ where }),
    ]);

    const statusCounts = {};
    for (const row of byStatus) {
      statusCounts[String(row.status || 'UNKNOWN')] = row._count?.status || 0;
    }
    const fulfillmentCounts = {};
    for (const row of byFulfillment) {
      fulfillmentCounts[String(row.fulfillmentType || 'UNKNOWN')] = row._count?.fulfillmentType || 0;
    }
    const riskCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const row of byRisk) {
      const k = String(row.rtoRiskLevel || '').toUpperCase();
      if (k in riskCounts) riskCounts[k] = row._count?.rtoRiskLevel || 0;
    }
    const returned = statusCounts.RETURNED || 0;
    const returnRate = total > 0 ? Math.round((returned / total) * 1000) / 10 : 0; // one decimal %

    res.json({ total, statusCounts, fulfillmentCounts, rto: { needsReview, ...riskCounts, returnRate } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch order stats' });
  }
};

// Helper: ensure a "Manual" channel and "Walk-in" customer exist for ad-hoc orders
async function ensureManualChannel(tenantId) {
  let ch = await prisma.channel.findFirst({ where: { tenantId, type: 'OFFLINE' } });
  if (!ch) {
    ch = await prisma.channel.create({
      data: { tenantId, name: 'Manual / Walk-in', type: 'OFFLINE', category: 'CUSTOM' },
    });
  }
  return ch;
}
async function ensureWalkInCustomer(tenantId, name) {
  const label = name && name.trim() ? name.trim() : 'Walk-in Customer';
  let c = await prisma.customer.findFirst({ where: { tenantId, name: label } });
  if (!c) {
    c = await prisma.customer.create({ data: { tenantId, name: label } });
  }
  return c;
}

// Helper: resolve items — turn {sku|productName|name, qty|quantity} into {variantId, qty}.
// Looks up variants by SKU; if not found, creates a placeholder "Quick" product+variant.
async function resolveItems(tenantId, rawItems) {
  const out = [];
  for (const raw of rawItems) {
    const qty = Number(raw.qty ?? raw.quantity ?? 1);
    const unitPrice = Number(raw.unitPrice ?? 0);
    let variantId = raw.variantId;

    if (!variantId && raw.sku) {
      const v = await prisma.productVariant.findFirst({
        where: { tenantId, sku: String(raw.sku) },
        select: { id: true },
      });
      if (v) variantId = v.id;
    }

    if (!variantId) {
      // Create a placeholder product + variant for the ad-hoc item
      const name = raw.productName || raw.name || raw.sku || 'Manual Item';
      const sku = raw.sku || `QUICK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const existingProd = await prisma.product.findFirst({
        where: { tenantId, sku },
        select: { id: true },
      });
      let productId = existingProd?.id;
      if (!productId) {
        const prod = await prisma.product.create({
          data: { tenantId, name, sku, isActive: true, images: [], tags: [] },
        });
        productId = prod.id;
      }
      const variant = await prisma.productVariant.create({
        data: {
          tenantId,
          productId,
          sku,
          name,
          attributes: {},
          costPrice: 0,
          mrp: unitPrice,
          sellingPrice: unitPrice,
        },
      });
      variantId = variant.id;
    }

    out.push({
      variantId,
      qty,
      unitPrice,
      discount: Number(raw.discount || 0),
      tax: Number(raw.tax || 0),
    });
  }
  return out;
}

const createOrder = async (req, res) => {
  try {
    const data = createOrderSchema.parse(req.body);
    const tenantId = tid(req);

    // Resolve channel: use provided ID, or default to Manual/Walk-in channel
    let channel;
    if (data.channelId) {
      channel = await prisma.channel.findFirst({ where: { id: data.channelId, tenantId } });
      if (!channel) return res.status(404).json({ error: 'Channel not found' });
    } else {
      channel = await ensureManualChannel(tenantId);
    }

    // Resolve customer: use provided ID, create walk-in, or reuse cached walk-in
    let customer;
    if (data.customerId) {
      customer = await prisma.customer.findFirst({ where: { id: data.customerId, tenantId } });
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
    } else {
      customer = await ensureWalkInCustomer(tenantId, data.customerName);
    }

    // Optional warehouse ownership
    if (data.warehouseId) {
      const wh = await prisma.warehouse.findFirst({ where: { id: data.warehouseId, tenantId } });
      if (!wh) return res.status(404).json({ error: 'Warehouse not found' });
    }

    // Normalize items into {variantId, qty, unitPrice, ...}
    const resolvedItems = await resolveItems(tenantId, data.items);

    const subtotal = resolvedItems.reduce((sum, i) => sum + i.unitPrice * i.qty - (i.discount || 0), 0);
    const total = subtotal + (data.shippingCharge || 0) + (data.tax || 0) - (data.discount || 0);

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          tenantId,
          orderNumber: generateOrderNumber(),
          channelId: channel.id,
          channelOrderId: data.channelOrderId,
          customerId: customer.id,
          warehouseId: data.warehouseId,
          shippingAddress: data.shippingAddress || {},
          billingAddress: data.billingAddress,
          paymentMethod: data.paymentMethod,
          subtotal,
          discount: data.discount || 0,
          shippingCharge: data.shippingCharge || 0,
          tax: data.tax || 0,
          total,
          notes: data.notes,
          createdById: req.user?.id,
          items: {
            create: resolvedItems.map((item) => ({
              tenantId,
              variantId: item.variantId,
              qty: item.qty,
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              tax: item.tax || 0,
              total: item.unitPrice * item.qty - (item.discount || 0) + (item.tax || 0),
            })),
          },
        },
        include: { items: true },
      });

      // Increment monthly orders usage meter for billing / PAYG
      const period = new Date().toISOString().slice(0, 7);
      await tx.usageMeter.upsert({
        where: { tenantId_metric_period: { tenantId, metric: 'orders', period } },
        update: { count: { increment: 1 } },
        create: { tenantId, metric: 'orders', period, count: 1 },
      });

      return created;
    });

    // Debit wallet if this order was an overage (PAYG flow).
    // If the debit fails (insufficient funds race, DB error), roll back the order.
    if (req.overage?.unitRate > 0) {
      const wallet = require('../services/wallet.service');
      let debitResult;
      try {
        debitResult = await wallet.debit(tid(req), req.overage.unitRate, {
          metric: 'orders',
          quantity: 1,
          reference: order.id,
          description: `Overage: order ${order.orderNumber}`,
          createdById: req.user?.id,
        });
      } catch (e) {
        console.error('[wallet] debit failed, rolling back order', e.message);
      }
      if (!debitResult?.ok) {
        // Roll back: delete the order we just created + decrement the usage meter
        try {
          await prisma.$transaction([
            prisma.orderItem.deleteMany({ where: { orderId: order.id } }),
            prisma.order.delete({ where: { id: order.id } }),
          ]);
          const period = new Date().toISOString().slice(0, 7);
          await prisma.usageMeter.updateMany({
            where: { tenantId, metric: 'orders', period, count: { gt: 0 } },
            data: { count: { decrement: 1 } },
          });
        } catch (rollbackErr) {
          console.error('[wallet] rollback failed', rollbackErr.message);
        }
        return res.status(402).json({
          error: 'Wallet debit failed — order not created',
          metric: 'orders',
          unitRate: req.overage.unitRate,
          walletBalance: debitResult?.balance ?? null,
          topupUrl: '/dashboard/billing',
        });
      }
    }

    notifyTenant(tenantId, {
      type: 'order.new',
      category: 'orders',
      severity: 'success',
      title: `New order ${order.orderNumber} · ₹${total}`,
      body: `${resolvedItems.reduce((n, i) => n + i.qty, 0)} item(s) · ${channel.name || channel.type || 'Manual'}`,
      link: `/orders/${order.id}`,
      metadata: { orderId: order.id, channelId: channel.id, total },
    });

    res.status(201).json(order);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
    console.error(err);
    res.status(500).json({ error: 'Failed to create order' });
  }
};

const ORDER_STATUS_VALUES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];
const statusUpdateSchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES),
  trackingNumber: z.string().optional(),
  courierName: z.string().optional(),
});

const updateOrderStatus = async (req, res) => {
  try {
    const existing = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: tid(req) },
    });
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    // FBA / channel-fulfilled orders are managed by the marketplace — block
    // manual status edits so Kartriq and Amazon don't disagree.
    if (existing.fulfillmentType === 'CHANNEL') {
      return res.status(400).json({ error: 'This order is fulfilled by the channel and cannot be updated manually.' });
    }

    // Validate the status against the enum instead of writing req.body.status raw.
    const { status, trackingNumber, courierName } = statusUpdateSchema.parse(req.body);
    const update = { status };
    if (status === 'SHIPPED') { update.shippedAt = new Date(); update.trackingNumber = trackingNumber; update.courierName = courierName; }
    if (status === 'DELIVERED') update.deliveredAt = new Date();
    const order = await prisma.order.update({ where: { id: req.params.id }, data: update });

    // When a merchant-fulfilled channel order is marked shipped, push the
    // tracking back to the origin channel (e.g. Amazon MFN) so the buyer sees
    // it and Amazon doesn't auto-cancel. Non-blocking: the local status update
    // already succeeded regardless of the channel's response.
    if (status === 'SHIPPED' && order.channelId && order.channelOrderId) {
      confirmChannelShipment(order, { trackingNumber, courierName })
        .catch(() => {});
    }

    await moveOrderStock(order); // deduct on ship / add back on return, etc.

    // On delivery, start the retention clock on any packing/dispatch videos so
    // they're auto-pruned RETENTION_DAYS later (unless a dispute is open).
    if (status === 'DELIVERED') {
      stampRetentionOnDelivery(order).catch(() => {});
    }

    res.json(order);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid status value' });
    res.status(500).json({ error: 'Failed to update order status' });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const existing = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: tid(req) },
    });
    if (!existing) return res.status(404).json({ error: 'Order not found' });
    // Guard invalid transitions: a delivered/returned order can't be cancelled,
    // and re-cancelling an already-cancelled order is a no-op (return it as-is).
    if (existing.status === 'CANCELLED') return res.json(existing);
    if (existing.status === 'DELIVERED' || existing.status === 'RETURNED') {
      return res.status(400).json({ error: `Cannot cancel a ${existing.status.toLowerCase()} order` });
    }
    const order = await prisma.order.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
    await moveOrderStock(order); // release a reservation / add back deducted stock
    res.json(order);
  } catch {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
};

module.exports = { getOrders, getOrder, getOrderStats, createOrder, updateOrderStatus, cancelOrder };
