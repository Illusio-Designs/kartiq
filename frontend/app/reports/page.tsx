'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { reportApi, dashboardApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card, Skeleton, EmptyState, DateRangePicker, Badge } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { Boxes, ShoppingCart, Wallet, Receipt } from 'lucide-react';
import dynamic from 'next/dynamic';

// Recharts is ~90KB gzipped — load the same chart the dashboard uses only when
// it actually renders (see app/dashboard/page.tsx).
const EarningsAreaChart = dynamic(() => import('@/components/charts/EarningsAreaChart'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-50 rounded animate-pulse" aria-hidden="true" />
  ),
});

const VALUATION_PAGE = 20;

export default function ReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [valuationLimit, setValuationLimit] = useState(VALUATION_PAGE);

  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ['report-sales', from, to],
    queryFn: () => reportApi.sales({ from: from || undefined, to: to || undefined }).then(r => r.data),
  });

  const { data: valuation, isLoading: valuationLoading } = useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: () => reportApi.inventoryValuation().then(r => r.data),
  });

  // Revenue Trend is wired to the dashboard endpoint's real rolling-12-month
  // series (revenueByMonth: [{ month, earnings }]). The /reports/sales endpoint
  // returns only aggregate totals, so it can't drive a time series. This series
  // is NOT affected by the date-range picker above (it's always the last 12
  // months) — a dedicated /reports monthly endpoint would plug in here.
  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get().then(r => r.data),
  });
  const revenueByMonth: Array<{ month: string; earnings: number }> = dashboard?.revenueByMonth || [];
  // Only show the chart when there is real, non-zero revenue to plot — a brand
  // new tenant with no orders gets the card omitted rather than a flat line.
  const hasRevenueSeries = revenueByMonth.some((m) => Number(m.earnings) > 0);

  // NOTE: the reports API provides no channel breakdown, so the prototype's
  // "Channel Mix" card is intentionally omitted (no data to fabricate). If a
  // /reports/channel-mix endpoint is added, it would render as a 1-col sibling
  // of the Revenue Trend card here.

  const salesCards = [
    { label: 'Total Orders', value: sales?.orders?.toLocaleString() || '0', icon: ShoppingCart, hint: 'excludes cancelled' },
    { label: 'Total Revenue', value: formatCurrency(sales?.revenue || 0), icon: Wallet, hint: 'gross, paid orders' },
    { label: 'Avg Order Value', value: formatCurrency(sales?.avgOrder || 0), icon: Receipt, hint: 'per order' },
  ];

  const items: any[] = valuation?.items || [];
  const total = items.length;
  const visibleItems = items.slice(0, valuationLimit);

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-[1400px] mx-auto">
        <PageHeader title="Reports" />

        {/* Date range — slim row, right-aligned */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-slate-500">Analytics and business insights across every channel.</p>
          <div className="w-full sm:w-auto sm:min-w-[240px]">
            <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} placeholder="All time" />
          </div>
        </div>

        {/* ── KPI stat cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {salesLoading
            ? salesCards.map((c) => (
                <Card key={c.label} className="p-5">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-4 w-24 mt-3" />
                  <Skeleton className="h-8 w-32 mt-2" />
                </Card>
              ))
            : salesCards.map(({ label, value, icon: Icon, hint }) => (
                <Card key={label} className="p-5 hover:shadow-lg transition-shadow">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <Icon size={15} className="text-emerald-600" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{label}</span>
                  </div>
                  <div className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight tabular-nums">
                    {value}
                  </div>
                  <div className="text-xs text-slate-400 mt-1.5">{hint}</div>
                </Card>
              ))}
        </div>

        {/* ── Revenue Trend ──────────────────────────────────────────── */}
        {/* Channel Mix omitted (no channel-breakdown API) → chart is full-width */}
        {(dashboardLoading || hasRevenueSeries) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-5 lg:col-span-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-bold text-slate-900">Revenue Trend</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Gross revenue across all channels</p>
                </div>
                <Badge variant="emerald" dot>12 months</Badge>
              </div>
              <div className="h-56 sm:h-64 -ml-2">
                {dashboardLoading ? (
                  <div className="h-full w-full bg-slate-50 rounded animate-pulse" aria-hidden="true" />
                ) : (
                  <EarningsAreaChart data={revenueByMonth} />
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ── Inventory Valuation ────────────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-5 pb-3">
            <div>
              <h2 className="font-bold text-slate-900">Inventory Valuation</h2>
              <p className="text-xs text-slate-500 mt-0.5">Stock on hand valued at cost price</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-emerald-600 tabular-nums">{formatCurrency(valuation?.totalValue || 0)}</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Total value</div>
            </div>
          </div>

          {valuationLoading ? (
            <div className="space-y-2 p-5 pt-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : total === 0 ? (
            <div className="p-5 pt-2">
              <EmptyState
                icon={<Boxes size={26} />}
                iconBg="bg-emerald-50 text-emerald-600"
                title="No inventory to value"
                description="Once you add products and record stock, their valuation will appear here."
                size="sm"
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <th className="px-5 py-2.5 font-bold whitespace-nowrap">#</th>
                      <th className="px-2 py-2.5 font-bold whitespace-nowrap w-full">Product</th>
                      <th className="px-2 py-2.5 font-bold whitespace-nowrap">SKU</th>
                      <th className="px-2 py-2.5 font-bold whitespace-nowrap">Warehouse</th>
                      <th className="px-2 py-2.5 font-bold whitespace-nowrap text-right">Qty</th>
                      <th className="px-2 py-2.5 font-bold whitespace-nowrap text-right">Cost Price</th>
                      <th className="px-5 py-2.5 font-bold whitespace-nowrap text-right">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleItems.map((item: any, idx: number) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3 text-slate-500 font-semibold text-xs">{idx + 1}</td>
                        <td className="px-2 py-3 font-semibold text-slate-900">{item.variant?.product?.name}</td>
                        <td className="px-2 py-3 text-slate-500 font-mono text-xs">{item.variant?.sku}</td>
                        <td className="px-2 py-3 text-slate-500">{item.warehouse?.name}</td>
                        <td className="px-2 py-3 text-right tabular-nums">{item.quantityOnHand}</td>
                        <td className="px-2 py-3 text-right tabular-nums">{formatCurrency(item.variant?.costPrice || 0)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-emerald-700 tabular-nums">{formatCurrency(item.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {total > VALUATION_PAGE && (
                <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-100 flex-wrap">
                  <p className="text-xs text-slate-500">
                    Showing {visibleItems.length} of {total} items
                  </p>
                  {valuationLimit < total ? (
                    <button
                      type="button"
                      onClick={() => setValuationLimit((n) => n + VALUATION_PAGE)}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                    >
                      Show more
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setValuationLimit(VALUATION_PAGE)}
                      className="text-xs font-bold text-slate-500 hover:text-slate-700"
                    >
                      Show less
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
