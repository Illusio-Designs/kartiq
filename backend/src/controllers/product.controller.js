const { z } = require('zod');
const prisma = require('../utils/prisma');
const db = require('../utils/db');

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  weight: z.number().optional(),
  dimensions: z.any().optional(),
  images: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  // Pricing — NOT on Product model; we create a default variant below if provided
  costPrice: z.number().optional(),
  mrp: z.number().optional(),
  sellingPrice: z.number().optional(),
});

const variantSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  attributes: z.record(z.string()),
  costPrice: z.number(),
  mrp: z.number(),
  sellingPrice: z.number(),
  weight: z.number().optional(),
});

const tenantId = (req) => req.tenant?.id;

const getProducts = async (req, res) => {
  try {
    const { page = '1', limit = '20', search, categoryId, brandId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = { tenantId: tenantId(req), isActive: true };
    if (search) where.OR = [{ name: { contains: String(search) } }, { sku: { contains: String(search) } }];
    if (categoryId) where.categoryId = String(categoryId);
    if (brandId) where.brandId = String(brandId);

    const [products, total] = await Promise.all([
      prisma.product.findMany({ where, skip, take: Number(limit), include: { category: true, brand: true, variants: true }, orderBy: { createdAt: 'desc' } }),
      prisma.product.count({ where }),
    ]);

    // Merge live inventory + channel presence so the catalog list shows stock
    // and where each product is listed without N extra requests. Scoped to the
    // page's products for a cheap grouped query.
    const tId = tenantId(req);
    const ids = products.map((p) => p.id);
    if (ids.length) {
      const [stockRows, chanRows, whRows] = await Promise.all([
        db('inventory_items')
          .whereIn('productId', ids).andWhere('tenantId', tId)
          .groupBy('productId')
          .select('productId')
          .sum({ available: 'quantityAvailable' })
          .sum({ onHand: 'quantityOnHand' })
          .catch(() => []),
        db('channel_listings as cl')
          .join('channels as c', 'c.id', 'cl.channelId')
          .whereIn('cl.productId', ids).andWhere('cl.tenantId', tId).andWhere('cl.isActive', true)
          .select('cl.productId as productId', 'c.type as type')
          .catch(() => []),
        // Per-warehouse stock so the catalog can show WHERE a product's stock
        // lives (not just an aggregate). One row per (product, warehouse).
        db('inventory_items as ii')
          .join('warehouses as w', 'w.id', 'ii.warehouseId')
          .whereIn('ii.productId', ids).andWhere('ii.tenantId', tId)
          .groupBy('ii.productId', 'w.id', 'w.name')
          .select('ii.productId as productId', 'w.name as warehouseName')
          .sum({ available: 'ii.quantityAvailable' })
          .catch(() => []),
      ]);
      const stockBy = {};
      for (const r of stockRows) stockBy[r.productId] = { available: Number(r.available || 0), onHand: Number(r.onHand || 0) };
      const chanBy = {};
      for (const r of chanRows) { (chanBy[r.productId] = chanBy[r.productId] || new Set()).add(r.type); }
      const whBy = {};
      for (const r of whRows) {
        (whBy[r.productId] = whBy[r.productId] || []).push({ name: r.warehouseName, available: Number(r.available || 0) });
      }
      for (const p of products) {
        p.stockAvailable = stockBy[p.id]?.available ?? 0;
        p.stockOnHand = stockBy[p.id]?.onHand ?? 0;
        p.channels = chanBy[p.id] ? [...chanBy[p.id]] : [];
        // Warehouses holding this product, most stock first.
        p.warehouses = (whBy[p.id] || []).sort((a, b) => b.available - a.available);
      }
    }
    res.json({ products, total, page: Number(page), limit: Number(limit) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
};

// Catalog KPI counts for the Products stat row. Computed across the WHOLE
// catalog (not just a page): total SKUs, and how many are in / low / out of
// stock, plus how many still need a price. Low threshold matches the UI (≤10).
const getProductStats = async (req, res) => {
  try {
    const tId = tenantId(req);
    const LOW = 10;
    const [stockRows, priceRows] = await Promise.all([
      // Available per product (products with no inventory row count as 0).
      db('products as p')
        .leftJoin('inventory_items as ii', 'ii.productId', 'p.id')
        .where('p.tenantId', tId).andWhere('p.isActive', true)
        .groupBy('p.id')
        .select('p.id')
        .select(db.raw('COALESCE(SUM(ii.quantityAvailable), 0) as avail'))
        .catch(() => []),
      // Highest variant price per product — 0/none means it still needs pricing.
      db('products as p')
        .leftJoin('product_variants as v', 'v.productId', 'p.id')
        .where('p.tenantId', tId).andWhere('p.isActive', true)
        .groupBy('p.id')
        .select('p.id')
        .select(db.raw('COALESCE(MAX(v.sellingPrice), 0) as maxprice'))
        .catch(() => []),
    ]);
    let inStock = 0, lowStock = 0, outOfStock = 0;
    for (const r of stockRows) {
      const a = Number(r.avail || 0);
      if (a <= 0) outOfStock++;
      else if (a <= LOW) lowStock++;
      else inStock++;
    }
    let needsPrice = 0;
    for (const r of priceRows) if (Number(r.maxprice || 0) <= 0) needsPrice++;

    res.json({ total: stockRows.length, inStock, lowStock, outOfStock, needsPrice });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch product stats' });
  }
};

const getProduct = async (req, res) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: tenantId(req) },
      include: { category: true, brand: true, variants: true, inventoryItems: { include: { warehouse: true } } },
    });
    if (!product) { res.status(404).json({ error: 'Product not found' }); return; }
    res.json(product);
  } catch {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
};

const createProduct = async (req, res) => {
  try {
    const data = productSchema.parse(req.body);
    const { costPrice, mrp, sellingPrice, ...productFields } = data;
    const tId = tenantId(req);

    // Default JSON fields to empty arrays so MySQL NOT NULL constraint is satisfied
    productFields.images = productFields.images || [];
    productFields.tags = productFields.tags || [];

    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: { ...productFields, tenantId: tId },
        include: { category: true, brand: true },
      });
      // If pricing is provided, create a default variant so the product has a sellable SKU
      const hasPricing = costPrice != null || mrp != null || sellingPrice != null;
      if (hasPricing) {
        await tx.productVariant.create({
          data: {
            tenantId: tId,
            productId: p.id,
            sku: data.sku,
            name: data.name,
            attributes: {},
            costPrice: costPrice ?? 0,
            mrp: mrp ?? sellingPrice ?? 0,
            sellingPrice: sellingPrice ?? mrp ?? 0,
          },
        });
      }
      return p;
    });

    // Re-fetch with variants so the client can see the default variant
    const full = await prisma.product.findFirst({
      where: { id: product.id },
      include: { category: true, brand: true, variants: true },
    });
    res.status(201).json(full);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
    if (err.code === 'P2002') return res.status(409).json({ error: 'SKU already exists' });
    res.status(500).json({ error: 'Failed to create product' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const parsed = productSchema.partial().parse(req.body);
    // verify ownership
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: tenantId(req) } });
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    // Pricing lives on the variant, NOT the product — pull it out so it never
    // reaches product.update (which would try to write non-existent columns).
    // When provided, apply it to the product's default (first) variant so the
    // edit form can manage price alongside the product content.
    const { costPrice, mrp, sellingPrice, ...productData } = parsed;

    if (Object.keys(productData).length) {
      await prisma.product.update({ where: { id: req.params.id }, data: productData });
    }

    if (costPrice !== undefined || mrp !== undefined || sellingPrice !== undefined) {
      const variant = await prisma.productVariant.findFirst({
        where: { productId: req.params.id, tenantId: tenantId(req) },
        orderBy: { createdAt: 'asc' },
      });
      if (variant) {
        const priceData = {};
        if (costPrice !== undefined) priceData.costPrice = costPrice;
        if (mrp !== undefined) priceData.mrp = mrp;
        if (sellingPrice !== undefined) priceData.sellingPrice = sellingPrice;
        await prisma.productVariant.update({ where: { id: variant.id }, data: priceData });
      }
    }

    const product = await prisma.product.findFirst({
      where: { id: req.params.id },
      include: { category: true, brand: true, variants: true },
    });
    res.json(product);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
    res.status(500).json({ error: 'Failed to update product' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: tenantId(req) } });
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: 'Product deactivated' });
  } catch {
    res.status(500).json({ error: 'Failed to delete product' });
  }
};

const addVariant = async (req, res) => {
  try {
    const data = variantSchema.parse(req.body);
    const product = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: tenantId(req) } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const variant = await prisma.productVariant.create({
      data: { ...data, productId: product.id, tenantId: tenantId(req) },
    });
    res.status(201).json(variant);
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
    if (err.code === 'P2002') return res.status(409).json({ error: 'Variant SKU already exists' });
    res.status(500).json({ error: 'Failed to add variant' });
  }
};

const getCategories = async (req, res) => {
  try {
    const cats = await prisma.category.findMany({
      where: { tenantId: tenantId(req) },
      include: { children: true },
    });
    res.json(cats);
  } catch {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

const getBrands = async (req, res) => {
  try {
    const brands = await prisma.brand.findMany({ where: { tenantId: tenantId(req) } });
    res.json(brands);
  } catch {
    res.status(500).json({ error: 'Failed to fetch brands' });
  }
};

module.exports = { getProducts, getProductStats, getProduct, createProduct, updateProduct, deleteProduct, addVariant, getCategories, getBrands };
