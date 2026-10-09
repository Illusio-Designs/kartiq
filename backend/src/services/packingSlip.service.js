// Packing slip — the sheet that goes inside the parcel for a self-fulfilled
// (MFN / own-store) order: what to pick, where it is going, where it ships from.
//
// Rendered as a self-contained, script-free HTML page that prints cleanly on A4
// or A5 (browser "Print → Save as PDF" also works). Deliberately has NO prices,
// totals or marketplace links: a packing slip is a pick-and-pack document, and
// Amazon's seller policy asks MFN slips not to carry pricing or promotions.
//
// Every value is HTML-escaped — buyer name/address/notes come from the
// marketplace and must never be able to inject markup.

const prisma = require('../utils/prisma');

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function asObject(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : {}; } catch { return { line1: String(v) }; }
}

// Address object → display lines (skips blanks).
function addressLines(a) {
  const x = asObject(a);
  const cityLine = [x.city, x.state].filter(Boolean).join(', ');
  const pin = [cityLine, x.pincode || x.postalCode || x.zip].filter(Boolean).join(' – ');
  return [x.line1 || x.address1, x.line2 || x.address2, pin, x.country].filter((l) => l && String(l).trim());
}

function block(title, lines) {
  const body = lines.filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join('') || '<div class="muted">—</div>';
  return `<div class="box"><h3>${esc(title)}</h3>${body}</div>`;
}

function fmtDate(d) {
  const dt = d ? new Date(d) : new Date();
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderPackingSlipHtml({ order, tenant, warehouse, customer, items }) {
  const shipTo = addressLines(order.shippingAddress);
  const wa = asObject(warehouse?.address);
  const shipFrom = [warehouse?.name, ...addressLines(wa), warehouse?.phone || wa.phone ? `Phone: ${warehouse?.phone || wa.phone}` : null];
  const totalUnits = items.reduce((n, it) => n + (Number(it.qty) || 0), 0);
  const ref = order.channelOrderId && order.channelOrderId !== order.orderNumber
    ? `<div><span class="k">Marketplace order</span> ${esc(order.channelOrderId)}</div>` : '';
  const ship = order.trackingNumber
    ? `<div><span class="k">Shipped with</span> ${esc(order.courierName || 'Courier')} · ${esc(order.trackingNumber)}</div>` : '';

  const rows = items.map((it, i) => {
    const v = it.variant || {};
    const prod = v.product || {};
    const name = prod.name || v.name || it.name || 'Item';
    const variantName = v.name && v.name !== prod.name ? v.name : '';
    return `<tr>
      <td class="c">${i + 1}</td>
      <td><div class="strong">${esc(name)}</div>${variantName ? `<div class="muted">${esc(variantName)}</div>` : ''}</td>
      <td class="mono">${esc(v.sku || prod.sku || '')}</td>
      <td class="c qty">${esc(it.qty)}</td>
      <td class="c"><span class="tick"></span></td>
    </tr>`;
  }).join('');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Packing slip ${esc(order.orderNumber || order.id)}</title>
<style>
  *{box-sizing:border-box}
  body{font:13px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;margin:0;padding:24px;background:#fff}
  .sheet{max-width:780px;margin:0 auto}
  header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
  h1{font-size:22px;letter-spacing:.08em;margin:0 0 2px}
  .seller{font-size:14px;font-weight:700}
  .meta{text-align:right}
  .k{color:#666;margin-right:6px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
  .box{border:1px solid #bbb;border-radius:6px;padding:10px 12px;min-height:92px}
  .box h3{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#555}
  table{width:100%;border-collapse:collapse;margin-bottom:12px}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#555;text-align:left;border-bottom:1px solid #111;padding:6px 8px}
  td{border-bottom:1px solid #ddd;padding:8px;vertical-align:top}
  .c{text-align:center;width:44px} .qty{font-size:16px;font-weight:700}
  .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
  .strong{font-weight:600} .muted{color:#777}
  .tick{display:inline-block;width:14px;height:14px;border:1.5px solid #111;border-radius:2px}
  .total{text-align:right;font-weight:700;margin-bottom:14px}
  .notes{border:1px dashed #999;border-radius:6px;padding:8px 12px;margin-bottom:14px}
  footer{border-top:1px solid #ccc;padding-top:10px;color:#555;font-size:12px}
  @page{margin:12mm}
  @media print{body{padding:0}.sheet{max-width:none}}
</style></head>
<body><div class="sheet">
  <header>
    <div><h1>PACKING SLIP</h1><div class="seller">${esc(tenant?.businessName || '')}</div></div>
    <div class="meta">
      <div><span class="k">Order</span><strong>${esc(order.orderNumber || order.id)}</strong></div>
      ${ref}
      <div><span class="k">Date</span> ${esc(fmtDate(order.orderedAt || order.createdAt))}</div>
      ${ship}
    </div>
  </header>
  <div class="grid">
    ${block('Ship to', [customer?.name, ...shipTo, customer?.phone ? `Phone: ${customer.phone}` : null])}
    ${block('Ship from', shipFrom)}
  </div>
  <table>
    <thead><tr><th class="c">#</th><th>Item</th><th>SKU</th><th class="c">Qty</th><th class="c">Packed</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="muted">No items on this order.</td></tr>'}</tbody>
  </table>
  <div class="total">Total units: ${esc(totalUnits)}</div>
  ${order.notes ? `<div class="notes"><span class="k">Note</span> ${esc(order.notes)}</div>` : ''}
  <footer>Thank you for your order${tenant?.businessName ? ` from ${esc(tenant.businessName)}` : ''}. Please check the items on arrival.</footer>
</div></body></html>`;
}

// Load everything the slip needs, tenant-scoped. Returns { html } or { error, status }.
async function buildPackingSlip(orderId, tenantId) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: { customer: true, warehouse: true, items: { include: { variant: { include: { product: true } } } } },
  });
  if (!order) return { status: 404, error: 'Order not found' };
  if (order.fulfillmentType === 'CHANNEL') {
    return { status: 400, error: 'This order is fulfilled by the marketplace (e.g. Amazon FBA) — no packing slip is needed.' };
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const html = renderPackingSlipHtml({
    order, tenant, warehouse: order.warehouse, customer: order.customer, items: order.items || [],
  });
  return { html, order };
}

module.exports = { buildPackingSlip, renderPackingSlipHtml };
