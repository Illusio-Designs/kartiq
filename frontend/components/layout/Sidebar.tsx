'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Package, ShoppingCart,
  Store, BarChart2, Settings, LogOut,
  Plug, HelpCircle, Sparkles, PanelLeftClose, PanelLeftOpen, X,
  Wallet, UserCog, ChevronDown, Activity, Gift,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { Tooltip } from '@/components/ui/Tooltip';
import { dashboardApi, channelApi } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: any;
  badge?: number;
}

export interface SidebarNavGroup {
  label: string;
  items: SidebarNavItem[];
}

const DEFAULT_NAV_GROUPS: SidebarNavGroup[] = [
  {
    label: 'Main Menu',
    items: [
      { label: 'Dashboard',   href: '/dashboard',   icon: LayoutDashboard },
      { label: 'Orders',      href: '/orders',       icon: ShoppingCart },
      { label: 'Catalog',     href: '/products',     icon: Package },
      { label: 'Reports',     href: '/reports',      icon: BarChart2 },
    ],
  },
  {
    label: 'Features',
    items: [
      { label: 'Channels',    href: '/channels',     icon: Plug },
    ],
  },
  {
    label: 'General',
    items: [
      { label: 'Warehouses',  href: '/warehouses',   icon: Store },
      { label: 'Team',        href: '/dashboard/team',    icon: UserCog },
      { label: 'Billing',     href: '/dashboard/billing', icon: Wallet },
      { label: 'Activity log', href: '/audit',       icon: Activity },
      { label: 'Refer & earn', href: '/referrals',   icon: Gift },
      { label: 'Settings',    href: '/settings',     icon: Settings },
      { label: 'Help Desk',   href: '/help',         icon: HelpCircle },
    ],
  },
];

export interface SidebarProps {
  groups?: SidebarNavGroup[];
  brandName?: string;
  brandSubtitle?: string;
  showUpgradeCard?: boolean;
}

export function Sidebar({
  groups,
  brandName = 'Kartriq',
  brandSubtitle,
  showUpgradeCard = true,
}: SidebarProps = {}) {
  const baseGroups = groups || DEFAULT_NAV_GROUPS;
  const isDefaultNav = !groups;
  const pathname = usePathname();
  const router = useRouter();
  const { logout, tenant, plan, isPlatformAdmin } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebar, navGroupCollapsed, toggleNavGroup } = useUIStore();

  // Live counts for nav badges (only on tenant nav, not platform admin nav)
  const [counts, setCounts] = useState<{ orders?: number; channels?: number }>({});
  useEffect(() => {
    if (!isDefaultNav || !tenant || isPlatformAdmin()) return;
    let cancelled = false;
    Promise.all([
      dashboardApi.get().catch(() => null),
      channelApi.list().catch(() => null),
    ]).then(([d, c]) => {
      if (cancelled) return;
      setCounts({
        orders: d?.data?.summary?.pendingOrders,
        channels: Array.isArray(c?.data) ? c.data.length : c?.data?.channels?.length,
      });
    });
    return () => { cancelled = true; };
  }, [isDefaultNav, tenant, isPlatformAdmin]);

  const navGroups = useMemo(() => {
    if (!isDefaultNav) return baseGroups;
    return baseGroups.map(g => ({
      ...g,
      items: g.items.map(it => {
        if (it.href === '/orders'   && counts.orders)   return { ...it, badge: counts.orders };
        if (it.href === '/channels' && counts.channels) return { ...it, badge: counts.channels };
        return it;
      }),
    }));
  }, [baseGroups, counts, isDefaultNav]);

  const handleLogout = () => {
    logout();
    setMobileSidebar(false);
    router.replace('/login');
  };

  // `collapsed` only affects lg+ screens. On mobile the sidebar is always
  // rendered expanded (as a drawer) regardless of the persisted preference.
  const c = sidebarCollapsed;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setMobileSidebar(false)}
        />
      )}

      <aside
        className={cn(
          'fixed lg:sticky top-0 z-50 flex flex-col h-screen bg-white border-r border-slate-200 transition-[width,transform] duration-300 ease-out',
          'w-64',
          c ? 'lg:w-[76px]' : 'lg:w-64',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* ── Header ────────────────────────────────────────── */}
        <div className="flex items-center h-[68px] px-4">
          {/* Logo */}
          <Link
            href={navGroups[0]?.items[0]?.href || '/dashboard'}
            className={cn(
              'flex items-center gap-2.5 min-w-0',
              c && 'lg:justify-center lg:flex-1'
            )}
          >
            <Image
              src="/brand/kartriq-mark.png"
              alt="Kartriq"
              width={36}
              height={36}
              priority
              className="w-9 h-9 object-contain flex-shrink-0"
            />
            <div className={cn('min-w-0 truncate', c && 'lg:hidden')}>
              <div className="font-bold text-lg tracking-tight text-slate-900 leading-none">
                {brandName}
              </div>
              {brandSubtitle && (
                <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mt-0.5">
                  {brandSubtitle}
                </div>
              )}
            </div>
          </Link>

          {/* Desktop collapse toggle */}
          <Tooltip content={c ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
            <button
              onClick={toggleSidebar}
              aria-label={c ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'ml-auto w-8 h-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0',
                'hidden lg:flex',
                c && 'lg:hidden'
              )}
            >
              <PanelLeftClose size={15} aria-hidden="true" />
            </button>
          </Tooltip>

          {/* Mobile close */}
          <button
            onClick={() => setMobileSidebar(false)}
            aria-label="Close navigation"
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 lg:hidden flex-shrink-0"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Collapsed expand button */}
        {c && (
          <div className="hidden lg:flex px-3 pb-2 justify-center">
            <Tooltip content="Expand sidebar" side="right">
              <button
                onClick={toggleSidebar}
                aria-label="Expand sidebar"
                className="w-10 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <PanelLeftOpen size={16} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        )}

        {/* ── Nav ────────────────────────────────────────── */}
        <nav className="flex-1 px-3 py-2 space-y-3 overflow-y-auto overflow-x-hidden">
          {navGroups.map((group) => {
            // Auto-expand the group containing the active route, even if user
            // previously collapsed it. Otherwise honor the persisted state.
            const containsActive = group.items.some(
              (it) => pathname === it.href || pathname.startsWith(it.href + '/')
            );
            const collapsed = !containsActive && !!navGroupCollapsed[group.label];

            return (
            <div key={group.label}>
              {/* Group header: button on expanded sidebar, hidden on collapsed (icon-only) */}
              <button
                type="button"
                onClick={() => toggleNavGroup(group.label)}
                className={cn(
                  'w-full flex items-center justify-between px-3 mb-1 text-[10px] font-bold tracking-widest uppercase text-slate-400 hover:text-slate-600 transition-colors',
                  c && 'lg:hidden'
                )}
                aria-expanded={!collapsed}
              >
                <span>{group.label}</span>
                <ChevronDown
                  size={12}
                  className={cn(
                    'transition-transform duration-200 text-slate-400',
                    collapsed && '-rotate-90'
                  )}
                />
              </button>
              {/* Collapsed (icon-only sidebar) separator */}
              <div className={cn('hidden h-px bg-slate-200 mx-3 mb-1', c && 'lg:block')} />

              <div className={cn(
                'space-y-0.5 overflow-hidden transition-all duration-200',
                collapsed ? 'max-h-0 opacity-0' : 'max-h-[600px] opacity-100',
                // When the sidebar is icon-only (lg+ collapsed), always show items regardless of group collapse
                c && 'lg:max-h-[600px] lg:opacity-100'
              )}>
                {group.items.map((item) => {
                  const { label, href, icon: Icon } = item;
                  const badge = (item as any).badge as number | undefined;
                  const active = pathname === href || pathname.startsWith(href + '/');

                  const content = (
                    <Link
                      href={href}
                      onClick={() => setMobileSidebar(false)}
                      className={cn(
                        'group relative flex items-center gap-3 px-3 h-10 rounded-xl text-sm font-medium transition-colors',
                        c && 'lg:justify-center lg:px-0 lg:mx-auto lg:w-11',
                        active
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      )}
                    >
                      <Icon
                        size={17}
                        className={cn(
                          'flex-shrink-0',
                          active ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'
                        )}
                      />
                      <span className={cn('flex-1 min-w-0 truncate', c && 'lg:hidden')}>{label}</span>

                      {/* Expanded badge */}
                      {badge !== undefined && (
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded-md text-[10px] font-bold flex-shrink-0',
                            c && 'lg:hidden',
                            active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          )}
                        >
                          {badge}
                        </span>
                      )}

                      {/* Collapsed dot indicator */}
                      {badge !== undefined && c && (
                        <span className="hidden lg:block absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                      )}
                    </Link>
                  );

                  return (
                    <div key={href}>
                      {c ? (
                        <div className="hidden lg:block">
                          <Tooltip content={label} side="right">
                            {content}
                          </Tooltip>
                        </div>
                      ) : null}
                      {/* Always render non-tooltipped version for mobile (and for lg when not collapsed) */}
                      <div className={cn(c && 'lg:hidden')}>{content}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}
        </nav>

        {/* ── Upgrade / Plan card ────────────────────────────────────── */}
        {showUpgradeCard && (() => {
          const PLAN_TIERS = ['STANDARD', 'PROFESSIONAL', 'BUSINESS', 'ENTERPRISE'] as const;
          const PLAN_LABELS: Record<string, string> = {
            STANDARD: 'Standard',
            PROFESSIONAL: 'Professional',
            BUSINESS: 'Business',
            ENTERPRISE: 'Enterprise',
          };
          const currentCode = (plan?.code || '').toUpperCase();
          const currentIdx = PLAN_TIERS.indexOf(currentCode as any);
          const nextCode = currentIdx >= 0 && currentIdx < PLAN_TIERS.length - 1
            ? PLAN_TIERS[currentIdx + 1]
            : null;
          // On the top tier (Enterprise) — show a flat "you're on Enterprise" pill instead of an upgrade card
          if (!nextCode) {
            return (
              <div className={cn('px-3 mb-3', c && 'lg:hidden')}>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
                    <Sparkles size={12} /> Enterprise plan
                  </div>
                  <p className="text-[11px] mt-1 text-emerald-600 leading-snug">
                    Top tier — every feature unlocked.
                  </p>
                </div>
              </div>
            );
          }
          return (
            <div className={cn('px-3 mb-3', c && 'lg:hidden')}>
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-4 text-white shadow-lg shadow-emerald-500/30">
                <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 blur-xl" />
                <div className="relative">
                  <div className="flex items-center gap-1.5 text-sm font-bold">
                    Upgrade to {PLAN_LABELS[nextCode]} <span>✨</span>
                  </div>
                  <p className="text-xs text-white/80 mt-1 leading-snug">
                    {currentCode
                      ? `You're on ${PLAN_LABELS[currentCode] || currentCode}. Unlock more features and limits.`
                      : 'Higher productivity with better features.'}
                  </p>
                  <Link
                    href="/dashboard/billing"
                    className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-50 transition-colors"
                  >
                    <Sparkles size={12} /> View plans
                  </Link>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Log out ────────────────────────────────────── */}
        <div className="px-3 py-3 border-t border-slate-200">
          {/* Collapsed version (desktop) */}
          <div className={cn('hidden', c && 'lg:block')}>
            <Tooltip content="Log out" side="right">
              <button
                onClick={handleLogout}
                aria-label="Log out"
                className="w-11 h-10 mx-auto flex items-center justify-center rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut size={17} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          {/* Expanded version */}
          <button
            onClick={handleLogout}
            className={cn(
              'flex items-center gap-3 w-full px-3 h-10 text-sm font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors',
              c && 'lg:hidden'
            )}
          >
            <LogOut size={17} className="flex-shrink-0" />
            Log out
          </button>
        </div>
      </aside>
    </>
  );
}
