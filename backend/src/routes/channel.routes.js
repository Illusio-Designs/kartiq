const { Router } = require('express');
const {
  authenticate, requireTenant, requirePermission, enforceLimit,
} = require('../middleware/auth.middleware');
const prisma = require('../utils/prisma');
const { encryptCredentials, maskCredentials } = require('../utils/crypto');
const { getAdapter, getCategoryForType, importOrders, pushInventoryToChannel, importCatalogFromChannel, syncChannelSettlements, listChannelSettlements, syncChannelReturns, listChannelReturns } = require('../services/channel.service');
const { CATALOG, getCatalogEntry, getCatalogByCategory } = require('../data/channel-catalog');

const router = Router();
router.use(authenticate, requireTenant);

// ── Plan-based channel access ───────────────────────────────────────────
// The plan's features.channelCategories array lists which categories are unlocked.
// A null/undefined value means "all categories allowed" (ENTERPRISE).
// The plan's features.maxChannels is the hard count limit (null = unlimited).
const CATEGORY_PLAN_HINT = {
  // Minimum plan tier commonly needed for each category — used for user messaging
  ECOM: 'STANDARD',
  OWNSTORE: 'STANDARD',
  CUSTOM: 'STANDARD',
  LOGISTICS: 'STANDARD',
  QUICKCOM: 'PROFESSIONAL',
  SOCIAL: 'PROFESSIONAL',
  B2B: 'BUSINESS',
  ACCOUNTING: 'PROFESSIONAL',
  POS_SYSTEM: 'PROFESSIONAL',
  PAYMENT: 'STANDARD',
  TAX: 'PROFESSIONAL',
  CRM: 'PROFESSIONAL',
  RETURNS: 'PROFESSIONAL',
  FULFILLMENT: 'BUSINESS',
};

function getTenantPlanCode(req) {
  return req.plan?.code || 'STANDARD';
}

function getAllowedCategories(req) {
  const list = req.plan?.features?.channelCategories;
  return Array.isArray(list) ? list : null; // null = all allowed
}

function isCategoryAllowed(req, category) {
  const allowed = getAllowedCategories(req);
  if (allowed === null) return true; // unlimited / enterprise
  return allowed.includes(category);
}

// Strip encrypted creds from channel objects before sending to client
function safeChannel(ch) {
  return { ...ch, credentials: maskCredentials(ch.credentials) };
}

// Helper: load a channel and verify tenant ownership
async function loadTenantChannel(req) {
  return prisma.channel.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// CHANNEL CATALOG — global market list vs what's connected
// ═════════════════════════════════════════════════════════════════════════════

router.get('/catalog', requirePermission('channels.read'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const { category } = req.query;

    const [userChannels, userRequests] = await Promise.all([
      prisma.channel.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, type: true, lastSyncAt: true },
      }),
      prisma.channelRequest.findMany({
        where: { tenantId, requestedBy: req.user.id },
        select: { id: true, type: true, status: true, createdAt: true },
      }),
    ]);

    const channelsByType = {};
    for (const ch of userChannels) {
      if (!channelsByType[ch.type]) channelsByType[ch.type] = [];
      channelsByType[ch.type].push(ch);
    }
    const requestByType = Object.fromEntries(userRequests.map((r) => [r.type, r]));

    const planCode = getTenantPlanCode(req);
    const isPlatformAdmin = !!req.user?.isPlatformAdmin;
    const maxChannels = req.plan?.features?.maxChannels;
    const usedChannels = userChannels.length;

    const entries = getCatalogByCategory(category).map((entry) => {
      const connected = channelsByType[entry.type] || [];
      const allowedByPlan = isPlatformAdmin || isCategoryAllowed(req, entry.category);
      const requiredPlan = CATEGORY_PLAN_HINT[entry.category] || 'STANDARD';

      let status;
      if (connected.length > 0) status = 'connected';
      else if (!allowedByPlan) status = 'plan_locked';
      else if (entry.integrated && !entry.comingSoon) status = 'available';
      else status = 'not_available';

      return {
        ...entry,
        status,
        allowedByPlan,
        requiredPlan,
        connectedChannels: connected,
        pendingRequest: requestByType[entry.type] || null,
      };
    });

    const summary = {
      total: entries.length,
      connected: entries.filter((e) => e.status === 'connected').length,
      available: entries.filter((e) => e.status === 'available').length,
      plan_locked: entries.filter((e) => e.status === 'plan_locked').length,
      not_available: entries.filter((e) => e.status === 'not_available').length,
      currentPlan: planCode,
      maxChannels: maxChannels ?? null,
      usedChannels,
    };

    res.json({ summary, catalog: entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/catalog/:type', requirePermission('channels.read'), async (req, res) => {
  const entry = getCatalogEntry(req.params.type.toUpperCase());
  if (!entry) return res.status(404).json({ error: `Channel type '${req.params.type}' not found in catalog` });

  try {
    const tenantId = req.tenant.id;
    const [connected, pendingRequest] = await Promise.all([
      prisma.channel.findMany({
        where: { tenantId, type: entry.type, isActive: true },
        select: { id: true, name: true, lastSyncAt: true, syncError: true },
      }),
      prisma.channelRequest.findFirst({
        where: { tenantId, type: entry.type, requestedBy: req.user.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    let status;
    if (connected.length > 0) status = 'connected';
    else if (entry.integrated && !entry.comingSoon) status = 'available';
    else status = 'not_available';

    res.json({ ...entry, status, connectedChannels: connected, pendingRequest: pendingRequest || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/catalog/:type/request', requirePermission('channels.read'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const typeKey = req.params.type.toUpperCase();
    const entry = getCatalogEntry(typeKey);

    if (entry && entry.integrated) {
      return res.status(400).json({ error: `${entry.name} is already integrated. Connect it via POST /channels/:id/connect` });
    }

    const existing = await prisma.channelRequest.findFirst({
      where: {
        tenantId,
        type: typeKey,
        requestedBy: req.user.id,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });
    if (existing) {
      return res.status(409).json({ error: 'You already have an open request for this channel', request: existing });
    }

    const request = await prisma.channelRequest.create({
      data: {
        tenantId,
        type: typeKey,
        category: entry?.category || getCategoryForType(typeKey),
        name: req.body.name || entry?.name || typeKey,
        notes: req.body.notes || null,
        requestedBy: req.user.id,
      },
    });

    res.status(201).json({
      message: 'Integration request submitted. Our team will review and update you.',
      request,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// CHANNEL REQUESTS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/requests', requirePermission('channels.read'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const isTenantAdmin = req.permissions?.has('channels.update') || req.permissions?.has('*');
    const where = { tenantId };
    if (!isTenantAdmin) where.requestedBy = req.user.id;
    if (req.query.status) where.status = req.query.status;
    if (req.query.type) where.type = req.query.type.toUpperCase();
    if (req.query.category) where.category = req.query.category;

    const requests = await prisma.channelRequest.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = requests.map((r) => ({ ...r, catalogEntry: getCatalogEntry(r.type) || null }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/requests/:id', requirePermission('channels.read'), async (req, res) => {
  try {
    const request = await prisma.channelRequest.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const isTenantAdmin = req.permissions?.has('channels.update') || req.permissions?.has('*');
    if (!isTenantAdmin && request.requestedBy !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({ ...request, catalogEntry: getCatalogEntry(request.type) || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/requests/:id', requirePermission('channels.update'), async (req, res) => {
  try {
    const request = await prisma.channelRequest.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
    });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const { status, adminNotes } = req.body;
    const updated = await prisma.channelRequest.update({
      where: { id: req.params.id },
      data: { status, adminNotes },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/requests/:id', requirePermission('channels.read'), async (req, res) => {
  try {
    const request = await prisma.channelRequest.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
    });
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const isTenantAdmin = req.permissions?.has('channels.delete') || req.permissions?.has('*');
    if (!isTenantAdmin && request.requestedBy !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!isTenantAdmin && request.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only PENDING requests can be cancelled' });
    }

    await prisma.channelRequest.delete({ where: { id: req.params.id } });
    res.json({ message: 'Request cancelled' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// CHANNEL CRUD
// ═════════════════════════════════════════════════════════════════════════════

router.get('/', requirePermission('channels.read'), async (req, res) => {
  try {
    const where = { tenantId: req.tenant.id, isActive: true };
    if (req.query.category) where.category = String(req.query.category);
    const channels = await prisma.channel.findMany({ where, orderBy: { name: 'asc' } });
    res.json(channels.map(safeChannel));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requirePermission('channels.read'), async (req, res) => {
  try {
    const ch = await loadTenantChannel(req);
    if (!ch) return res.status(404).json({ error: 'Channel not found' });

    // Expose webhook URL + verify token helper for this channel (for UI setup)
    const base = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}/api/v1`;
    res.json({
      ...safeChannel(ch),
      webhookUrl: `${base}/webhooks/channels/${ch.id}`,
      webhookTypedUrl: `${base}/webhooks/${ch.type.toLowerCase()}/${ch.id}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/',
  requirePermission('channels.create'),
  enforceLimit('channels'),
  async (req, res) => {
    try {
      const { name, type, category } = req.body;
      const resolvedCategory = category || getCategoryForType(type);

      // Category-based gate: plan must include this category
      const isPlatformAdmin = !!req.user?.isPlatformAdmin;
      if (!isPlatformAdmin && !isCategoryAllowed(req, resolvedCategory)) {
        const requiredPlan = CATEGORY_PLAN_HINT[resolvedCategory] || 'STANDARD';
        return res.status(402).json({
          error: `This channel requires the ${requiredPlan} plan or higher`,
          requiredPlan,
          currentPlan: getTenantPlanCode(req),
          upgradeUrl: '/dashboard/billing',
        });
      }

      const ch = await prisma.channel.create({
        data: {
          tenantId: req.tenant.id,
          name,
          type,
          category: resolvedCategory,
        },
      });
      res.status(201).json(safeChannel(ch));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.put('/:id', requirePermission('channels.update'), async (req, res) => {
  try {
    const existing = await loadTenantChannel(req);
    if (!existing) return res.status(404).json({ error: 'Channel not found' });

    const { name, isActive, defaultFulfillmentType } = req.body;
    // Whitelist updatable fields; only include what was actually sent so a
    // partial PATCH-style body doesn't null out untouched columns.
    const data = {};
    if (name !== undefined) data.name = name;
    if (isActive !== undefined) data.isActive = isActive;
    if (defaultFulfillmentType !== undefined) {
      if (!['SELF', 'CHANNEL'].includes(defaultFulfillmentType)) {
        return res.status(400).json({ error: 'defaultFulfillmentType must be SELF or CHANNEL' });
      }
      data.defaultFulfillmentType = defaultFulfillmentType;
    }
    const ch = await prisma.channel.update({
      where: { id: req.params.id },
      data,
    });
    res.json(safeChannel(ch));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', requirePermission('channels.delete'), async (req, res) => {
  try {
    const existing = await loadTenantChannel(req);
    if (!existing) return res.status(404).json({ error: 'Channel not found' });
    // Deactivate AND clear the stored (encrypted) credentials — a disconnect
    // should not leave a usable refresh token at rest. Also clear any stale
    // sync error so a future reconnect starts clean.
    await prisma.channel.update({
      where: { id: req.params.id },
      data: { isActive: false, credentials: null, syncError: null },
    });
    res.json({ message: 'Channel disconnected' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// CREDENTIALS — stored encrypted (AES-256-GCM)
// ═════════════════════════════════════════════════════════════════════════════

router.post('/:id/connect', requirePermission('channels.update'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const encrypted = encryptCredentials(req.body);
    const updated = await prisma.channel.update({
      where: { id: req.params.id },
      data: { credentials: encrypted, syncError: null },
    });

    const adapter = getAdapter({ ...updated, credentials: req.body });
    const result = await adapter.testConnection();

    res.json({ message: 'Channel connected successfully', connection: result });
  } catch (err) {
    await prisma.channel.updateMany({
      where: { id: req.params.id, tenantId: req.tenant.id },
      data: { syncError: err.message },
    }).catch(() => {});
    res.status(400).json({ error: 'Connection failed', details: err.message });
  }
});

router.get('/:id/test', requirePermission('channels.read'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const adapter = getAdapter(channel);
    const result = await adapter.testConnection();
    res.json({ status: 'connected', ...result });
  } catch (err) {
    res.status(400).json({ status: 'failed', error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SALES CHANNEL — order & inventory sync
// ═════════════════════════════════════════════════════════════════════════════

router.post('/:id/sync/orders', requirePermission('channels.sync'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const adapter = getAdapter(channel);
    const rawOrders = await adapter.fetchOrders(req.body?.since || null);
    const results = await importOrders(channel.id, rawOrders, { tenantId: req.tenant.id });

    await prisma.channel.update({
      where: { id: channel.id },
      data: { lastSyncAt: new Date(), syncError: null },
    });
    res.json({ message: 'Order sync complete', fetched: rawOrders.length, ...results });
  } catch (err) {
    await prisma.channel.updateMany({
      where: { id: req.params.id, tenantId: req.tenant.id },
      data: { syncError: err.message },
    }).catch(() => {});
    res.status(500).json({ error: 'Order sync failed', details: err.message });
  }
});

router.post('/:id/sync/inventory', requirePermission('channels.sync'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const results = await pushInventoryToChannel(channel, { tenantId: req.tenant.id });
    await prisma.channel.update({
      where: { id: channel.id },
      data: { lastSyncAt: new Date(), syncError: null },
    });
    res.json({ message: 'Inventory sync complete', ...results });
  } catch (err) {
    await prisma.channel.updateMany({
      where: { id: req.params.id, tenantId: req.tenant.id },
      data: { syncError: err.message },
    }).catch(() => {});
    res.status(500).json({ error: 'Inventory sync failed', details: err.message });
  }
});

// One-time: pull the channel's catalog (products + on-hand stock) into Kartriq.
router.post('/:id/pull-catalog', requirePermission('channels.sync'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const results = await importCatalogFromChannel(channel, { tenantId: req.tenant.id });
    res.json({ message: 'Catalog import complete', ...results });
  } catch (err) {
    await prisma.channel.updateMany({
      where: { id: req.params.id, tenantId: req.tenant.id },
      data: { syncError: err.message },
    }).catch(() => {});
    res.status(500).json({ error: 'Catalog import failed', details: err.message });
  }
});

// ── Channel SKU mappings ──────────────────────────────────────────────────────
router.get('/:id/listings', requirePermission('channels.read'), async (req, res) => {
  const channel = await loadTenantChannel(req);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });
  const listings = await prisma.channelListing.findMany({
    where: { channelId: req.params.id, tenantId: req.tenant.id },
    include: {
      product: { select: { name: true, sku: true } },
      variant: { select: { sku: true, name: true } },
    },
  });
  res.json(listings);
});

router.post('/:id/listings', requirePermission('channels.update'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const { channelSku, productId, variantId, channelPrice } = req.body;

    // Verify product + variant belong to this tenant
    const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (variantId) {
      const variant = await prisma.productVariant.findFirst({ where: { id: variantId, tenantId } });
      if (!variant) return res.status(404).json({ error: 'Variant not found' });
    }

    const listing = await prisma.channelListing.upsert({
      where: { channelId_channelSku: { channelId: req.params.id, channelSku } },
      update: { productId, variantId, channelPrice },
      create: { tenantId, channelId: req.params.id, channelSku, productId, variantId, channelPrice },
    });
    res.status(201).json(listing);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SHIPPING CHANNEL — Shiprocket / Delhivery / etc
// ═════════════════════════════════════════════════════════════════════════════

router.post('/:id/shipping/rates', requirePermission('channels.sync'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const adapter = getAdapter(channel);
    if (typeof adapter.getRates !== 'function' && typeof adapter.checkServiceability !== 'function') {
      return res.status(400).json({ error: 'This channel does not support rate queries' });
    }
    const rates = adapter.getRates ? await adapter.getRates(req.body) : await adapter.checkServiceability(req.body);
    res.json(rates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/shipping/create', requirePermission('shipments.create'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const order = await prisma.order.findFirst({
      where: { id: req.body.orderId, tenantId },
      include: {
        customer: true,
        items: { include: { variant: { include: { product: true } } } },
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    let warehouseAddress = null;
    if (req.body.warehouseId) {
      warehouseAddress = await prisma.warehouse.findFirst({
        where: { id: req.body.warehouseId, tenantId },
      });
    }

    const adapter = getAdapter(channel);
    if (typeof adapter.createShipment !== 'function') {
      return res.status(400).json({ error: 'This channel does not support shipment creation' });
    }

    const result = await adapter.createShipment(
      { ...order, customer: order.customer },
      channel,
      warehouseAddress?.address || {}
    );

    if (result.awbCode || result.waybill) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          trackingNumber: result.awbCode || result.waybill,
          courierName: result.courierName || channel.name,
          status: 'PROCESSING',
        },
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/shipping/track/:awb', requirePermission('shipments.read'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const adapter = getAdapter(channel);
    if (typeof adapter.trackShipment !== 'function') {
      return res.status(400).json({ error: 'This channel does not support tracking' });
    }
    const result = await adapter.trackShipment(req.params.awb);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/shipping/cancel', requirePermission('shipments.update'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const adapter = getAdapter(channel);
    if (typeof adapter.cancelShipment !== 'function') {
      return res.status(400).json({ error: 'This channel does not support cancellation' });
    }
    const awb = req.body.awbs || req.body.awb;
    const result = await adapter.cancelShipment(awb);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/shipping/pickups', requirePermission('channels.read'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const adapter = getAdapter(channel);
    if (typeof adapter.getPickupLocations !== 'function') {
      return res.status(400).json({ error: 'This channel does not support pickup location queries' });
    }
    const locations = await adapter.getPickupLocations();
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NOTE: the public webhook receiver has moved to
// POST /api/v1/webhooks/channels/:id  (see routes/webhook.routes.js)
// because external marketplaces cannot send a JWT.

// ═════════════════════════════════════════════════════════════════════════════
// MCF — Amazon Smart Biz fulfilment
// ═════════════════════════════════════════════════════════════════════════════

router.post('/:id/mcf/fulfill', requirePermission('channels.sync'), async (req, res) => {
  try {
    const tenantId = req.tenant.id;
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const order = await prisma.order.findFirst({
      where: { id: req.body.orderId, tenantId },
      include: { customer: true, items: { include: { variant: true } } },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const adapter = getAdapter(channel);
    if (typeof adapter.createFulfillmentOrder !== 'function') {
      return res.status(400).json({ error: 'This channel does not support MCF fulfillment' });
    }

    const items = order.items.map((i) => ({
      sku: i.variant.sku,
      name: i.variant.name,
      qty: i.qty,
    }));

    const result = await adapter.createFulfillmentOrder(
      { ...order, customer: order.customer },
      items
    );

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PROCESSING', courierName: 'Amazon MCF' },
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/mcf/track/:orderNumber', requirePermission('channels.read'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const adapter = getAdapter(channel);
    const result = await adapter.trackShipment(req.params.orderNumber);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/mcf/cancel', requirePermission('channels.sync'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const adapter = getAdapter(channel);
    const result = await adapter.cancelFulfillmentOrder(req.body.orderNumber);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/mcf/inventory', requirePermission('channels.read'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const adapter = getAdapter(channel);
    if (typeof adapter.getMCFInventory !== 'function') {
      return res.status(400).json({ error: 'This channel does not support MCF inventory queries' });
    }
    const inventory = await adapter.getMCFInventory();
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Finances / settlements (payouts) ──────────────────────────────────────
// Pull the channel's settlement/payout groups from the marketplace (Amazon
// SP-API financialEventGroups) and store them for reconciliation.
router.post('/:id/finances/sync', requirePermission('channels.sync'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const result = await syncChannelSettlements(channel, { tenantId: req.tenant.id, since: req.body?.since });
    if (!result.supported) {
      return res.status(400).json({ error: 'This channel does not support settlement sync' });
    }
    await prisma.channel.update({ where: { id: channel.id }, data: { syncError: null } }).catch(() => {});
    res.json({ message: 'Settlement sync complete', ...result });
  } catch (err) {
    await prisma.channel.updateMany({
      where: { id: req.params.id, tenantId: req.tenant.id },
      data: { syncError: err.message },
    }).catch(() => {});
    res.status(500).json({ error: 'Settlement sync failed', details: err.message });
  }
});

router.get('/:id/finances', requirePermission('channels.read'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const settlements = await listChannelSettlements(channel.id, {
      tenantId: req.tenant.id,
      limit: req.query.limit,
    });
    res.json({ settlements, total: settlements.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Returns (read-only) ───────────────────────────────────────────────────
// Pull the channel's customer returns from the marketplace (Amazon merchant
// returns report). Refund issuance is intentionally NOT exposed here.
router.post('/:id/returns/sync', requirePermission('channels.sync'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const result = await syncChannelReturns(channel, { tenantId: req.tenant.id, since: req.body?.since });
    if (!result.supported) {
      return res.status(400).json({ error: 'This channel does not support returns sync' });
    }
    await prisma.channel.update({ where: { id: channel.id }, data: { syncError: null } }).catch(() => {});
    res.json({ message: 'Returns sync complete', ...result });
  } catch (err) {
    await prisma.channel.updateMany({
      where: { id: req.params.id, tenantId: req.tenant.id },
      data: { syncError: err.message },
    }).catch(() => {});
    res.status(500).json({ error: 'Returns sync failed', details: err.message });
  }
});

router.get('/:id/returns', requirePermission('channels.read'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const returns = await listChannelReturns(channel.id, { tenantId: req.tenant.id, limit: req.query.limit });
    res.json({ returns, total: returns.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Amazon Buy Shipping (Merchant Fulfillment, /mfn/v0) ────────────────────
// Seller-fulfilled label purchase for an MFN order. Resolves the Amazon order
// id + ship-from warehouse from our records, then rates / buys / cancels.
async function loadOrderAndShipFrom(req) {
  const tenantId = req.tenant.id;
  const order = await prisma.order.findFirst({ where: { id: req.body.orderId, tenantId } });
  if (!order) return { error: 'Order not found' };
  if (!order.channelOrderId) return { error: 'Order has no Amazon order id' };
  let shipFrom = {};
  if (req.body.warehouseId) {
    const wh = await prisma.warehouse.findFirst({ where: { id: req.body.warehouseId, tenantId } });
    if (wh) {
      const a = wh.address || {};
      shipFrom = {
        name: wh.name, line1: a.line1, line2: a.line2, city: a.city,
        state: a.state, pincode: a.pincode, country: a.country || 'IN',
        phone: wh.phone || a.phone, email: a.email,
      };
    }
  }
  return { order, shipFrom };
}

router.post('/:id/amazon/mfn/rates', requirePermission('shipments.create'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const adapter = getAdapter(channel);
    if (typeof adapter.getMfnRates !== 'function') {
      return res.status(400).json({ error: 'This channel does not support Amazon Buy Shipping' });
    }
    const { order, shipFrom, error } = await loadOrderAndShipFrom(req);
    if (error) return res.status(404).json({ error });
    const rates = await adapter.getMfnRates(order.channelOrderId, {
      shipFrom, weight: req.body.weight, dimensions: req.body.dimensions, declaredValue: req.body.declaredValue,
    });
    res.json({ rates });
  } catch (err) {
    res.status(500).json({ error: 'Rate lookup failed', details: err.message });
  }
});

router.post('/:id/amazon/mfn/buy', requirePermission('shipments.create'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const adapter = getAdapter(channel);
    if (typeof adapter.buyMfnShipping !== 'function') {
      return res.status(400).json({ error: 'This channel does not support Amazon Buy Shipping' });
    }
    const { order, shipFrom, error } = await loadOrderAndShipFrom(req);
    if (error) return res.status(404).json({ error });
    const result = await adapter.buyMfnShipping(order.channelOrderId, {
      shipFrom, weight: req.body.weight, dimensions: req.body.dimensions, declaredValue: req.body.declaredValue,
      shippingServiceId: req.body.shippingServiceId, shippingServiceOfferId: req.body.shippingServiceOfferId,
    });
    // Buying the label registers + confirms the shipment on Amazon, so advance
    // the local order to SHIPPED with the tracking Amazon assigned.
    if (result.trackingId) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          trackingNumber: result.trackingId,
          courierName: result.carrier || 'Amazon',
          channelShipmentId: result.shipmentId || null,
          status: 'SHIPPED',
          shippedAt: new Date(),
        },
      }).catch(() => {});
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Buy shipping failed', details: err.message });
  }
});

router.delete('/:id/amazon/mfn/:shipmentId', requirePermission('shipments.create'), async (req, res) => {
  try {
    const channel = await loadTenantChannel(req);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const adapter = getAdapter(channel);
    if (typeof adapter.cancelMfnShipping !== 'function') {
      return res.status(400).json({ error: 'This channel does not support Amazon Buy Shipping' });
    }
    const result = await adapter.cancelMfnShipping(req.params.shipmentId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
