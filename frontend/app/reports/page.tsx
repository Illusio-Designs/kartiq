'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { reportApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { DatePicker } from '@/components/ui/DatePicker';

export default function ReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: sales } = useQuery({
    queryKey: ['report-sales', from, to],
    queryFn: () => reportApi.sales({ from: from || undefined, to: to || undefined }).then(r => r.data),
  });

  const { data: valuation } = useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: () => reportApi.inventoryValuation().then(r => r.data),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Analytics and business insights</p>
        </div>

        {/* Date Filter */}
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">From</label>
            <DatePicker
              value={from ? new Date(from) : null}
              onChange={(d) => setFrom(d.toISOString().slice(0, 10))}
              placeholder="From date"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">To</label>
            <DatePicker
              value={to ? new Date(to) : null}
              onChange={(d) => setTo(d.toISOString().slice(0, 10))}
              placeholder="To date"
            />
          </div>
        </div>

        {/* Sales Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Total Orders', value: sales?.orders?.toLocaleString() || '0' },
            { label: 'Total Revenue', value: formatCurrency(sales?.revenue || 0) },
            { label: 'Avg Order Value', value: formatCurrency(sales?.avgOrder || 0) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border p-5">
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            </div>
          ))}
        </div>

        {/* Inventory Valuation */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Inventory Valuation</h2>
            <span className="text-lg font-bold text-emerald-600">{formatCurrency(valuation?.totalValue || 0)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500">
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
                {valuation?.items?.slice(0, 20).map((item: any, idx: number) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-gray-500 font-medium">{idx + 1}</td>
                    <td className="px-3 py-2.5 font-medium">{item.variant?.product?.name}</td>
                    <td className="px-3 py-2.5 text-gray-400 font-mono text-xs">{item.variant?.sku}</td>
                    <td className="px-3 py-2.5 text-gray-500">{item.warehouse?.name}</td>
                    <td className="px-3 py-2.5">{item.quantityOnHand}</td>
                    <td className="px-3 py-2.5">{formatCurrency(item.variant?.costPrice || 0)}</td>
                    <td className="px-3 py-2.5 font-medium text-green-700">{formatCurrency(item.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
