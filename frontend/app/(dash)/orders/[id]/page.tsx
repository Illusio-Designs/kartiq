'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Package, Truck, PackageCheck, Navigation, XCircle, Ship, Printer, Store, CheckCircle2 } from 'lucide-react';
import { orderApi, channelApi, warehouseApi } from '@/lib/api';
import { formatCurrency, formatDateTime, ORDER_STATUS_COLORS } from '@/lib/utils';
import { DetailPageSkeleton } from '@/components/Shimmer';
import { Badge, Button, Card, Input, Select, useConfirm } from '@/components/ui';
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

  // ── RTO review gate (approve / reject) ──────────────────────────────────────
  // High RTO-risk orders are held with needsApproval=true before fulfilment.
  // Approving confirms the order so it can ship; rejecting cancels it.
  const approveMutation = useMutation({
    mutationFn: () => orderApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order approved — cleared for fulfilment');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message || 'Could not approve order'),
  });
  const rejectMutation = useMutation({
    mutationFn: () => orderApi.reject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order rejected and cancelled');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message || 'Could not reject order'),
  });

  // ── Buyer review request (Amazon Solicitations) ─────────────────────────────
  // Ask the marketplace to send the "Request a Review" solicitation to the
  // buyer. Amazon only permits this 5–30 days after delivery.
  const requestReviewMutation = useMutation({
    mutationFn: () => orderApi.requestReview(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Buyer review requested via the channel');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message || 'Could not request review'),
  });

  // ── Generate label (self-fulfilled) ────────────────────────────────────────
  // A connected logistics courier (category === 'LOGISTICS') mints a real AWB
  // for this order and ships it from the chosen warehouse. The backend also
  // stamps trackingNumber/courierName/status on the order, so we refetch it.
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehouseApi.list().then((r) => r.data),
  });
  const warehouses: any[] = Array.isArray(warehousesData) ? warehousesData : (warehousesData?.warehouses || []);

  const [labelCourierId, setLabelCourierId] = useState('');
  const [shipFromId, setShipFromId] = useState('');
  const [shipResult, setShipResult] = useState<any>(null);

  const createShipmentMutation = useMutation({
    mutationFn: () =>
      channelApi
        .createShipment(labelCourierId, { orderId: order.id, warehouseId: shipFromId || undefined })
        .then((r) => r.data),
    onSuccess: (data: any) => {
      setShipResult(data);
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Shipping label generated');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message || 'Could not generate label'),
  });

  // ── Amazon MCF (multi-channel fulfilment) ──────────────────────────────────
  // Find the first connected AMAZON_SMARTBIZ / AMAZON_FBA channel — the "MCF
  // channel" that can fulfil this order via Amazon's warehouses.
  const [confirmUi, confirm] = useConfirm();
  const [mcfTracking, setMcfTracking] = useState<string | null>(null);
  const { data: channelsData } = useQuery({
    queryKey: ['channels'],
    queryFn: () => channelApi.list().then((r) => r.data),
  });
  const channels: any[] = Array.isArray(channelsData) ? channelsData : (channelsData?.channels || []);
  const logisticsCouriers = channels.filter((c) => String(c.category || '').toUpperCase() === 'LOGISTICS');
  // Sensible defaults for the label form once data lands.
  useEffect(() => {
    if (!labelCourierId && logisticsCouriers.length) setLabelCourierId(logisticsCouriers[0].id);
  }, [logisticsCouriers.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (shipFromId) return;
    if (order?.warehouse?.id) setShipFromId(order.warehouse.id);
    else if (warehouses.length) setShipFromId(warehouses[0].id);
  }, [order?.warehouse?.id, warehouses.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const mcfChannel = channels.find((c) => {
    const t = String(c.type || '').toUpperCase();
    return t === 'AMAZON_SMARTBIZ' || t === 'AMAZON_FBA';
  });

  const mcfFulfillMutation = useMutation({
    mutationFn: () => channelApi.mcfFulfill(mcfChannel.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Fulfilment requested via Amazon MCF');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message || 'MCF fulfilment failed'),
  });
  const mcfTrackMutation = useMutation({
    mutationFn: (orderNumber: string) => channelApi.mcfTrack(mcfChannel.id, orderNumber).then((r) => r.data),
    onSuccess: (data: any) => {
      const st = data?.status || data?.trackingStatus || data?.state;
      setMcfTracking(st ? String(st) : 'No tracking status yet');
      toast.success(st ? `Amazon status: ${st}` : 'Tracking retrieved');
    },
    onError: (e: any) => { setMcfTracking(null); toast.error(e?.response?.data?.error || e.message || 'Could not fetch tracking'); },
  });
  const mcfCancelMutation = useMutation({
    mutationFn: (orderNumber: string) => channelApi.mcfCancel(mcfChannel.id, orderNumber),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      setMcfTracking(null);
      toast.success('MCF order cancelled');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message || 'MCF cancel failed'),
  });

  const handleMcfFulfill = async () => {
    const ok = await confirm({
      title: 'Fulfil via Amazon?',
      description: `Amazon will pick, pack, and ship this order from its own warehouses (MCF). This creates a real fulfilment order on ${mcfChannel?.name || 'Amazon'}.`,
    });
    if (ok) mcfFulfillMutation.mutate();
  };
  const handleMcfCancel = async () => {
    const ok = await confirm({
      title: 'Cancel Amazon fulfilment?',
      description: 'This asks Amazon to cancel the MCF fulfilment order. It may not be possible once the order has shipped.',
      variant: 'danger',
    });
    if (ok) mcfCancelMutation.mutate(order.orderNumber);
  };

  // ── Buy shipping via Amazon (Merchant Fulfilment / Buy Shipping) ────────────
  // Amazon-partnered carrier label for a self-fulfilled (MFN) Amazon order:
  // fetch eligible rates, pick one, buy the label. The buy call auto-confirms
  // the shipment + stamps tracking on the order server-side, so we refetch.
  const [amznWhId, setAmznWhId] = useState('');
  const [amznWeight, setAmznWeight] = useState('500');
  const [amznLength, setAmznLength] = useState('20');
  const [amznWidth, setAmznWidth] = useState('15');
  const [amznHeight, setAmznHeight] = useState('10');
  const [amznRates, setAmznRates] = useState<any[] | null>(null);
  const [amznServiceId, setAmznServiceId] = useState('');
  const [amznResult, setAmznResult] = useState<any>(null);
  const [amznLabelUrl, setAmznLabelUrl] = useState<string | null>(null);
  useEffect(() => {
    if (amznWhId) return;
    if (order?.warehouse?.id) setAmznWhId(order.warehouse.id);
    else if (warehouses.length) setAmznWhId(warehouses[0].id);
  }, [order?.warehouse?.id, warehouses.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const amznWeightPayload = () => ({ value: Number(amznWeight) || 500, unit: 'grams' });
  const amznDimsPayload = () => ({
    length: Number(amznLength) || 0,
    width: Number(amznWidth) || 0,
    height: Number(amznHeight) || 0,
    unit: 'centimeters',
  });

  const amznRatesMutation = useMutation({
    mutationFn: () =>
      channelApi
        .amazonMfnRates(order.channelId || order.channel?.id, {
          orderId: order.id,
          warehouseId: amznWhId || undefined,
          weight: amznWeightPayload(),
          dimensions: amznDimsPayload(),
        })
        .then((r) => r.data),
    onSuccess: (data: any) => {
      const rates: any[] = Array.isArray(data?.rates) ? data.rates : [];
      setAmznRates(rates);
      setAmznServiceId('');
      setAmznResult(null);
      setAmznLabelUrl(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message || 'Could not fetch Amazon rates'),
  });

  const amznBuyMutation = useMutation({
    mutationFn: () => {
      const rate = (amznRates || []).find((r) => r.serviceId === amznServiceId);
      return channelApi
        .amazonMfnBuy(order.channelId || order.channel?.id, {
          orderId: order.id,
          warehouseId: amznWhId || undefined,
          shippingServiceId: amznServiceId,
          shippingServiceOfferId: rate?.serviceOfferId || undefined,
          weight: amznWeightPayload(),
          dimensions: amznDimsPayload(),
        })
        .then((r) => r.data);
    },
    onSuccess: (data: any) => {
      setAmznResult(data);
      let url: string | null = null;
      if (data?.label?.contentBase64) {
        try {
          const blob = new Blob(
            [Uint8Array.from(atob(data.label.contentBase64), (c) => c.charCodeAt(0))],
            { type: data.label.mime || 'application/pdf' },
          );
          url = URL.createObjectURL(blob);
        } catch { url = null; }
      }
      setAmznLabelUrl(url);
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Amazon shipping label purchased');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message || 'Could not buy Amazon label'),
  });

  if (isLoading) {
    return <DetailPageSkeleton />;
  }

  if (isError || !order) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p className="text-slate-500">Order not found.</p>
        <Link href="/orders" className="text-emerald-600 font-semibold hover:underline mt-3 inline-block">← Back to Orders</Link>
      </div>
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
  const isAmazonChannel = String(order.channel?.type || '').toUpperCase().includes('AMAZON');

  // ── Review state ────────────────────────────────────────────────────────────
  // (1) RTO approval gate — only meaningful before the order ships. A lingering
  //     needsApproval flag on a shipped/terminal order must not show as pending.
  const SHIPPED_OR_TERMINAL = ['SHIPPED', 'PARTIALLY_SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED', 'FAILED'];
  const needsReview = !!order.needsApproval && !SHIPPED_OR_TERMINAL.includes(String(order.status || '').toUpperCase());
  // (2) Buyer review request eligibility — delivered, or Amazon shipped 7+ days
  //     ago (Amazon has no "delivered" event; the API enforces the 5–30d window).
  const AMZ_SHIPPED_REVIEW_DAYS = 7;
  const shippedAgo = order.shippedAt || order.orderedAt;
  const reviewEligible = !!order.channelOrderId && !order.reviewRequestedAt && (
    order.status === 'DELIVERED' ||
    (order.status === 'SHIPPED' && isAmazonChannel && shippedAgo &&
      Date.now() - new Date(shippedAgo).getTime() >= AMZ_SHIPPED_REVIEW_DAYS * 86400000)
  );
  // AWB + label link surfaced right after a courier mints them.
  const generatedAwb = shipResult ? (shipResult.awbCode || shipResult.waybill || null) : null;
  const generatedLabelUrl = shipResult ? (shipResult.labelUrl || shipResult.label || shipResult.awbUrl || null) : null;

  // Order Summary totals — derived only from real data. Subtotal is the sum of
  // the line items; the grand total comes from the order itself. Optional
  // shipping/tax/discount rows render only when the order actually carries them.
  const subtotal = items.reduce((sum, it) => sum + Number(it.unitPrice ?? 0) * (it.qty ?? 0), 0);
  const shipping = typeof order.shippingCharges === 'number' ? order.shippingCharges : undefined;
  const tax = typeof order.taxAmount === 'number' ? order.taxAmount : undefined;
  const discount = typeof order.discount === 'number' ? order.discount : undefined;
  const grandTotal = typeof order.total === 'number' ? order.total : subtotal;

  return (
    <div className="space-y-5 animate-slide-up">
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

        {/* RTO review gate — high-risk order held for a human decision before
            fulfilment. Approve to clear it for shipping, or reject to cancel. */}
        {needsReview && (
          <Card className="p-5 border-rose-200 bg-rose-50/60">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <XCircle size={18} className="text-rose-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-extrabold text-rose-700">Needs your review before fulfilment</span>
                  {order.rtoRiskLevel && (
                    <Badge variant="rose" dot>RTO {order.rtoScore ?? 0}/100 · {order.rtoRiskLevel}</Badge>
                  )}
                </div>
                <p className="text-xs text-rose-600 font-medium mt-1">
                  Flagged as high return-to-origin risk. Approve to confirm and allow shipping, or reject to cancel the order.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Button size="sm" leftIcon={<CheckCircle2 size={14} />} loading={approveMutation.isPending} onClick={() => approveMutation.mutate()}>
                    Approve &amp; confirm
                  </Button>
                  <Button size="sm" variant="danger" leftIcon={<XCircle size={14} />} loading={rejectMutation.isPending}
                    onClick={async () => { if (await confirm({ title: 'Reject this order?', description: 'This cancels the order due to RTO risk. This cannot be undone.', variant: 'danger' })) rejectMutation.mutate(); }}>
                    Reject &amp; cancel
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Buyer review request — once delivered (or Amazon-shipped long enough
            ago) ask the marketplace to solicit a product review from the buyer. */}
        {(reviewEligible || order.reviewRequestedAt) && (
          <Card className="p-5">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <CheckCircle2 size={18} className="text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-800">Buyer review</div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {order.reviewRequestedAt
                    ? `Review requested ${new Date(order.reviewRequestedAt).toLocaleDateString()} — the channel sent the buyer a review solicitation.`
                    : 'Ask the marketplace to send this buyer a “Request a Review” message (Amazon allows this 5–30 days after delivery).'}
                </p>
                {order.reviewRequestError && !order.reviewRequestedAt && (
                  <p className="text-xs text-rose-600 mt-1">Last attempt: {order.reviewRequestError}</p>
                )}
              </div>
              {order.reviewRequestedAt ? (
                <Badge variant="emerald" dot>Requested</Badge>
              ) : (
                <Button size="sm" variant="outline" loading={requestReviewMutation.isPending} onClick={() => requestReviewMutation.mutate()}>
                  Request review
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Ship this order — self-fulfilled / manual orders. Preferred path:
            generate a real label via a connected logistics courier. Fallback:
            enter tracking manually / mark shipped. FBA orders (below) are
            managed by the marketplace and show a read-only info card instead. */}
        {editable ? (
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Truck size={15} className="text-emerald-600" />
              <span className="text-sm font-bold text-slate-800">Ship this order</span>
              <span className="text-xs text-slate-400">you fulfil this order</span>
            </div>

            {/* Preferred: generate a courier label */}
            {logisticsCouriers.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Ship size={14} className="text-emerald-600" />
                  <span className="text-sm font-bold text-slate-700">Generate a shipping label</span>
                  <Badge variant="emerald" dot>recommended</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Courier</label>
                    <Select
                      value={labelCourierId}
                      onChange={setLabelCourierId}
                      options={logisticsCouriers.map((c) => ({ value: c.id, label: c.name }))}
                      placeholder="Select courier…"
                      fullWidth
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Ship from</label>
                    <Select
                      value={shipFromId}
                      onChange={setShipFromId}
                      options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                      placeholder="Select warehouse…"
                      fullWidth
                    />
                  </div>
                  <Button
                    leftIcon={<Ship size={14} />}
                    loading={createShipmentMutation.isPending}
                    disabled={!labelCourierId}
                    onClick={() => createShipmentMutation.mutate()}
                  >
                    Generate label
                  </Button>
                </div>
                {generatedAwb && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10 px-3 py-2.5 text-sm">
                    <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                      <CheckCircle2 size={15} /> Label ready
                    </span>
                    <div>
                      <span className="text-slate-400">AWB</span>{' '}
                      <span className="font-mono text-slate-700">{generatedAwb}</span>
                      {shipResult?.courierName ? <span className="text-slate-400"> · {shipResult.courierName}</span> : null}
                    </div>
                    {generatedLabelUrl && (
                      <a
                        href={generatedLabelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold hover:underline"
                      >
                        <Printer size={14} /> Print label
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Connect a courier under <Link href="/channels" className="text-emerald-600 font-semibold hover:underline">Channels</Link> to generate labels here.
              </p>
            )}

            {/* Fallback: manual tracking / mark shipped */}
            <div className="pt-1">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">…or enter tracking manually</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
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
                  variant="secondary"
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
              <div className="mt-3">
                <Button
                  leftIcon={<PackageCheck size={14} />}
                  loading={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({
                    status: 'SHIPPED',
                    trackingNumber: trackingDraft || undefined,
                    courierName: courierDraft || undefined,
                  })}
                >
                  Mark as shipped
                </Button>
              </div>
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
        ) : (
          /* Channel-fulfilled (FBA) — read-only info card, no manual controls. */
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Store size={15} className="text-emerald-600" />
              <span className="text-sm font-bold text-slate-800">
                {isAmazonChannel ? 'Fulfilled by Amazon (FBA)' : `Fulfilled by ${order.channel?.name || 'channel'}`}
              </span>
              <Badge variant="violet" dot>no action needed</Badge>
            </div>
            <p className="text-sm text-slate-500">
              {isAmazonChannel ? 'Amazon' : (order.channel?.name || 'The channel')} picks, packs and ships this order automatically and reports tracking back — no action needed on your part.
            </p>
            {(order.trackingNumber || order.status) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-700/60 dark:bg-slate-800/40 px-3 py-2.5 text-sm">
                {order.trackingNumber ? (
                  <div>
                    <span className="text-slate-400">Tracking</span>{' '}
                    <span className="font-mono text-slate-700">{order.trackingNumber}</span>
                    {order.courierName ? <span className="text-slate-400"> · {order.courierName}</span> : null}
                  </div>
                ) : (
                  <span className="text-slate-400">Tracking not reported yet</span>
                )}
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${statusClass}`}>{order.status}</span>
              </div>
            )}
          </Card>
        )}

        {/* Amazon fulfilment (MCF) — only when an AMAZON_SMARTBIZ / AMAZON_FBA
            channel is connected. Lets the seller fulfil this order out of
            Amazon's warehouses, track it, and cancel it. */}
        {mcfChannel && (
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <PackageCheck size={15} className="text-emerald-600" />
              <span className="text-sm font-bold text-slate-800">Amazon fulfilment (MCF)</span>
              <Badge variant="violet" dot>{mcfChannel.name}</Badge>
            </div>
            <p className="text-xs text-slate-500">
              Fulfil this order from Amazon&apos;s warehouses via Multi-Channel Fulfilment. Amazon picks, packs, and ships it, then reports tracking back here.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                leftIcon={<PackageCheck size={14} />}
                loading={mcfFulfillMutation.isPending}
                onClick={handleMcfFulfill}
              >
                Fulfil via Amazon
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Navigation size={14} />}
                loading={mcfTrackMutation.isPending}
                onClick={() => mcfTrackMutation.mutate(order.orderNumber)}
              >
                Track
              </Button>
              <Button
                variant="danger"
                size="sm"
                leftIcon={<XCircle size={14} />}
                loading={mcfCancelMutation.isPending}
                onClick={handleMcfCancel}
              >
                Cancel
              </Button>
            </div>
            {mcfTracking && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Amazon status</span>
                <span className="font-semibold text-slate-700">{mcfTracking}</span>
              </div>
            )}
          </Card>
        )}

        {/* Buy shipping via Amazon (Merchant Fulfilment / Buy Shipping) — only
            for self-fulfilled (MFN) Amazon orders. The Amazon-preferred path:
            buy a partnered-carrier label that auto-confirms the shipment and
            keeps valid tracking for Prime & seller metrics. */}
        {order.fulfillmentType === 'SELF' && isAmazonChannel && (
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <PackageCheck size={15} className="text-emerald-600" />
              <span className="text-sm font-bold text-slate-800">Buy shipping via Amazon</span>
              <Badge variant="emerald" dot>Recommended</Badge>
            </div>
            <p className="text-xs text-slate-500">
              Amazon-partnered carrier label — auto-confirms the shipment and keeps valid tracking (best for Prime &amp; metrics).
            </p>

            {/* Package inputs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
              <div className="col-span-2 sm:col-span-3 lg:col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Ship from</label>
                <Select
                  value={amznWhId}
                  onChange={setAmznWhId}
                  options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                  placeholder="Select warehouse…"
                  fullWidth
                />
              </div>
              <Input
                id="amzn-weight"
                label="Weight (g)"
                type="number"
                min={1}
                value={amznWeight}
                onChange={(e) => setAmznWeight(e.target.value)}
              />
              <Input
                id="amzn-length"
                label="L (cm)"
                type="number"
                min={1}
                value={amznLength}
                onChange={(e) => setAmznLength(e.target.value)}
              />
              <Input
                id="amzn-width"
                label="W (cm)"
                type="number"
                min={1}
                value={amznWidth}
                onChange={(e) => setAmznWidth(e.target.value)}
              />
              <Input
                id="amzn-height"
                label="H (cm)"
                type="number"
                min={1}
                value={amznHeight}
                onChange={(e) => setAmznHeight(e.target.value)}
              />
            </div>

            <div>
              <Button
                leftIcon={<Truck size={14} />}
                loading={amznRatesMutation.isPending}
                onClick={() => amznRatesMutation.mutate()}
              >
                Get Amazon rates
              </Button>
            </div>

            {/* Rates list */}
            {amznRates !== null && (
              amznRates.length === 0 ? (
                <p className="text-sm text-slate-500">No eligible services — check the address/weight.</p>
              ) : (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Select a service</div>
                  {amznRates.map((r: any) => {
                    const rid = r.serviceId;
                    const active = amznServiceId === rid;
                    return (
                      <button
                        key={`${rid}-${r.serviceOfferId || ''}`}
                        type="button"
                        onClick={() => setAmznServiceId(rid)}
                        className={`w-full flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border px-3 py-2.5 text-sm text-left transition-colors ${
                          active
                            ? 'border-emerald-400 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/10'
                            : 'border-slate-200 dark:border-slate-700/60 hover:border-slate-300'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {active
                            ? <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                            : <span className="w-[15px] shrink-0" />}
                          <span className="font-semibold text-slate-800 truncate">{r.carrier || 'Carrier'}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-600 truncate">{r.name || 'Service'}</span>
                        </span>
                        <span className="flex items-center gap-3 shrink-0">
                          {r.estimatedDelivery && <span className="text-xs text-slate-400">ETA {r.estimatedDelivery}</span>}
                          <span className="font-bold text-slate-900 tabular-nums">
                            {r.amount != null ? `${r.amount} ${r.currency || ''}`.trim() : '—'}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  <div className="pt-1">
                    <Button
                      leftIcon={<PackageCheck size={14} />}
                      loading={amznBuyMutation.isPending}
                      disabled={!amznServiceId}
                      onClick={() => amznBuyMutation.mutate()}
                    >
                      Buy label
                    </Button>
                  </div>
                </div>
              )
            )}

            {/* Purchased label result */}
            {amznResult && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10 px-3 py-2.5 text-sm">
                <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <CheckCircle2 size={15} /> Label purchased
                </span>
                {amznResult.trackingId && (
                  <div>
                    <span className="text-slate-400">AWB</span>{' '}
                    <span className="font-mono text-slate-700">{amznResult.trackingId}</span>
                    {amznResult.carrier ? <span className="text-slate-400"> · {amznResult.carrier}</span> : null}
                    {amznResult.serviceName ? <span className="text-slate-400"> · {amznResult.serviceName}</span> : null}
                  </div>
                )}
                {amznLabelUrl ? (
                  <a
                    href={amznLabelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold hover:underline"
                  >
                    <Printer size={14} /> Print / download label
                  </a>
                ) : (
                  <span className="text-slate-400">Label document not returned — tracking is confirmed above.</span>
                )}
              </div>
            )}
          </Card>
        )}

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

        {confirmUi}
    </div>
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
