'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Package } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { orderApi } from '@/lib/api';
import { formatCurrency, formatDateTime, ORDER_STATUS_COLORS } from '@/lib/utils';
import { DetailPageSkeleton } from '@/components/Shimmer';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => orderApi.get(id).then((r) => r.data),
    enabled: !!id,
  });

  if (isLoading) {
    return <DashboardLayout><DetailPageSkeleton /></DashboardLayout>;
  }

  if (isError || !order) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto text-center py-20">
          <p className="text-slate-500">Order not found.</p>
          <Link href="/orders" className="text-emerald-600 font-semibold hover:underline mt-3 inline-block">← Back to Orders</Link>
        </div>
      </DashboardLayout>
    );
  }

  const items: any[] = order.items || [];
  const statusClass = (ORDER_STATUS_COLORS as any)?.[order.status] || 'bg-slate-100 text-slate-700';

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up max-w-4xl">
        <Link href="/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} /> Back to Orders
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {order.channelOrderId || order.orderNumber}
            </h1>
            <p className="text-sm text-slate-500 mt-1 font-mono">{order.orderNumber}</p>
            <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${order.channelOrderId ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
              {order.channelOrderId ? `Auto-synced from ${order.channel?.name || 'channel'}` : 'Manually created'}
            </span>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusClass}`}>{order.status}</span>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <InfoCard label="Total" value={formatCurrency(order.total || 0)} />
          <InfoCard label="Channel" value={order.channel?.name || '—'} />
          <InfoCard label="Customer" value={order.customer?.name || '—'} sub={order.customer?.email || order.customer?.phone || ''} />
          <InfoCard label="Ordered" value={order.orderedAt ? formatDateTime(order.orderedAt) : '—'} />
        </div>

        {/* Line items */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <Package size={15} className="text-emerald-600" />
            <span className="text-sm font-bold text-slate-800">Items</span>
            <span className="text-xs text-slate-400">{items.length}</span>
          </div>
          {items.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              No line items on this order yet. Amazon order-item data can lag for Pending orders — re-sync from the Orders page to backfill.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="px-5 py-2.5">Product</th>
                    <th className="px-5 py-2.5">SKU</th>
                    <th className="px-5 py-2.5 text-right">Qty</th>
                    <th className="px-5 py-2.5 text-right">Unit price</th>
                    <th className="px-5 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any) => {
                    const name = it.variant?.product?.name || it.variant?.name || '—';
                    const sku = it.variant?.sku || '—';
                    const qty = it.qty ?? 0;
                    const unit = Number(it.unitPrice ?? 0);
                    return (
                      <tr key={it.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3 text-slate-800 font-medium">{name}</td>
                        <td className="px-5 py-3 text-slate-500 font-mono text-xs">{sku}</td>
                        <td className="px-5 py-3 text-right text-slate-700">{qty}</td>
                        <td className="px-5 py-3 text-right text-slate-700">{formatCurrency(unit)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-slate-900">{formatCurrency(unit * qty)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Shipping address */}
        {order.shippingAddress && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-sm font-bold text-slate-800 mb-2">Shipping address</div>
            <div className="text-sm text-slate-600 leading-relaxed">
              {[order.shippingAddress.line1, order.shippingAddress.line2, order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.pincode, order.shippingAddress.country]
                .filter(Boolean).join(', ') || '—'}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function InfoCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold text-slate-900 mt-1 truncate">{value}</div>
      {sub && <div className="text-xs text-slate-500 truncate">{sub}</div>}
    </div>
  );
}
