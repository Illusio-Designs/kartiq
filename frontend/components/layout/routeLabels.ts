// Shared human labels for route segments. Used by both the Breadcrumbs and the
// Topbar page title so they never drift apart. Anything not listed here is
// Title-cased, and an id-looking segment (long / has digits) is "Details".

export const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  orders: 'Orders',
  products: 'Catalog',
  channels: 'Channels',
  requests: 'Requests',
  customers: 'Customers',
  shipments: 'Shipments',
  reports: 'Reports',
  vendors: 'Vendors',
  warehouses: 'Warehouses',
  settings: 'Settings',
  usage: 'Usage',
  billing: 'Billing',
  referrals: 'Referrals',
  tickets: 'Support',
  team: 'Team',
  integrations: 'Integrations',
  audit: 'Audit Log',
  onboarding: 'Onboarding',
  admin: 'Admin',
};

export function looksLikeId(seg: string): boolean {
  return seg.length >= 16 || (/\d/.test(seg) && seg.length > 8) || (seg.includes('-') && seg.length > 12);
}

export function labelForSegment(seg: string): string {
  if (ROUTE_LABELS[seg]) return ROUTE_LABELS[seg];
  if (looksLikeId(seg)) return 'Details';
  return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ');
}

// The page title shown left-aligned in the Topbar. We want the meaningful
// section name, so we skip trailing id-like segments (e.g. /orders/ORD-123 →
// "Orders") and fall back to "Dashboard" for the app root.
export function pageTitleFor(pathname: string): string {
  const parts = (pathname || '/').split('/').filter(Boolean);
  if (parts.length === 0) return 'Dashboard';
  for (let i = parts.length - 1; i >= 0; i--) {
    const label = labelForSegment(parts[i]);
    if (label !== 'Details') return label;
  }
  return 'Dashboard';
}
