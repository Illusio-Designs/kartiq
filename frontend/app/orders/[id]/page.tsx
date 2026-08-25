'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Package, Truck } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { orderApi } from '@/lib/api';
import { formatCurrency, formatDateTime, ORDER_STATUS_COLORS } from '@/lib/utils';
import { DetailPageSkeleton } from '@/components/Shimmer';
import { Badge, Button, Card, Input, Select } from '@/components/ui';
import { toast } from '@/store/toast.store';

// Statuses a seller can set manually on a self-fulfilled (MFN) / manual order.
const EDITABLE_STATUSES = [
  { value: 'PENDING',    label: 'Pending' },
  { value: 'CONFIRMED',  label: 'Confirmed' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'SHIPPED',    label: 'Shipped' },
  { value: 'DELIVERED',  label: 'Delivered' },
  { value: 'CANCELLED',  label: 'Cancelled' },
];

// Map an order's fulfilment model to a human label + badge style. For Amazon
// (and any marketplace) CHANNEL = the marketplace ships it from their own
// stock (Amazon → FBA / "Fulfilled by Amazon"); SELF = the seller ships it
// themselves (Amazon → MFN / "Merchant fulfilled"); DROPSHIP = a supplier ships.
function fulfillmentInfo(order: any): { label: string; short: string; variant: 'violet' | 'blue' | 'amber' | 'slate' } | null {
  const t = order?.fulfillmentType;
  const isAmazon = String(order?.channel?.type || '').toUpperCase().includes('AMAZON');
  if (t === 'CHANNEL') return { label: isAmazon ? 'Fulfilled by Amazon (FBA)' : 'Fulfilled by channel', short: isAmazon ? 'FBA' : 'Channel', variant: 'violet' };
  if (t === 'SELF') return { label: isAmazon ? 'Self-fulfilled (MFN)' : 'Self-fulfilled', short: isAmazon ? 'MFN' : 'Self', variant: 'blue' };
  if (t === 'DROPSHIP') return { label: 'Dropship', short: 'Dropship', variant: 'amber' };
  return null;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => orderApi.get(id).then((r) => r.data),
    enabled: !!id,
  });

  // Editable fulfillment state (self-fulfilled / manual orders only).
  const [statusDraft, setStatusDraft] = useState('');
  const [trackingDraft, setTrackingDraft] = useState('');
  const [courierDraft, setCourierDraft] = useState('');
  useEffect(() => {
    if (order) {
      setStatusDraft(order.status || 'PENDING');
      setTrackingDraft(order.trackingNumber || '');
      setCourierDraft(order.courierName || '');
    }
  }, [order?.id, order?.status]);

  const statusMutation = useMutation({
    mutationFn: (body: { status: string; trackingNumber?: string; courierName?: string }) =>
      orderApi.updateStatus(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order updated');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message || 'Failed to update order'),
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
  const fulfillment = fulfillmentInfo(order);
  // Channel-fulfilled (FBA) orders are managed by the marketplace and stay
  // read-only. Self-fulfilled (MFN), dropship, and manual orders are editable
  // by the seller — they ship them and record status/tracking here.
  const editable = order.fulfillmentType !== 'CHANNEL';
  const isClosed = order.status === 'DELIVERED' || order.status === 'CANCELLED';

  // Order Summary totals — derived only from real data. Subtotal is the sum of
  // the line items; the grand total comes from the order itself. Optional
  // shipping/tax/discount rows render only when the order actually carries them.
  const subtotal = items.reduce((sum, it) => sum + Number(it.unitPrice ?? 0) * (it.qty ?? 0), 0);
  const shipping = typeof order.shippingCharges === 'number' ? order.shippingCharges : undefined;
  const tax = typeof order.taxAmount === 'number' ? order.taxAmount : undefined;
  const discount = typeof order.discount === 'number' ? order.discount : undefined;
  const grandTotal = typeof order.total === 'number' ? order.total : subtotal;

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up max-w-4xl">
        <Link href="/orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} /> Back to Orders
        </Link>

        {/* Header card — order identity + badges + status pill, with a
            fulfillment strip attached below (border-t). Consolidates what used
            to be two separate blocks into one Card so dark mode works. */}
        <Card className="overflow-hidden">
          <div className="flex items-start justify-between gap-4 flex-wrap p-5">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight truncate">
                {order.channelOrderId || order.orderNumber}
              </h1>
              <p className="text-xs text-slate-400 mt-1 font-mono truncate">{order.orderNumber}</p>
              <div className="flex items-center gap-2 flex-wrap mt-2.5">
                <Badge variant={order.channelOrderId ? 'blue' : 'slate'} dot>
                  {order.channelOrderId ? `Auto-synced from ${order.channel?.name || 'channel'}` : 'Manually created'}
                </Badge>
                {fulfillment && <Badge variant={fulfillment.variant} dot>{fulfillment.label}</Badge>}
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${statusClass}`}>{order.status}</span>
          </div>

          {/* Fulfillment strip — makes FBA vs self-fulfilled unmistakable and
              shows where the order ships from / its tracking. */}
          {fulfillment && (
            <div className="border-t border-slate-100 px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fulfillment</span>
                <Badge variant={fulfillment.variant} dot>{fulfillment.short}</Badge>
              </div>
              {order.fulfillmentType === 'CHANNEL' ? (
                <span className="text-slate-500">Stock &amp; shipping handled by {order.channel?.name || 'the channel'} — Kartriq does not deduct or push inventory for this order.</span>
              ) : (
                <>
                  <div><span className="text-slate-400">Ships from</span> <span className="font-semibold text-slate-700">{order.warehouse?.name || '—'}</span></div>
                  {order.trackingNumber && <div><span className="text-slate-400">Tracking</span> <span className="font-mono text-slate-700">{order.trackingNumber}</span>{order.courierName ? <span className="text-slate-400"> · {order.courierName}</span> : null}</div>}
                </>
              )}
            </div>
          )}
        </Card>

        {/* Editable fulfillment — self-fulfilled / manual orders only. FBA
            orders are managed by Amazon, so no manual controls are shown. */}
        {editable ? (
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Truck size={15} className="text-emerald-600" />
              <span className="text-sm font-bold text-slate-800">Update fulfillment</span>
              <span className="text-xs text-slate-400">you ship this order</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Status</label>
                <Select value={statusDraft} onChange={setStatusDraft} options={EDITABLE_STATUSES} fullWidth />
              </div>
              <Input
                label="Tracking number"
                value={trackingDraft}
                onChange={(e) => setTrackingDraft(e.target.value)}
                placeholder="e.g. 1Z999AA10123456784"
              />
              <Input
                label="Courier"
                value={courierDraft}
                onChange={(e) => setCourierDraft(e.target.value)}
                placeholder="e.g. Delhivery"
              />
              <Button
                loading={statusMutation.isPending}
                onClick={() => statusMutation.mutate({
                  status: statusDraft,
                  trackingNumber: trackingDraft || undefined,
                  courierName: courierDraft || undefined,
                })}
              >
                Save
              </Button>
            </div>
            {order.channelOrderId && order.fulfillmentType === 'SELF' && (
              <p className="text-xs text-slate-500">
                Marking this order shipped with a tracking number also confirms the shipment back to {order.channel?.name || 'the channel'} so the buyer sees tracking.
              </p>
            )}
            {isClosed && (
              <p className="text-xs text-slate-400">This order is {order.status.toLowerCase()}. You can still correct its status if needed.</p>
            )}
          </Card>
        ) : null}

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <InfoCard label="Total" value={formatCurrency(order.total || 0)} />
          <InfoCard label="Channel" value={order.channel?.name || '—'} />
          <InfoCard label="Customer" value={order.customer?.name || '—'} sub={order.customer?.email || order.customer?.phone || ''} />
          <InfoCard label="Ordered" value={order.orderedAt ? formatDateTime(order.orderedAt) : '—'} />
        </div>

        {/* Line items + order summary totals */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <Card className="overflow-hidden lg:col-span-2">
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
          </Card>

          {/* Order Summary — totals derived only from real order data. */}
          <Card className="p-5">
            <div className="text-sm font-bold text-slate-800 mb-3">Order Summary</div>
            <div className="space-y-2.5 text-sm">
              {items.length > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
              )}
              {shipping !== undefined && (
                <div className="flex justify-between text-slate-600">
                  <span>Shipping</span>
                  <span className="tabular-nums">{formatCurrency(shipping)}</span>
                </div>
              )}
              {tax !== undefined && (
                <div className="flex justify-between text-slate-600">
                  <span>Tax</span>
                  <span className="tabular-nums">{formatCurrency(tax)}</span>
                </div>
              )}
              {discount !== undefined && (
                <div className="flex justify-between text-slate-600">
                  <span>Discount</span>
                  <span className="tabular-nums">– {formatCurrency(discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-100 pt-3 mt-1 text-base font-bold text-slate-900">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Shipping address */}
        {order.shippingAddress && (
          <Card className="p-5">
            <div className="text-sm font-bold text-slate-800 mb-2">Shipping address</div>
            <div className="text-sm text-slate-600 leading-relaxed">
              {[order.shippingAddress.line1, order.shippingAddress.line2, order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.pincode, order.shippingAddress.country]
                .filter(Boolean).join(', ') || '—'}
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function InfoCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold text-slate-900 mt-1 truncate">{value}</div>
      {sub && <div className="text-xs text-slate-500 truncate">{sub}</div>}
    </Card>
  );
}
