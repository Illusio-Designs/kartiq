// Shared plan-feature presentation.
//
// Backend Plan.features keys are machine flags (e.g. returns:'basic', vms:true,
// barcoding:'sku', maxChannels:8). These helpers turn them into the same
// user-facing labels on both the public pricing page and the in-app billing
// "Switch plan" cards, so a plan never renders raw keys like `paymentReconciliation`.

// ── Feature label catalog (mirrors backend Plan.features keys) ──────
export const FEATURE_LABELS: Record<string, string> = {
  returns: 'Returns management',
  vms: 'VMS – Video Management Solution',
  paymentReconciliation: 'Payment Reconciliation',
  mobileApp: 'Mobile App',
  purchaseManagement: 'Purchase Management',
  barcoding: 'Barcoding',
  inwardLogistics: 'Inward Logistics',
  customReports: 'Customized reports',
  apiIntegration: 'Custom / API Integration',
  advancedWarehouseOps: 'Advanced warehouse ops (FIFO, Cycle count, Handheld)',
  vendorManagement: 'Vendor Management',
  omniChannel: 'Omni Channel',
  erpIntegration: 'ERP Integration',
};

// A few flags carry a tier string instead of a boolean — surface it as a
// friendly qualifier next to the label rather than the raw value.
const VALUE_TAGS: Record<string, Record<string, string>> = {
  returns: { basic: 'Basic', enhanced: 'Enhanced', customized: 'Customized' },
  barcoding: { sku: 'SKU-level', item: 'Item-level' },
};

export function featureTag(key: string, value: unknown): string | null {
  if (typeof value === 'string') return VALUE_TAGS[key]?.[value] || value;
  return null;
}

export interface PlanFeatureLine {
  key: string;
  label: string;
  included: boolean;
  tag: string | null;
}

// Every catalog feature with an included/excluded flag, so cards can show ✓ / ✗
// consistently across plans (an excluded feature still gets a dimmed row).
export function planFeatureLines(plan: any): PlanFeatureLine[] {
  const fm = plan?.features || {};
  return Object.entries(FEATURE_LABELS).map(([key, label]) => {
    const v = fm[key];
    const included = !!v && v !== false;
    return { key, label, included, tag: included ? featureTag(key, v) : null };
  });
}

export interface PlanLimit {
  label: string;
  value: string;
}

// Numeric plan ceilings, formatted for humans (null → "Unlimited").
export function planLimits(plan: any): PlanLimit[] {
  const fmt = (n: any) =>
    n === null || n === undefined ? 'Unlimited' : Number(n).toLocaleString();
  return [
    { label: 'SKUs', value: fmt(plan?.maxSkus) },
    { label: 'Orders / month', value: fmt(plan?.maxOrdersPerMonth) },
    { label: 'Warehouses', value: fmt(plan?.maxFacilities) },
    { label: 'Sales channels', value: fmt(plan?.features?.maxChannels) },
    { label: 'Team members', value: fmt(plan?.maxUsers) },
    { label: 'User roles', value: fmt(plan?.maxUserRoles) },
  ];
}
