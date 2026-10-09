// Shared helpers for shipping labels: parcel size from the order's products,
// cheapest-rate picking, ship-from address, stored-label lookup and bulk label PDFs.
// The booking flow itself lives in shipping/shipment.service.js.

const db = require('../utils/db');
const prisma = require('../utils/prisma');

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

// The stored, ACTIVE label for an order (or null).
async function getActiveLabel(orderId, tenantId) {
  return db('order_labels').where({ tenantId, orderId, status: 'ACTIVE' }).orderBy('createdAt', 'desc').first();
}

// ── Bulk label printing ──────────────────────────────────────────────────────
// Merge the stored ACTIVE labels of many orders into ONE printable PDF (a label
// per page, in the order the ids were given). PDF labels keep their own page
// size; PNG labels get a 4×6 in page. ZPL (thermal-printer language) can't be
// shown as a page, so those orders are skipped with a reason — print them from
// the order page. A bad/corrupt file skips just that order, never the batch.
const BULK_LABELS_MAX = 100;
const LABEL_PAGE = { width: 288, height: 432 }; // 4×6 inch in PDF points

async function buildBulkLabelsPdf(ids, tenantId) {
  const unique = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
  if (!unique.length) return { status: 400, error: 'Select at least one order' };
  if (unique.length > BULK_LABELS_MAX) return { status: 400, error: `You can print at most ${BULK_LABELS_MAX} labels at once` };

  // Loaded here, not at the top of the file: if the server's node_modules is
  // behind package.json (e.g. cPanel hasn't run "NPM install" yet) only THIS
  // feature reports a clear error — the rest of the API must still boot.
  let PDFDocument;
  try { ({ PDFDocument } = require('pdf-lib')); } catch {
    return { status: 503, error: 'Bulk label printing needs the "pdf-lib" package, which is not installed on this server yet. Run "NPM install" for the backend (cPanel → Setup Node.js App) and restart.' };
  }

  const orders = await prisma.order.findMany({ where: { id: { in: unique }, tenantId }, take: BULK_LABELS_MAX });
  const byId = new Map(orders.map((o) => [o.id, o]));
  // newest ACTIVE label per order
  const rows = await db('order_labels').where({ tenantId, status: 'ACTIVE' }).whereIn('orderId', unique).orderBy('createdAt', 'desc');
  const labelByOrder = new Map();
  for (const r of rows) if (!labelByOrder.has(r.orderId)) labelByOrder.set(r.orderId, r);

  const out = await PDFDocument.create();
  const skipped = [];
  let printed = 0;
  let pages = 0;
  for (const id of unique) {
    const order = byId.get(id);
    if (!order) { skipped.push({ id, reason: 'Order not found' }); continue; }
    const name = order.orderNumber || order.channelOrderId || id;
    if (order.fulfillmentType === 'CHANNEL') { skipped.push({ id, order: name, reason: 'Fulfilled by the marketplace (FBA) — no label needed' }); continue; }
    let label = labelByOrder.get(id);
    if (!label) {
      const gone = ['SHIPPED', 'DELIVERED', 'RETURNED'].includes(order.status);
      skipped.push({ id, order: name, reason: gone
        ? `Already ${order.status.toLowerCase()} without a label from Kartriq — there is no label file to download`
        : order.status === 'CANCELLED' ? 'Order is cancelled'
        : 'No active shipping label — press Confirm first' });
      continue;
    }
    if (!label.content) { // courier-hosted / Easy Ship label: fetch it once and keep it
      const got = await require('./shipping/shipment.service').getLabelFile(id, tenantId);
      if (got.error || !got.label?.content) { skipped.push({ id, order: name, reason: got.error || 'Label is not available yet' }); continue; }
      label = got.label;
    }
    const mime = String(label.mime || 'application/pdf').toLowerCase();
    try {
      const bytes = Buffer.from(label.content, 'base64');
      if (mime.includes('pdf')) {
        const src = await PDFDocument.load(bytes);
        const copied = await out.copyPages(src, src.getPageIndices());
        copied.forEach((pg) => out.addPage(pg));
        pages += copied.length;
      } else if (mime.includes('png')) {
        const img = await out.embedPng(bytes);
        const scale = Math.min(LABEL_PAGE.width / img.width, LABEL_PAGE.height / img.height);
        const w = img.width * scale; const h = img.height * scale;
        const pg = out.addPage([LABEL_PAGE.width, LABEL_PAGE.height]);
        pg.drawImage(img, { x: (LABEL_PAGE.width - w) / 2, y: LABEL_PAGE.height - h, width: w, height: h });
        pages += 1;
      } else {
        skipped.push({ id, order: name, reason: 'Thermal (ZPL) label — print it from the order page' });
        continue;
      }
      printed += 1;
    } catch (e) {
      skipped.push({ id, order: name, reason: 'Label file could not be read' });
    }
  }
  if (!printed) return { status: 400, error: 'None of the selected orders has a printable label', skipped };
  const pdf = Buffer.from(await out.save()).toString('base64');
  return { pdf, printed, pages, skipped };
}

module.exports = {
  getActiveLabel, buildBulkLabelsPdf, BULK_LABELS_MAX, resolveParcel, pickCheapest, warehouseShipFrom, DEFAULT_WEIGHT_G, DEFAULT_DIMS_CM,
};
