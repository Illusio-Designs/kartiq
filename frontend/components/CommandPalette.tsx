'use client';

/**
 * Cmd+K command palette.
 *
 * - ⌘K (Mac) / Ctrl+K (others) toggles the palette from anywhere.
 * - Static items (navigation + create-new actions) render immediately.
 * - When the user types ≥ 2 chars, results from /products, /orders and
 *   /customers are merged in (debounced 200 ms).
 * - Arrow keys navigate, Enter activates, Esc closes. Mouse hover also
 *   highlights the row so click works without a prior keystroke.
 *
 * Mounted from DashboardLayout so it's available on every authenticated
 * page. No external dep — built on plain React state + a portal.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Package, ShoppingBag, Users, Plug, Truck, FileText, Building2,
  Store, Wallet, Settings, BarChart3, Gauge, Plus, Search, ArrowRight, CornerDownLeft,
  ShoppingCart, Briefcase, LifeBuoy, Activity, Cpu, FileEdit, Inbox, Megaphone,
} from 'lucide-react';
import { productApi, orderApi, customerApi, leadsApi, adminApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

type CmdItem = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: any;
  keywords?: string;
  run: () => void;
};

function isMac() {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
}

export function CommandPalette() {
  const router = useRouter();
  const isAdmin = useAuthStore((s) => !!s.user?.isPlatformAdmin);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<CmdItem[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Global ⌘K / Ctrl+K + Esc handling ───────────────────────────────────
  // Also listen for a custom `open-command-palette` event so other UI
  // surfaces (Topbar button, mobile menu, empty-state CTAs) can open it
  // without re-implementing the keyboard handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', onOpen);
    };
  }, [open]);

  // Reset state on open and focus the input.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setRemote([]);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // ── Static commands ─────────────────────────────────────────────────────
  // Two distinct command sets: the Founder/platform-admin one (manages the
  // SaaS itself) and the tenant one (manages their own business). We pick
  // based on isPlatformAdmin so a founder doesn't get useless "Create new
  // product" entries and a tenant doesn't see /admin pages they can't open.
  const staticItems: CmdItem[] = useMemo(() => {
    const go = (href: string) => () => { setOpen(false); router.push(href); };

    if (isAdmin) {
      return [
        // Quick actions
        { id: 'admin-tenants',  group: 'Quick actions', label: 'View all tenants',   icon: Building2, run: go('/admin/tenants') },
        { id: 'admin-leads',    group: 'Quick actions', label: 'View leads inbox',   icon: Inbox,     run: go('/admin/leads') },
        { id: 'admin-tickets',  group: 'Quick actions', label: 'Open support tickets', icon: LifeBuoy, run: go('/admin/tickets') },

        // Platform pages
        { id: 'admin-overview',   group: 'Platform', label: 'Overview',       icon: LayoutDashboard, run: go('/admin') },
        { id: 'admin-tenants-p',  group: 'Platform', label: 'Tenants',        icon: Building2,       run: go('/admin/tenants') },
        { id: 'admin-plans',      group: 'Platform', label: 'Subscriptions',  keywords: 'plans pricing billing tiers', icon: Wallet, run: go('/admin/plans') },
        { id: 'admin-tickets-p',  group: 'Platform', label: 'Tickets',        icon: LifeBuoy,        run: go('/admin/tickets') },
        { id: 'admin-leads-p',    group: 'Platform', label: 'Leads',          keywords: 'demo contact form inquiries', icon: Inbox, run: go('/admin/leads') },
        { id: 'admin-analytics',  group: 'Platform', label: 'Analytics',      icon: BarChart3,       run: go('/admin/analytics') },

        // Content
        { id: 'admin-blog',      group: 'Content', label: 'Blog',         icon: FileText,  run: go('/admin/blog') },
        { id: 'admin-content',   group: 'Content', label: 'Page content', icon: FileEdit,  run: go('/admin/content') },
        { id: 'admin-changelog', group: 'Content', label: "What's new",   keywords: 'changelog release notes', icon: Megaphone, run: go('/admin/changelog') },
        { id: 'admin-help',      group: 'Content', label: 'Help & Support', keywords: 'faq help drawer', icon: LifeBuoy, run: go('/admin/help') },
        { id: 'admin-seo',       group: 'Content', label: 'SEO',          icon: Search,    run: go('/admin/seo') },

        // System
        { id: 'admin-audit',    group: 'System', label: 'Audit log',       icon: Activity, run: go('/admin/audit') },
        { id: 'admin-jobs',     group: 'System', label: 'Background jobs', icon: Cpu,      run: go('/admin/jobs') },
        { id: 'admin-settings', group: 'System', label: 'Platform settings', icon: Settings, run: go('/admin/settings') },
      ];
    }

    // Tenant set
    return [
      // Quick actions
      { id: 'new-order',    group: 'Quick actions', label: 'Create new order',    icon: Plus, run: go('/orders?new=1') },
      { id: 'new-product',  group: 'Quick actions', label: 'Create new product',  icon: Plus, run: go('/products?new=1') },
      { id: 'new-customer', group: 'Quick actions', label: 'Create new customer', icon: Plus, run: go('/customers?new=1') },
      { id: 'topup',        group: 'Quick actions', label: 'Top up wallet',       icon: Wallet, run: go('/dashboard/billing') },

      // Navigation
      { id: 'go-dashboard',  group: 'Pages', label: 'Dashboard',     icon: LayoutDashboard, run: go('/dashboard') },
      { id: 'go-orders',     group: 'Pages', label: 'Orders',        icon: ShoppingBag,     run: go('/orders') },
      { id: 'go-products',   group: 'Pages', label: 'Catalog',       icon: Package,         run: go('/products') },
      { id: 'go-purchases',  group: 'Pages', label: 'Purchases',     icon: ShoppingCart,    run: go('/purchases') },
      { id: 'go-customers',  group: 'Pages', label: 'Customers',     icon: Users,           run: go('/customers') },
      { id: 'go-vendors',    group: 'Pages', label: 'Vendors',       icon: Briefcase,       run: go('/vendors') },
      { id: 'go-warehouses', group: 'Pages', label: 'Warehouses',    icon: Store,           run: go('/warehouses') },
      { id: 'go-channels',   group: 'Pages', label: 'Channels',      icon: Plug,            run: go('/channels') },
      { id: 'go-shipments',  group: 'Pages', label: 'Shipments',     icon: Truck,           run: go('/shipments') },
      { id: 'go-invoices',   group: 'Pages', label: 'Invoices',      icon: FileText,        run: go('/invoices') },
      { id: 'go-reports',    group: 'Pages', label: 'Reports',       icon: BarChart3,       run: go('/reports') },
      { id: 'go-help',       group: 'Pages', label: 'Help desk',     icon: LifeBuoy,        run: go('/help') },

      // Settings + billing
      { id: 'go-settings', group: 'Settings', label: 'Settings',         icon: Settings, run: go('/settings') },
      { id: 'go-billing',  group: 'Settings', label: 'Billing & wallet', icon: Wallet,   run: go('/dashboard/billing') },
      { id: 'go-usage',    group: 'Settings', label: 'Usage & limits',   icon: Gauge,    run: go('/usage') },
      { id: 'go-audit',    group: 'Settings', label: 'Activity log',     keywords: 'audit security history changes', icon: Settings, run: go('/audit') },
      { id: 'go-referrals', group: 'Settings', label: 'Refer & earn',    keywords: 'referral affiliate share invite reward earn', icon: Settings, run: go('/referrals') },
      { id: 'go-team',     group: 'Settings', label: 'Team',             icon: Users,    run: go('/dashboard/team') },
      { id: 'go-2fa',      group: 'Settings', label: 'Two-factor authentication', keywords: '2fa mfa security totp', icon: Settings, run: go('/settings?tab=security') },
      { id: 'go-export',   group: 'Settings', label: 'Export my data',   keywords: 'gdpr dpdp download data', icon: FileText, run: go('/settings?tab=security') },
    ];
  }, [router, isAdmin]);

  // ── Fuzzy filter on static items ────────────────────────────────────────
  const filteredStatic = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staticItems;
    return staticItems.filter((it) => {
      const hay = `${it.label} ${it.group} ${it.keywords || ''}`.toLowerCase();
      // Substring match — simpler and predictable. For fuzzy, swap to a
      // subsequence match here.
      return hay.includes(q);
    });
  }, [query, staticItems]);

  // ── Debounced remote search ────────────────────────────────────────────
  // Tenant: products + orders + customers. Founder: tenants + leads + tickets.
  // The two sets are mutually exclusive — calling tenant APIs as a founder
  // would either fail (no req.tenant) or return arbitrary impersonated data.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) { setRemote([]); return; }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const items: CmdItem[] = [];
        if (isAdmin) {
          const [t, l, k] = await Promise.allSettled([
            adminApi.tenants({ search: q, limit: 5 }),
            leadsApi.list({ search: q, limit: 5 }),
            adminApi.tickets({ status: undefined } as any).catch(() => ({ data: [] })),
          ]);
          if (t.status === 'fulfilled') {
            const arr = t.value.data?.tenants || t.value.data || [];
            for (const r of arr.slice(0, 5)) {
              items.push({
                id: `tenant:${r.id}`,
                group: 'Tenants',
                label: r.businessName || r.slug || r.id,
                hint: r.ownerEmail || r.status,
                icon: Building2,
                run: () => { setOpen(false); router.push(`/admin/tenants/${r.id}`); },
              });
            }
          }
          if (l.status === 'fulfilled') {
            const arr = l.value.data?.leads || [];
            for (const r of arr) {
              items.push({
                id: `lead:${r.id}`,
                group: 'Leads',
                label: r.name || r.email || r.id,
                hint: [r.email, r.status].filter(Boolean).join(' · '),
                icon: Inbox,
                run: () => { setOpen(false); router.push(`/admin/leads?id=${r.id}`); },
              });
            }
          }
          if (k.status === 'fulfilled') {
            const arr = (k.value as any).data || [];
            const ql = q.toLowerCase();
            for (const r of arr.filter((x: any) =>
              (x.subject || '').toLowerCase().includes(ql) ||
              (x.tenant?.businessName || '').toLowerCase().includes(ql)
            ).slice(0, 5)) {
              items.push({
                id: `ticket:${r.id}`,
                group: 'Tickets',
                label: r.subject || r.id,
                hint: [r.tenant?.businessName, r.status].filter(Boolean).join(' · '),
                icon: LifeBuoy,
                run: () => { setOpen(false); router.push(`/admin/tickets/${r.id}`); },
              });
            }
          }
        } else {
          const [p, o, c] = await Promise.allSettled([
            productApi.list({ search: q, limit: 5 }),
            orderApi.list({ search: q, limit: 5 }),
            customerApi.list({ search: q, limit: 5 }),
          ]);
          if (p.status === 'fulfilled') {
            const arr = p.value.data?.products || p.value.data || [];
            for (const r of arr) {
              items.push({
                id: `prod:${r.id}`,
                group: 'Products',
                label: r.name || r.sku || r.id,
                hint: r.sku ? `SKU: ${r.sku}` : undefined,
                icon: Package,
                run: () => { setOpen(false); router.push(`/products/${r.id}`); },
              });
            }
          }
          if (o.status === 'fulfilled') {
            const arr = o.value.data?.orders || o.value.data || [];
            for (const r of arr) {
              items.push({
                id: `ord:${r.id}`,
                group: 'Orders',
                label: r.orderNumber || r.id,
                hint: [r.status, r.totalAmount && `₹${r.totalAmount}`].filter(Boolean).join(' · '),
                icon: ShoppingBag,
                run: () => { setOpen(false); router.push(`/orders?id=${r.id}`); },
              });
            }
          }
          if (c.status === 'fulfilled') {
            const arr = c.value.data?.customers || c.value.data || [];
            for (const r of arr) {
              items.push({
                id: `cus:${r.id}`,
                group: 'Customers',
                label: r.name || r.email || r.id,
                hint: r.email || r.phone,
                icon: Users,
                run: () => { setOpen(false); router.push(`/customers?id=${r.id}`); },
              });
            }
          }
        }
        setRemote(items);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [open, query, router, isAdmin]);

  const allItems = useMemo(() => [...filteredStatic, ...remote], [filteredStatic, remote]);

  // Keep `active` inside bounds when results change.
  useEffect(() => {
    if (active >= allItems.length) setActive(Math.max(0, allItems.length - 1));
  }, [allItems.length, active]);

  // Scroll the active row into view as the user navigates.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmd-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, allItems.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter')   { e.preventDefault(); allItems[active]?.run(); }
    else if (e.key === 'Home')    { e.preventDefault(); setActive(0); }
    else if (e.key === 'End')     { e.preventDefault(); setActive(allItems.length - 1); }
  };

  if (!open || typeof document === 'undefined') return null;

  // Group items in render order, preserving the array order so ↑/↓ moves
  // through them in the same sequence the user sees.
  const grouped: Array<{ group: string; items: { item: CmdItem; idx: number }[] }> = [];
  allItems.forEach((item, idx) => {
    let bucket = grouped[grouped.length - 1];
    if (!bucket || bucket.group !== item.group) {
      bucket = { group: item.group, items: [] };
      grouped.push(bucket);
    }
    bucket.items.push({ item, idx });
  });

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[10000] flex items-start justify-center pt-[12vh] px-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
    >
      {/* Click-outside backdrop — a real <button> so it satisfies a11y rules
          and is keyboard-reachable. Sits behind the panel via z-order. */}
      <button
        type="button"
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default"
        tabIndex={-1}
      />
      <div
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl shadow-slate-900/30 border border-slate-200 overflow-hidden"
        onKeyDown={onListKey}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <Search size={16} className="text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            placeholder="Type a command, page, or search products / orders / customers…"
            className="flex-1 bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-2">
          {grouped.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-400">
              {searching ? 'Searching…' : 'No matches.'}
            </div>
          ) : grouped.map((g) => (
            <div key={g.group} className="mb-1">
              <div className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {g.group}
              </div>
              {g.items.map(({ item, idx }) => {
                const Icon = item.icon || ArrowRight;
                const isActive = idx === active;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-cmd-idx={idx}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => item.run()}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                      isActive ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={15} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.hint && (
                      <span className="text-[11px] text-slate-400 truncate max-w-[40%]">{item.hint}</span>
                    )}
                    {isActive && <CornerDownLeft size={12} className="text-emerald-600 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-slate-100 text-[11px] text-slate-500 bg-slate-50">
          <span className="flex items-center gap-1">
            <kbd className="font-bold text-slate-600 bg-white border border-slate-200 rounded px-1.5 py-0.5">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="font-bold text-slate-600 bg-white border border-slate-200 rounded px-1.5 py-0.5">↵</kbd>
            open
          </span>
          <span className="flex items-center gap-1 ml-auto">
            <kbd className="font-bold text-slate-600 bg-white border border-slate-200 rounded px-1.5 py-0.5">
              {isMac() ? '⌘' : 'Ctrl'}+K
            </kbd>
            toggle
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
