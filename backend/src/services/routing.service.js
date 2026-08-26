// Smart warehouse routing
//
// Picks the best warehouse to fulfil an order based on:
//   1. Stock availability for ALL items in the order
//   2. Pincode / city proximity to the customer (if shippingAddress given)
//   3. Warehouse priority (warehouse.routingPriority, lower = preferred)
//   4. Fallback: first active warehouse
//
// Strategy: score warehouses by how many of the order's items they can fulfil
// completely, then break ties by pincode match > city match > priority.

const prisma = require('../utils/prisma');

// Score: how many order items this warehouse can fulfil in full.
async function scoreWarehouseForItems(warehouseId, items) {
  if (!items.length) return 0;
  let ableToFulfil = 0;
  for (const item of items) {
    if (!item.variantId) continue;
    const inv = await prisma.inventoryItem.findFirst({
      where: { warehouseId, variantId: item.variantId },
    });
    const available = inv ? inv.quantityAvailable : 0;
    if (available >= item.qty) ableToFulfil++;
  }
  return ableToFulfil;
}

// Returns a ranked list of warehouses for this order (best first).
async function rankWarehouses({ tenantId, items, shippingAddress }) {
  // Only route to REAL warehouses the seller operates. The virtual "Amazon FBA"
  // facility (isVirtual) is Amazon-managed — you can't ship an MFN order from
  // it — so it must never be a routing candidate.
  const warehouses = await prisma.warehouse.findMany({
    where: { tenantId, isActive: true, isVirtual: false },
  });
  if (warehouses.length === 0) return [];

  const customerPincode = String(shippingAddress?.pincode || '').trim();
  const customerCity = String(shippingAddress?.city || '').trim().toLowerCase();

  const scored = await Promise.all(
    warehouses.map(async (w) => {
      const addr = w.address || {};
      const whPincode = String(addr.pincode || '').trim();
      const whCity = String(addr.city || '').trim().toLowerCase();

      const stockScore = await scoreWarehouseForItems(w.id, items);
      const pincodeMatch = customerPincode && whPincode && customerPincode === whPincode ? 1 : 0;
      const cityMatch = customerCity && whCity && customerCity === whCity ? 1 : 0;
      // routingPriority is optional; lower = preferred. Default to 100.
      const priority = typeof w.routingPriority === 'number' ? w.routingPriority : 100;

      return {
        warehouse: w,
        stockScore,
        pincodeMatch,
        cityMatch,
        priority,
        // Composite score: stock dominates; then proximity; then priority (inverted).
        total: stockScore * 1000 + pincodeMatch * 100 + cityMatch * 10 + (1000 - priority),
      };
    })
  );

  return scored.sort((a, b) => b.total - a.total);
}

// Pick the single best warehouse for an order. Returns { warehouseId, reason, fullStock }.
async function pickBestWarehouse({ tenantId, items, shippingAddress }) {
  const ranked = await rankWarehouses({ tenantId, items, shippingAddress });
  if (!ranked.length) return null;

  const best = ranked[0];
  const allInStock = best.stockScore === items.filter((i) => i.variantId).length;

  const reasons = [];
  if (best.stockScore > 0) reasons.push(`${best.stockScore} item(s) in stock`);
  if (best.pincodeMatch) reasons.push('pincode match');
  else if (best.cityMatch) reasons.push('city match');
  if (!reasons.length) reasons.push('fallback');

  return {
    warehouseId: best.warehouse.id,
    warehouseName: best.warehouse.name,
    reason: reasons.join(' \u00B7 '),
    fullStock: allInStock,
    alternatives: ranked.slice(1, 3).map((r) => ({
      warehouseId: r.warehouse.id,
      warehouseName: r.warehouse.name,
      stockScore: r.stockScore,
    })),
  };
}

module.exports = { pickBestWarehouse, rankWarehouses };
