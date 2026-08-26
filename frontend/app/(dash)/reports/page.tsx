'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportApi, dashboardApi, orderApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card, Skeleton, EmptyState, DateRangePicker, Badge, Button } from '@/components/ui';
import { StatRow } from '@/components/StatCards';
import { PageHeader } from '@/components/layout/PageHeader';
import { Boxes, ShoppingCart, Wallet, Receipt, Undo2, TrendingUp, Download, ShieldAlert, Trophy } from 'lucide-react';
import dynamic from 'next/dynamic';

const EarningsAreaChart = dynamic(() => import('@/components/charts/EarningsAreaChart'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-slate-50 dark:bg-slate-800 rounded animate-pulse" aria-hidden="true" />,
});

const VALUATION_PAGE = 20;

// Build + download a CSV from rows. Real app (not an artifact) so blob download
// works fine here.
function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [valuationLimit, setValuationLimit] = useState(VALUATION_PAGE);

  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ['report-sales', from, to],
    queryFn: () => reportApi.sales({ from: from || undefined, to: to || undefined }).then((r) => r.data),
  });
  const { data: orderStats } = useQuery({
    queryKey: ['order-stats-all'],
    queryFn: () => orderApi.stats().then((r) => r.data),
  });
  const { data: topData, isLoading: topLoading } = useQuery({
    queryKey: ['report-top-products', from, to],
    queryFn: () => reportApi.topProducts({ from: from || undefined, to: to || undefined }).then((r) => r.data),
  });
  const { data: valuation, isLoading: valuationLoading } = useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: () => reportApi.inventoryValuation().then((r) => r.data),
  });
  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.get().then((r) => r.data),
  });

  const revenueByMonth: Array<{ month: string; earnings: number }> = dashboard?.revenueByMonth || [];
  const hasRevenueSeries = revenueByMonth.some((m) => Number(m.earnings) > 0);

  const rto = orderStats?.rto || {};
  const returnRate = rto.returnRate ?? 0;

  const topProducts: any[] = topData?.products || [];
  const items: any[] = valuation?.items || [];
  const total = items.length;
  const visibleItems = items.slice(0, valuationLimit);

  return (
    <div className="space-y-5 animate-slide-up">
      <PageHeader title="Reports" />

      {/* Date range + export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Revenue, orders, returns and stock value — across every channel.</p>
        <div className="flex items-center gap-2">
          <div className="w-full sm:w-auto sm:min-w-[240px]">
            <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} placeholder="All time" />
          </div>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download size={14} />}
            disabled={!items.length}
            onClick={() => downloadCsv(
              'inventory-valuation.csv',
              ['Product', 'SKU', 'Warehouse', 'Qty', 'Cost price', 'Total value'],
              items.map((i) => [i.variant?.product?.name || '', i.variant?.sku || '', i.warehouse?.name || '', i.quantityOnHand ?? 0, i.variant?.costPrice ?? 0, i.value ?? 0]),
            )}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI stat row — revenue headline + return rate */}
      <StatRow items={[
        { label: 'Revenue', value: formatCurrency(sales?.revenue || 0), tone: 'emerald', icon: <Wallet size={16} />, hint: 'Gross, paid orders', loading: salesLoading },
        { label: 'Orders', value: (sales?.orders ?? 0).toLocaleString(), tone: 'blue', icon: <ShoppingCart size={16} />, hint: 'Excludes cancelled', loading: salesLoading },
        { label: 'Avg order value', value: formatCurrency(sales?.avgOrder || 0), tone: 'slate', icon: <Receipt size={16} />, loading: salesLoading },
        { label: 'Return rate', value: `${returnRate}%`, tone: returnRate >= 5 ? 'rose' : 'amber', icon: <Undo2 size={16} />, hint: 'Returned ÷ total orders' },
      ]} cols={4} />

      {/* Revenue trend */}
      {(dashboardLoading || hasRevenueSeries) && (
        <Card className="p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-600" />
              <div>
                <h2 className="font-bold text-slate-900 text-base">Revenue trend</h2>
                <p className="text-xs text-slate-500 mt-0.5">Gross revenue across all channels</p>
              </div>
            </div>
            <Badge variant="emerald" dot>12 months</Badge>
          </div>
          <div className="h-56 sm:h-64 -ml-2">
            {dashboardLoading ? (
              <div className="h-full w-full bg-slate-50 dark:bg-slate-800 rounded animate-pulse" aria-hidden="true" />
            ) : (
              <EarningsAreaChart data={revenueByMonth} />
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Top products */}
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center gap-2 p-5 pb-3">
            <Trophy size={16} className="text-emerald-600" />
            <div>
              <h2 className="font-bold text-slate-900 text-base">Top products</h2>
              <p className="text-xs text-slate-500 mt-0.5">By units sold {from || to ? 'in range' : '(all time)'}</p>
            </div>
          </div>
          {topLoading ? (
            <div className="space-y-2 p-5 pt-0">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : topProducts.length === 0 ? (
            <div className="p-5 pt-0"><EmptyState icon={<Trophy size={24} />} iconBg="bg-emerald-50 text-emerald-600" title="No sales yet" description="Once orders come in, your best sellers rank here." size="sm" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-5 py-2.5 font-bold">#</th>
                    <th className="px-2 py-2.5 font-bold w-full">Product</th>
                    <th className="px-2 py-2.5 font-bold text-right whitespace-nowrap">Units</th>
                    <th className="px-5 py-2.5 font-bold text-right whitespace-nowrap">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {topProducts.map((p, idx) => (
                    <tr key={p.variantId || idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3 text-slate-400 font-bold text-xs">{idx + 1}</td>
                      <td className="px-2 py-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{p.sku}</div>
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums font-semibold">{p.qty.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* RTO / returns risk */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={16} className="text-emerald-600" />
            <div>
              <h2 className="font-bold text-slate-900 text-base">RTO risk</h2>
              <p className="text-xs text-slate-500 mt-0.5">Return-to-origin risk across orders</p>
            </div>
          </div>
          <div className="space-y-3">
            <RtoBar label="High risk" value={rto.HIGH ?? 0} total={orderStats?.total ?? 0} tone="rose" />
            <RtoBar label="Medium" value={rto.MEDIUM ?? 0} total={orderStats?.total ?? 0} tone="amber" />
            <RtoBar label="Low" value={rto.LOW ?? 0} total={orderStats?.total ?? 0} tone="emerald" />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500">Needs review</span>
            <span className="text-sm font-bold text-rose-600">{(rto.needsReview ?? 0).toLocaleString()}</span>
          </div>
        </Card>
      </div>

      {/* Inventory valuation */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <div className="flex items-center gap-2">
            <Boxes size={16} className="text-emerald-600" />
            <div>
              <h2 className="font-bold text-slate-900 text-base">Inventory valuation</h2>
              <p className="text-xs text-slate-500 mt-0.5">Stock on hand valued at cost price</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-emerald-600 tabular-nums">{formatCurrency(valuation?.totalValue || 0)}</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Total value</div>
          </div>
        </div>

        {valuationLoading ? (
          <div className="space-y-2 p-5 pt-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : total === 0 ? (
          <div className="p-5 pt-2">
            <EmptyState icon={<Boxes size={26} />} iconBg="bg-emerald-50 text-emerald-600" title="No inventory to value" description="Once you add products and record stock, their valuation appears here." size="sm" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-5 py-2.5 font-bold">#</th>
                    <th className="px-2 py-2.5 font-bold w-full">Product</th>
                    <th className="px-2 py-2.5 font-bold">SKU</th>
                    <th className="px-2 py-2.5 font-bold">Warehouse</th>
                    <th className="px-2 py-2.5 font-bold text-right">Qty</th>
                    <th className="px-2 py-2.5 font-bold text-right">Cost price</th>
                    <th className="px-5 py-2.5 font-bold text-right">Total value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleItems.map((item: any, idx: number) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3 text-slate-500 font-semibold text-xs">{idx + 1}</td>
                      <td className="px-2 py-3 font-semibold text-slate-900 dark:text-slate-100">{item.variant?.product?.name}</td>
                      <td className="px-2 py-3 text-slate-500 font-mono text-xs">{item.variant?.sku}</td>
                      <td className="px-2 py-3 text-slate-500">{item.warehouse?.name}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{item.quantityOnHand}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{formatCurrency(item.variant?.costPrice || 0)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatCurrency(item.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {total > VALUATION_PAGE && (
              <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex-wrap">
                <p className="text-xs text-slate-500">Showing {visibleItems.length} of {total} items</p>
                {valuationLimit < total ? (
                  <button type="button" onClick={() => setValuationLimit((n) => n + VALUATION_PAGE)} className="text-xs font-bold text-emerald-600 hover:text-emerald-700">Show more</button>
                ) : (
                  <button type="button" onClick={() => setValuationLimit(VALUATION_PAGE)} className="text-xs font-bold text-slate-500 hover:text-slate-700">Show less</button>
                )}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function RtoBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'rose' | 'amber' | 'emerald' }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const bar = tone === 'rose' ? 'bg-rose-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-semibold text-slate-700 dark:text-slate-300">{label}</span>
        <span className="tabular-nums text-slate-500">{value.toLocaleString()} · {pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}
