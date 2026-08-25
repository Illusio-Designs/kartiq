'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { reportApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card, Skeleton, EmptyState, DateRangePicker } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { Boxes } from 'lucide-react';

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

  const salesCards = [
    { label: 'Total Orders', value: sales?.orders?.toLocaleString() || '0' },
    { label: 'Total Revenue', value: formatCurrency(sales?.revenue || 0) },
    { label: 'Avg Order Value', value: formatCurrency(sales?.avgOrder || 0) },
  ];

  const items: any[] = valuation?.items || [];
  const total = items.length;
  const visibleItems = items.slice(0, valuationLimit);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Reports" subtitle="Analytics and business insights" />

        {/* Date range */}
        <div className="max-w-xs">
          <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Date range</label>
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} placeholder="All time" />
        </div>

        {/* Sales Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {salesLoading
            ? salesCards.map((c) => (
                <Card key={c.label} className="p-5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-32 mt-2" />
                </Card>
              ))
            : salesCards.map(({ label, value }) => (
                <Card key={label} className="p-5">
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
                </Card>
              ))}
        </div>

        {/* Inventory Valuation */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Inventory Valuation</h2>
            <span className="text-lg font-bold text-emerald-600">{formatCurrency(valuation?.totalValue || 0)}</span>
          </div>

          {valuationLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : total === 0 ? (
            <EmptyState
              icon={<Boxes size={26} />}
              iconBg="bg-emerald-50 text-emerald-600"
              title="No inventory to value"
              description="Once you add products and record stock, their valuation will appear here."
              size="sm"
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-slate-500">
                      <th className="px-3 py-2 font-medium whitespace-nowrap">#</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap w-full">Product</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">SKU</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Warehouse</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Qty</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Cost Price</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleItems.map((item: any, idx: number) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 text-slate-500 font-medium">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-medium">{item.variant?.product?.name}</td>
                        <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{item.variant?.sku}</td>
                        <td className="px-3 py-2.5 text-slate-500">{item.warehouse?.name}</td>
                        <td className="px-3 py-2.5">{item.quantityOnHand}</td>
                        <td className="px-3 py-2.5">{formatCurrency(item.variant?.costPrice || 0)}</td>
                        <td className="px-3 py-2.5 font-medium text-emerald-700">{formatCurrency(item.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {total > VALUATION_PAGE && (
                <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
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
