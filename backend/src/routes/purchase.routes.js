const { Router } = require('express');
const { z } = require('zod');
const { randomUUID } = require('crypto');
const {
  authenticate, requireTenant, requirePermission, requireFeature,
} = require('../middleware/auth.middleware');
const prisma = require('../utils/prisma');
const db = require('../utils/db');
const { ensureInventoryRow } = require('../services/stock.service');

const router = Router();
router.use(authenticate, requireTenant);
router.use(requireFeature('purchaseManagement'));

const PO_STATUSES = ['DRAFT', 'SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'];
// Statuses a buyer can set directly. Receiving states are reached only through
// the /receive endpoint (which also moves stock), never by a raw status write.
const SETTABLE_STATUSES = ['DRAFT', 'SENT', 'CONFIRMED', 'CANCELLED'];

const itemSchema = z.object({
  variantId: z.string().min(1),
  orderedQty: z.number().int().positive(),
  unitCost: z.number().nonnegative(),
});

const createSchema = z.object({
  vendorId: z.string().min(1),
  expectedDate: z.string().datetime().optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
  items: z.array(itemSchema).min(1),
});

const updateSchema = z.object({
  vendorId: z.string().min(1).optional(),
  expectedDate: z.string().datetime().optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
});

const genPoNumber = () => `PO-${Date.now().toString(36).toUpperCase()}`;

// Validate every variant belongs to this tenant (via its product). Returns a
// Set of valid variant ids so the caller can reject unknown SKUs.
async function tenantVariantIds(tenantId, variantIds) {
  if (!variantIds.length) return new Set();
  const rows = await db('product_variants as v')
    .join('products as p', 'p.id', 'v.productId')
    .whereIn('v.id', variantIds)
    .andWhere('p.tenantId', tenantId)
    .select('v.id');
  return new Set(rows.map((r) => r.id));
}

// The real (non-virtual) warehouse a receipt lands in: an explicit id if valid,
// else the tenant's first active own warehouse. FBA/virtual facilities can't
// receive purchase stock.
async function resolveReceivingWarehouse(tenantId, warehouseId) {
  if (warehouseId) {
    const wh = await db('warehouses').where({ id: warehouseId, tenantId }).first();
    if (!wh) return { error: 'Warehouse not found' };
    if (wh.isVirtual) return { error: 'Cannot receive stock into a virtual (channel-managed) facility' };
    return { warehouse: wh };
  }
  const wh = await db('warehouses')
    .where({ tenantId, isActive: 1 })
    .andWhere((b) => b.where('isVirtual', 0).orWhereNull('isVirtual'))
    .orderBy('createdAt', 'asc')
    .first();
  if (!wh) return { error: 'No warehouse to receive into — create a warehouse first' };
  return { warehouse: wh };
}

// ── List ─────────────────────────────────────────────────────────────
router.get('/', requirePermission('purchases.read'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const skip = (page - 1) * limit;
  const where = { tenantId: req.tenant.id };
  if (req.query.status && PO_STATUSES.includes(req.query.status)) where.status = req.query.status;
  if (req.query.vendorId) where.vendorId = req.query.vendorId;

  const [purchaseOrders, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: { vendor: true, items: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  res.json({ purchaseOrders, total, page, limit });
});

router.get('/:id', requirePermission('purchases.read'), async (req, res) => {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
    include: {
      vendor: true,
      items: { include: { variant: { include: { product: true } } } },
    },
  });
  if (!po) return res.status(404).json({ error: 'Purchase order not found' });
  res.json(po);
});

// ── Create ───────────────────────────────────────────────────────────
router.post('/', requirePermission('purchases.create'), async (req, res) => {
  try {
    const data = createSchema.parse(req.body);
    const tenantId = req.tenant.id;

    const vendor = await prisma.vendor.findFirst({ where: { id: data.vendorId, tenantId, isActive: true } });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const valid = await tenantVariantIds(tenantId, data.items.map((i) => i.variantId));
    const unknown = data.items.find((i) => !valid.has(i.variantId));
    if (unknown) return res.status(400).json({ error: `Unknown variant: ${unknown.variantId}` });

    const totalAmount = data.items.reduce((sum, i) => sum + i.unitCost * i.orderedQty, 0);

    const po = await prisma.purchaseOrder.create({
      data: {
        tenantId,
        poNumber: genPoNumber(),
        vendorId: data.vendorId,
        status: 'DRAFT',
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
        notes: data.notes || null,
        totalAmount,
        createdById: req.user.id,
        items: {
          create: data.items.map((i) => ({
            tenantId,
            variantId: i.variantId,
            orderedQty: i.orderedQty,
            receivedQty: 0,
            unitCost: i.unitCost,
            totalCost: i.unitCost * i.orderedQty,
          })),
        },
      },
      include: { vendor: true, items: true },
    });
    res.status(201).json(po);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    if (err.code === 'P2002' || err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'PO number collision, retry' });
    res.status(500).json({ error: err.message });
  }
});

// ── Update header (draft-ish edits only) ─────────────────────────────
router.put('/:id', requirePermission('purchases.update'), async (req, res) => {
  try {
    const data = updateSchema.parse(req.body);
    const existing = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } });
    if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
    if (['RECEIVED', 'PARTIALLY_RECEIVED', 'CANCELLED'].includes(existing.status)) {
      return res.status(400).json({ error: `Cannot edit a ${existing.status} purchase order` });
    }
    if (data.vendorId) {
      const vendor = await prisma.vendor.findFirst({ where: { id: data.vendorId, tenantId: req.tenant.id, isActive: true } });
      if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    }
    const patch = {};
    if (data.vendorId) patch.vendorId = data.vendorId;
    if (data.notes !== undefined) patch.notes = data.notes || null;
    if (data.expectedDate !== undefined) patch.expectedDate = data.expectedDate ? new Date(data.expectedDate) : null;
    const po = await prisma.purchaseOrder.update({ where: { id: req.params.id }, data: patch });
    res.json(po);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

// ── Status transition (non-receiving) ────────────────────────────────
const statusSchema = z.object({ status: z.enum(['DRAFT', 'SENT', 'CONFIRMED', 'CANCELLED']) });

router.patch('/:id/status', requirePermission('purchases.update'), async (req, res) => {
  try {
    const { status } = statusSchema.parse(req.body);
    const existing = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } });
    if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
    if (['RECEIVED', 'PARTIALLY_RECEIVED'].includes(existing.status)) {
      return res.status(400).json({ error: 'Received purchase orders cannot change status' });
    }
    if (existing.status === 'CANCELLED') return res.status(400).json({ error: 'PO is already cancelled' });
    if (!SETTABLE_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const po = await prisma.purchaseOrder.update({ where: { id: req.params.id }, data: { status } });
    res.json(po);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

// ── Receive stock ────────────────────────────────────────────────────
// Body: { warehouseId?, lines?: [{ itemId, qty }] }. With no lines, receives all
// remaining quantity for every line. Adds stock to the receiving warehouse,
// records an INBOUND movement, bumps receivedQty and advances the PO status.
const receiveSchema = z.object({
  warehouseId: z.string().optional(),
  lines: z.array(z.object({ itemId: z.string().min(1), qty: z.number().int().positive() })).optional(),
});

router.post('/:id/receive', requirePermission('purchases.approve'), async (req, res) => {
  try {
    const body = receiveSchema.parse(req.body || {});
    const tenantId = req.tenant.id;

    const po = await prisma.purchaseOrder.findFirst({
      where: { id: req.params.id, tenantId },
      include: { items: true },
    });
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    if (po.status === 'CANCELLED') return res.status(400).json({ error: 'Cannot receive a cancelled purchase order' });
    if (po.status === 'RECEIVED') return res.status(400).json({ error: 'Purchase order is already fully received' });

    const { warehouse, error } = await resolveReceivingWarehouse(tenantId, body.warehouseId);
    if (error) return res.status(400).json({ error });

    // Resolve which quantity to receive per item.
    const byId = new Map(po.items.map((it) => [it.id, it]));
    let plan;
    if (body.lines && body.lines.length) {
      plan = [];
      for (const line of body.lines) {
        const item = byId.get(line.itemId);
        if (!item) return res.status(400).json({ error: `Unknown line item: ${line.itemId}` });
        const remaining = item.orderedQty - item.receivedQty;
        if (line.qty > remaining) {
          return res.status(400).json({ error: `Cannot receive ${line.qty} — only ${remaining} remaining on this line` });
        }
        if (line.qty > 0) plan.push({ item, qty: line.qty });
      }
    } else {
      plan = po.items
        .map((item) => ({ item, qty: item.orderedQty - item.receivedQty }))
        .filter((p) => p.qty > 0);
    }
    if (!plan.length) return res.status(400).json({ error: 'Nothing left to receive' });

    // Apply each receipt: guarantee an inventory row, add on-hand + available,
    // record the movement, bump receivedQty.
    for (const { item, qty } of plan) {
      await ensureInventoryRow(tenantId, warehouse.id, item.variantId);
      await db('inventory_items')
        .where({ tenantId, warehouseId: warehouse.id, variantId: item.variantId })
        .update({
          quantityOnHand: db.raw('quantityOnHand + ?', [qty]),
          quantityAvailable: db.raw('quantityAvailable + ?', [qty]),
          updatedAt: new Date(),
        });
      await db('stock_movements').insert({
        id: randomUUID(),
        tenantId,
        warehouseId: warehouse.id,
        variantId: item.variantId,
        type: 'INBOUND',
        quantity: qty,
        referenceId: po.id,
        referenceType: 'PURCHASE',
        notes: po.poNumber,
        createdAt: new Date(),
      });
      await db('purchase_order_items')
        .where({ id: item.id })
        .update({ receivedQty: db.raw('receivedQty + ?', [qty]) });
    }

    // Recompute status from fresh received quantities.
    const fresh = await db('purchase_order_items').where({ purchaseOrderId: po.id }).select('orderedQty', 'receivedQty');
    const fullyReceived = fresh.every((r) => r.receivedQty >= r.orderedQty);
    const anyReceived = fresh.some((r) => r.receivedQty > 0);
    const newStatus = fullyReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : po.status;
    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: newStatus, receivedDate: fullyReceived ? new Date() : po.receivedDate || null },
    });

    const updated = await prisma.purchaseOrder.findFirst({
      where: { id: po.id, tenantId },
      include: { vendor: true, items: { include: { variant: { include: { product: true } } } } },
    });
    res.json({ purchaseOrder: updated, receivedInto: { id: warehouse.id, name: warehouse.name } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: err.message });
  }
});

// ── Delete (only drafts / cancelled) ─────────────────────────────────
router.delete('/:id', requirePermission('purchases.delete'), async (req, res) => {
  const existing = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } });
  if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
  if (!['DRAFT', 'CANCELLED'].includes(existing.status)) {
    return res.status(400).json({ error: 'Only draft or cancelled purchase orders can be deleted' });
  }
  await prisma.purchaseOrder.delete({ where: { id: req.params.id } });
  res.json({ message: 'Purchase order deleted' });
});

module.exports = router;
