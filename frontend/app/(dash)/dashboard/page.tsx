'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { dashboardApi, channelApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  Tooltip, Badge, Card, Pagination, Dropdown, Avatar,
} from '@/components/ui';
import {
  Wallet, TrendingDown, ShoppingBag, MoreHorizontal, ArrowUp, ArrowDown,
  ArrowUpRight, Plus, Package, Info, RefreshCw,
} from 'lucide-react';
import { StatsSkeleton, CardSkeletonItem, TableRowsSkeleton } from '@/components/Shimmer';
import dynamic from 'next/dynamic';
import Link from 'next/link';

// Order status → badge colour (was hard-coded to "Success" for every row).
const STATUS_BADGE: Record<string, 'emerald' | 'blue' | 'amber' | 'rose' | 'slate'> = {
  DELIVERED: 'emerald', SHIPPED: 'blue', PROCESSING: 'amber', CONFIRMED: 'blue',
  PENDING: 'slate', CANCELLED: 'rose', RETURNED: 'rose',
};

// Recharts is ~90KB gzipped — load it only when the chart hits the viewport.
const EarningsAreaChart = dynamic(() => import('@/components/charts/EarningsAreaChart'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-50 rounded animate-pulse" aria-hidden="true" />
  ),
});

export default function DashboardPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get().then(r => r.data),
  });
  const { data: channelCatalog } = useQuery({
    queryKey: ['dashboard-channels'],
    queryFn: () => channelApi.catalog().then(r => r.data),
  });

  const s = data?.summary || {};
  const monthRevenue = Number(s.monthRevenue || 0);
  const lastMonthRevenue = Number(s.lastMonthRevenue || 0);
  const revenueChangePct = lastMonthRevenue > 0
    ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
    : null;

  // Default goals shown until tenant-configurable targets exist
  const MONTHLY_REVENUE_GOAL = 100_000;
  const PRODUCT_LISTING_GOAL = 500;
  const connectedChannels = (channelCatalog?.catalog || [])
    .filter((c: any) => c.status === 'connected')
    .slice(0, 4);

  const allOrders = data?.recentOrders || [];
  const totalOrders = allOrders.length;
  const paginatedOrders = allOrders.slice((page - 1) * pageSize, page * pageSize);

  // Real 12-month earnings from the backend. Show an empty chart the first
  // time a tenant has no orders yet rather than falling back to fake data.
  const CHART_DATA = data?.revenueByMonth || [];

  // First load — shimmer the whole dashboard rather than flashing zeros.
  if (isLoading) {
    return (
      <div className="space-y-5 animate-slide-up">
        <PageHeader
          title="Dashboard"
          subtitle="Welcome back — here's what's happening across your commerce today."
        />
        <StatsSkeleton count={3} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2"><CardSkeletonItem /></div>
          <CardSkeletonItem />
        </div>
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <div className="h-4 w-40 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          </div>
          <table className="w-full"><tbody><TableRowsSkeleton rows={6} cols={5} cellClassName="px-5 py-3" /></tbody></table>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-slide-up">
        {/* ── Slim header: welcome subtitle + date picker (no big gradient h1) ── */}
        <PageHeader
          title="Dashboard"
          subtitle="Welcome back — here's what's happening across your commerce today."
        />

        {/* ── Stat cards ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Total Revenue */}
          <Card className="p-5 flex flex-col gap-2.5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Wallet size={15} className="text-emerald-600" />
                </div>
                <span className="text-sm font-semibold text-slate-600 truncate">Total Revenue</span>
                <Tooltip content="Sum of all paid orders this month">
                  <Info size={12} className="text-slate-400 flex-shrink-0" />
                </Tooltip>
              </div>
              <Dropdown
                trigger={<button type="button" aria-label="More actions" className="text-slate-400 hover:text-slate-700 p-1"><MoreHorizontal size={16} /></button>}
                items={[
                  {
                    label: isFetching ? 'Refreshing…' : 'Refresh data',
                    icon: <RefreshCw size={14} className={isFetching ? 'animate-spin' : undefined} />,
                    onClick: () => { refetch(); },
                  },
                ]}
              />
            </div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight tabular-nums">
              {formatCurrency(monthRevenue)}
            </div>
            <div className="flex items-center gap-1.5">
              {revenueChangePct === null ? (
                <span className="text-xs text-slate-400">No prior-month data</span>
              ) : (
                <>
                  <Badge variant={revenueChangePct >= 0 ? 'emerald' : 'rose'}>
                    {revenueChangePct >= 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                    {Math.abs(revenueChangePct).toFixed(1)}%
                  </Badge>
                  <span className="text-xs text-slate-400">from last month</span>
                </>
              )}
            </div>
          </Card>

          {/* Total Orders — clickable through to the Orders list */}
          <Link href="/orders" className="block group">
          <Card className="p-5 flex flex-col gap-2.5 hover:shadow-lg group-hover:border-slate-300 dark:group-hover:border-slate-700 transition-all h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <ShoppingBag size={15} className="text-blue-600" />
                </div>
                <span className="text-sm font-semibold text-slate-600 truncate">Total Orders</span>
              </div>
              <ArrowUpRight size={15} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight tabular-nums">
              {(s.totalOrders || 0).toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="blue">{(s.pendingOrders || 0).toLocaleString()} pending</Badge>
              <span className="text-xs text-slate-400">
                {(s.todayOrders || 0).toLocaleString()} received today
              </span>
            </div>
          </Card>
          </Link>

          {/* Low Stock SKUs — clickable through to the low-stock inventory view */}
          <Link href="/products?view=inventory&lowStock=true" className="block group sm:col-span-2 lg:col-span-1">
          <Card className="p-5 flex flex-col gap-2.5 hover:shadow-lg group-hover:border-slate-300 dark:group-hover:border-slate-700 transition-all h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0">
                  <TrendingDown size={15} className="text-rose-600" />
                </div>
                <span className="text-sm font-semibold text-slate-600 truncate">Low Stock SKUs</span>
              </div>
              <ArrowUpRight size={15} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>
            <div className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight tabular-nums">
              {(s.lowStockCount || 0).toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="rose">
                <ArrowDown size={10} /> reorder
              </Badge>
              <span className="text-xs text-slate-400">below reorder point</span>
            </div>
          </Card>
          </Link>
        </div>

        {/* ── Channels + Chart ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5 order-2 lg:order-1">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-slate-900">My Channels</h2>
                <p className="text-xs text-slate-500 mt-0.5">Connected sales & logistics</p>
              </div>
              <Tooltip content="Connect a new channel">
                <Link href="/channels" className="flex items-center gap-1 text-xs text-emerald-600 font-semibold hover:text-emerald-700">
                  <Plus size={12} /> Add New
                </Link>
              </Tooltip>
            </div>
            <div className="space-y-1">
              {connectedChannels.length > 0 ? connectedChannels.map((c: any) => (
                <div key={c.type} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={c.name || c.type} size="md" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">{c.name}</div>
                      <div className="text-xs text-slate-500 font-semibold">{c.category || 'Connected'}</div>
                    </div>
                  </div>
                  <Badge variant="emerald" dot>Active</Badge>
                </div>
              )) : (
                <Link href="/channels" className="block p-6 text-center rounded-xl border-2 border-dashed border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors">
                  <Plus size={20} className="mx-auto text-slate-400 mb-2" />
                  <div className="text-sm font-semibold text-slate-700">Connect a channel</div>
                  <div className="text-xs text-slate-500 mt-0.5">Start selling on Amazon, Flipkart & more</div>
                </Link>
              )}
            </div>
          </Card>

          <Card className="p-5 lg:col-span-2 order-1 lg:order-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-bold text-slate-900">Revenue Overview</h2>
                <p className="text-xs text-slate-500 mt-0.5">12-month trend across all channels</p>
              </div>
              <Badge variant="emerald" dot>Earnings</Badge>
            </div>

            <div className="h-56 sm:h-64 -ml-2">
              <EarningsAreaChart data={CHART_DATA} />
            </div>
          </Card>
        </div>

        {/* ── Recent transactions + Targets ────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-5 pb-3">
              <div>
                <h2 className="font-bold text-slate-900">Recent Transactions</h2>
                <p className="text-xs text-slate-500 mt-0.5">Latest orders across channels</p>
              </div>
              <Link href="/orders" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                View All <ArrowUpRight size={11} />
              </Link>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                    <th className="px-5 pb-3 font-bold">#</th>
                    <th className="px-2 pb-3 font-bold">Activity</th>
                    <th className="px-2 pb-3 font-bold">Date</th>
                    <th className="px-2 pb-3 font-bold">Price</th>
                    <th className="px-2 pb-3 font-bold text-right pr-5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedOrders.map((o: any, idx: number) => (
                    <tr key={o.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 text-slate-500 font-semibold text-xs">{(page - 1) * pageSize + idx + 1}</td>
                      <td className="px-2 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                            <Package size={13} className="text-emerald-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 text-xs truncate">{o.channelOrderId || o.orderNumber}</div>
                            <div className="text-[10px] text-slate-500 truncate">{o.customer?.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-2 py-3.5 text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(o.total)}</td>
                      <td className="px-2 py-3.5 text-right pr-5">
                        <Badge variant={STATUS_BADGE[o.status] || 'slate'} dot>{o.status || '—'}</Badge>
                      </td>
                    </tr>
                  ))}
                  {paginatedOrders.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-sm text-slate-500">
                        No recent orders yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="md:hidden divide-y divide-slate-100">
              {paginatedOrders.map((o: any) => (
                <div key={o.id} className="px-5 py-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Package size={15} className="text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">{o.channelOrderId || o.orderNumber}</div>
                    <div className="text-xs text-slate-500 truncate">{o.customer?.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(o.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(o.total)}</div>
                    <Badge variant={STATUS_BADGE[o.status] || 'slate'} dot className="mt-1">{o.status || '—'}</Badge>
                  </div>
                </div>
              ))}
              {paginatedOrders.length === 0 && !isLoading && (
                <div className="text-center py-10 text-sm text-slate-500">No recent orders yet</div>
              )}
            </div>

            {totalOrders > pageSize && (
              <div className="border-t border-slate-100">
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={totalOrders}
                  onPageChange={setPage}
                  onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                />
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4">
              <h2 className="font-bold text-slate-900">Inventory Targets</h2>
              <p className="text-xs text-slate-500 mt-0.5">Progress toward this month&apos;s goals</p>
            </div>
            <div className="space-y-3">
              {[
                {
                  name: 'Monthly Target',
                  current: monthRevenue,
                  target: MONTHLY_REVENUE_GOAL,
                  pct: Math.min(100, Math.round((monthRevenue / MONTHLY_REVENUE_GOAL) * 100)),
                },
                {
                  name: 'Product Listings',
                  current: s.totalProducts || 0,
                  target: PRODUCT_LISTING_GOAL,
                  pct: Math.min(100, Math.round(((s.totalProducts || 0) / PRODUCT_LISTING_GOAL) * 100)),
                },
              ].map(g => (
                <div key={g.name} className="p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <Package size={14} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">{g.name}</div>
                      <div className="text-xs text-slate-500 truncate tabular-nums">
                        {typeof g.current === 'number' && g.current > 1000 ? formatCurrency(g.current) : g.current.toLocaleString()}
                        {' / '}
                        {typeof g.target === 'number' && g.target > 1000 ? formatCurrency(g.target) : g.target.toLocaleString()}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-600">{g.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, g.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
    </div>
  );
}
