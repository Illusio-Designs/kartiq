'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ChevronRight } from 'lucide-react';

// Human labels for known route segments. Anything not listed is Title-cased,
// and an id-looking segment (long / has digits) is shown as "Details".
const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  orders: 'Orders',
  products: 'Catalog',
  channels: 'Channels',
  requests: 'Requests',
  customers: 'Customers',
  invoices: 'Invoices',
  shipments: 'Shipments',
  purchases: 'Purchases',
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

function looksLikeId(seg: string): boolean {
  return seg.length >= 16 || /\d/.test(seg) && seg.length > 8 || seg.includes('-') && seg.length > 12;
}

function labelFor(seg: string): string {
  if (LABELS[seg]) return LABELS[seg];
  if (looksLikeId(seg)) return 'Details';
  return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ');
}

export function Breadcrumbs() {
  const pathname = usePathname() || '/';
  const parts = pathname.split('/').filter(Boolean);

  // Nothing useful to show on the dashboard root.
  if (parts.length === 0 || (parts.length === 1 && parts[0] === 'dashboard')) {
    return null;
  }

  // Build cumulative crumbs. The first "Home" always links to /dashboard.
  const crumbs = parts.map((seg, i) => ({
    label: labelFor(seg),
    href: '/' + parts.slice(0, i + 1).join('/'),
    last: i === parts.length - 1,
  }));

  return (
    <nav aria-label="Breadcrumb" className="mb-3 -mt-1">
      <ol className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 overflow-x-auto whitespace-nowrap no-scrollbar">
        <li className="flex items-center gap-1.5 flex-shrink-0">
          <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-slate-600 transition-colors">
            <Home size={13} /> <span className="hidden sm:inline">Home</span>
          </Link>
        </li>
        {crumbs.map((c) => (
          <li key={c.href} className="flex items-center gap-1.5 min-w-0">
            <ChevronRight size={12} className="text-slate-300 flex-shrink-0" />
            {c.last ? (
              <span className="text-slate-700 truncate max-w-[45vw] sm:max-w-none">{c.label}</span>
            ) : (
              <Link href={c.href} className="hover:text-slate-600 transition-colors truncate max-w-[30vw] sm:max-w-none">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
