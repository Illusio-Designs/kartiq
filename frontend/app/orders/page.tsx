'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { orderApi, customerApi, channelApi } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import {
  Button, Badge, Card, Modal, Input, Textarea, Select, Pagination, Tooltip, Loader, Tabs, EmptyState, DatePicker, Checkbox,
} from '@/components/ui';
import { AlertTriangle, CheckCircle2, Package, Plus, Star, Trash2, XCircle, Zap, Hand, Layers, ShoppingBag, Plug, RefreshCw, Download, SlidersHorizontal, ArrowUp, ArrowDown, ChevronsUpDown, Eye, Pencil, Lock, Truck, Info } from 'lucide-react';
import { toast } from '@/store/toast.store';
import Link from 'next/link';

// Deterministic avatar colour + initials for a customer name.
const AVATAR_COLORS = ['#08b5a6', '#2563eb', '#7c3aed', '#e11d48', '#0e9f6e', '#b45309'];
function avatarColor(name: string): string {
  let sum = 0;
  for (const c of name) sum += c.charCodeAt(0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
function initials(name: string): string {
  return (name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}
// A channel order that has landed with no total yet — Amazon reports no order
// total while an order is still Pending; it backfills on the next sync.
function isAwaitingTotal(o: any): boolean {
  return (!o.total || Number(o.total) === 0) && (o.status === 'PENDING' || o.dataCompleteness === 'PARTIAL' || o.dataCompleteness === 'MINIMAL') && !!o.channelOrderId;
}

// Local-date → YYYY-MM-DD (the shape the orders API expects). Uses local
// getFullYear/Month/Date, not toISOString, so a date never shifts a day across
// timezones.
function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Configurable order-table columns. The leading row number and trailing
// actions column are fixed; everything here can be sorted, hidden, and
// exported. `sort` supplies a comparable value; `csv` the export cell text.
const ORDER_COLUMNS: { key: string; label: string; sortable?: boolean }[] = [
  { key: 'order',       label: 'Order #',     sortable: true },
  { key: 'customer',    label: 'Customer',    sortable: true },
  { key: 'channel',     label: 'Channel',     sortable: true },
  { key: 'fulfillment', label: 'Fulfillment' },
  { key: 'total',       label: 'Total',       sortable: true },
  { key: 'rto',         label: 'RTO',         sortable: true },
  { key: 'status',      label: 'Status',      sortable: true },
  { key: 'date',        label: 'Date',        sortable: true },
];
const ORDER_SORT: Record<string, (o: any) => string | number> = {
  order:    (o) => (o.channelOrderId || o.orderNumber || '').toLowerCase(),
  customer: (o) => (o.customer?.name || '').toLowerCase(),
  channel:  (o) => (o.channel?.name || '').toLowerCase(),
  total:    (o) => Number(o.total || 0),
  rto:      (o) => Number(o.rtoScore || 0),
  status:   (o) => (o.status || '').toLowerCase(),
  date:     (o) => Date.parse(o.createdAt || '') || 0,
};
const ORDER_CSV: Record<string, (o: any) => string> = {
  order:       (o) => o.channelOrderId || o.orderNumber || '',
  customer:    (o) => o.customer?.name || '',
  channel:     (o) => o.channel?.name || '',
  fulfillment: (o) => o.fulfillmentType || '',
  total:       (o) => String(o.total ?? ''),
  rto:         (o) => (o.rtoRiskLevel ? `${o.rtoScore ?? 0} ${o.rtoRiskLevel}` : ''),
  status:      (o) => o.status || '',
  date:        (o) => (o.createdAt ? new Date(o.createdAt).toISOString() : ''),
};
const ORDER_COLS_LS_KEY = 'kartriq-orders-hidden-cols';

const STATUSES = [
  { value: '',           label: 'All Statuses' },
  { value: 'PENDING',    label: 'Pending' },
  { value: 'CONFIRMED',  label: 'Confirmed' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'SHIPPED',    label: 'Shipped' },
  { value: 'DELIVERED',  label: 'Delivered' },
  { value: 'CANCELLED',  label: 'Cancelled' },
];

// Statuses a seller can set on an editable (MFN / manual) order.
const EDIT_STATUSES = [
  { value: 'PENDING',    label: 'Pending' },
  { value: 'CONFIRMED',  label: 'Confirmed' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'SHIPPED',    label: 'Shipped' },
  { value: 'DELIVERED',  label: 'Delivered' },
  { value: 'CANCELLED',  label: 'Cancelled' },
];

const RISK_FILTERS = [
  { value: '',        label: 'All Risk' },
  { value: 'LOW',     label: 'Low' },
  { value: 'MEDIUM',  label: 'Medium' },
  { value: 'HIGH',    label: 'High' },
  { value: 'APPROVAL',label: 'Needs approval' },
];

const riskVariant = (l?: string) => {
  if (l === 'HIGH') return 'rose' as const;
  if (l === 'MEDIUM') return 'amber' as const;
  if (l === 'LOW') return 'emerald' as const;
  return 'slate' as const;
};

type FulfillmentTab = 'all' | 'auto' | 'manual';
const FULFILLMENT_PARAM: Record<FulfillmentTab, string | undefined> = {
  all: undefined,
  auto: 'CHANNEL,DROPSHIP',
  manual: 'SELF',
};

export default function OrdersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState('');
  const [risk, setRisk] = useState('');
  const [fulfillmentTab, setFulfillmentTab] = useState<FulfillmentTab>('all');
  const [reviewResult, setReviewResult] = useState<{ id: string; type: 'success' | 'error'; message: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Sorting (client-side, over the loaded page) + column visibility.
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);
  // Per-order quick-edit slide-over (shared Modal renders as a right drawer).
  const [editOrder, setEditOrder] = useState<any | null>(null);
  const [editStatus, setEditStatus] = useState('PENDING');
  const [editTracking, setEditTracking] = useState('');
  const [editCourier, setEditCourier] = useState('');
  const [noteDismissed, setNoteDismissed] = useState(false);
  useEffect(() => {
    try { setNoteDismissed(localStorage.getItem('kartriq-orders-zero-note') === '1'); } catch { /* ignore */ }
  }, []);
  const openEdit = (o: any) => {
    setEditOrder(o);
    setEditStatus(o.status || 'PENDING');
    setEditTracking(o.trackingNumber || o.awb || '');
    setEditCourier(o.courierName || '');
  };
  const editStatusMutation = useMutation({
    mutationFn: (body: { status: string; trackingNumber?: string; courierName?: string }) =>
      orderApi.updateStatus(editOrder.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      setEditOrder(null);
      toast.success('Order updated');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message || 'Failed to update order'),
  });

  // Restore hidden columns from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ORDER_COLS_LS_KEY);
      if (raw) setHiddenCols(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, []);
  const persistHidden = (next: Set<string>) => {
    setHiddenCols(next);
    try { localStorage.setItem(ORDER_COLS_LS_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  };
  const toggleCol = (key: string) => {
    const next = new Set(hiddenCols);
    next.has(key) ? next.delete(key) : next.add(key);
    persistHidden(next);
  };
  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };
  // Close the columns popover on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const visibleColumns = ORDER_COLUMNS.filter((c) => !hiddenCols.has(c.key));

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, pageSize, status, risk, fulfillmentTab, dateFrom, dateTo],
    queryFn: () => orderApi.list({
      page,
      limit: pageSize,
      status: status || undefined,
      risk: risk && risk !== 'APPROVAL' ? risk : undefined,
      needsApproval: risk === 'APPROVAL' ? 'true' : undefined,
      fulfillment: FULFILLMENT_PARAM[fulfillmentTab],
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }).then(r => r.data),
  });

  // Topbar global search — filters the visible orders by order number,
  // customer name/email/phone, channel order id and status.
  const filteredOrders = useFilteredBySearch(data?.orders, (o: any) =>
    `${o.orderNumber || ''} ${o.channelOrderId || ''} ${o.customer?.name || ''} ${o.customer?.email || ''} ${o.customer?.phone || ''} ${o.status || ''}`
  );

  // Client-side sort of the loaded page (server already paginates/filters).
  const sortedOrders = useMemo(() => {
    if (!sortKey || !ORDER_SORT[sortKey]) return filteredOrders;
    const accessor = ORDER_SORT[sortKey];
    const arr = [...filteredOrders];
    arr.sort((a, b) => {
      const x = accessor(a); const y = accessor(b);
      if (x < y) return sortDir === 'asc' ? -1 : 1;
      if (x > y) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredOrders, sortKey, sortDir]);

  // Export the currently visible rows/columns to CSV.
  const exportCsv = () => {
    const cols = ORDER_COLUMNS.filter((c) => !hiddenCols.has(c.key));
    const escape = (v: string) => `"${String(v).replaceAll('"', '""')}"`;
    const header = cols.map((c) => escape(c.label)).join(',');
    const lines = sortedOrders.map((o: any) => cols.map((c) => escape(ORDER_CSV[c.key]?.(o) ?? '')).join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${sortedOrders.length} order${sortedOrders.length !== 1 ? 's' : ''}`);
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => orderApi.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => orderApi.reject(id, 'High RTO risk'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });

  // Pull the latest orders from every connected channel.
  const { data: channelsData } = useQuery({
    queryKey: ['channels'],
    queryFn: () => channelApi.list().then((r) => r.data),
  });
  const channels: any[] = Array.isArray(channelsData) ? channelsData : (channelsData?.channels || []);
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!channels.length) throw new Error('No channels connected yet');
      const results = await Promise.allSettled(channels.map((c) => channelApi.syncOrders(c.id)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      return { ok, failed: results.length - ok };
    },
    onSuccess: ({ ok, failed }) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success(`Synced ${ok} channel${ok !== 1 ? 's' : ''}${failed ? `, ${failed} failed` : ''}`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message),
  });

  const reviewMutation = useMutation({
    mutationFn: (id: string) => orderApi.requestReview(id),
    onSuccess: (res, id) => {
      setReviewResult({ id, type: 'success', message: res.data.alreadyRequested ? 'Review already requested' : 'Review request sent to channel' });
      setTimeout(() => setReviewResult(null), 4000);
    },
    onError: (err: any, id) => {
      setReviewResult({ id, type: 'error', message: err.response?.data?.error || err.message });
      setTimeout(() => setReviewResult(null), 4000);
    },
  });

  // Render a single configurable column's cell for an order row.
  const renderCell = (o: any, key: string) => {
    switch (key) {
      case 'order':
        return (
          <td key={key} className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Link href={`/orders/${o.id}`} className="font-semibold text-emerald-600 hover:underline">{o.channelOrderId || o.orderNumber}</Link>
              <Badge variant={o.channelOrderId ? 'blue' : 'slate'}>{o.channelOrderId ? 'Auto' : 'Manual'}</Badge>
            </div>
            {o.channelOrderId && <div className="text-[11px] text-slate-400 font-mono">{o.orderNumber}</div>}
          </td>
        );
      case 'customer':
        return (
          <td key={key} className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                style={{ background: avatarColor(o.customer?.name || '?') }}
              >
                {initials(o.customer?.name || '?')}
              </span>
              <span className="text-slate-700 truncate max-w-[170px]">{o.customer?.name || '—'}</span>
            </div>
          </td>
        );
      case 'channel':
        return <td key={key} className="px-3 py-2.5 text-slate-500">{o.channel?.name}</td>;
      case 'fulfillment':
        return (
          <td key={key} className="px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Badge variant={o.fulfillmentType === 'CHANNEL' ? 'violet' : o.fulfillmentType === 'DROPSHIP' ? 'amber' : 'blue'} dot>
                {(() => {
                  const isAmazon = String(o.channel?.type || '').toUpperCase().includes('AMAZON');
                  if (o.fulfillmentType === 'CHANNEL') return isAmazon ? 'FBA' : 'Channel';
                  if (o.fulfillmentType === 'DROPSHIP') return 'Dropship';
                  return isAmazon ? 'MFN' : 'Self';
                })()}
              </Badge>
              {o.dataCompleteness && o.dataCompleteness !== 'COMPLETE' && !isAwaitingTotal(o) ? (
                <Tooltip content={`Missing: ${(o.missingFields || []).join(', ') || 'data'}`}>
                  <span>
                    <Badge variant={o.dataCompleteness === 'MINIMAL' ? 'rose' : 'amber'}>{o.dataCompleteness}</Badge>
                  </span>
                </Tooltip>
              ) : null}
            </div>
          </td>
        );
      case 'total':
        return (
          <td key={key} className="px-3 py-2.5">
            {isAwaitingTotal(o) ? (
              <div>
                <span className="font-semibold text-slate-400">{formatCurrency(0)}</span>
                <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 mt-0.5">
                  <span className="w-1 h-1 rounded-full bg-amber-500" /> awaiting Amazon
                </div>
              </div>
            ) : (
              <span className="font-bold text-slate-900">{formatCurrency(o.total)}</span>
            )}
          </td>
        );
      case 'rto':
        return (
          <td key={key} className="px-3 py-2.5">
            {o.rtoRiskLevel ? (
              <Tooltip content={`RTO Score: ${o.rtoScore}/100 · ${o.rtoRiskLevel}`}>
                <span><Badge variant={riskVariant(o.rtoRiskLevel)} dot>{o.rtoScore ?? 0} {o.rtoRiskLevel}</Badge></span>
              </Tooltip>
            ) : <span className="text-slate-400 text-xs">—</span>}
          </td>
        );
      case 'status':
        return (
          <td key={key} className="px-3 py-2.5">
            {o.needsApproval ? (
              <Badge variant="rose" dot>NEEDS REVIEW</Badge>
            ) : (
              <Badge variant={o.status === 'DELIVERED' ? 'emerald' : o.status === 'CANCELLED' ? 'rose' : 'slate'}>{o.status}</Badge>
            )}
          </td>
        );
      case 'date':
        return <td key={key} className="px-3 py-2.5 text-slate-400 text-xs whitespace-nowrap">{formatDateTime(o.createdAt)}</td>;
      default:
        return <td key={key} className="px-3 py-2.5 text-slate-400">—</td>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent tracking-tight">Orders</h1>
            <p className="text-sm text-slate-500 mt-1">{data?.total || 0} total orders</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              leftIcon={<RefreshCw size={15} />}
              loading={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              Sync
            </Button>
            <Button leftIcon={<Plus size={15} />} onClick={() => setModalOpen(true)}>
              New Order
            </Button>
          </div>
        </div>

        {/* Fulfillment tabs */}
        <Tabs<FulfillmentTab>
          value={fulfillmentTab}
          onChange={(k) => { setFulfillmentTab(k); setPage(1); }}
          items={[
            { key: 'all',    label: 'All Orders',    icon: <Layers size={14} /> },
            { key: 'auto',   label: 'Auto Fulfill',  icon: <Zap size={14} /> },
            { key: 'manual', label: 'Manual',        icon: <Hand size={14} /> },
          ]}
        />

        {/* Filters */}
        <div className="flex gap-3 flex-wrap items-end">
          <Select value={status} onChange={setStatus} options={STATUSES} placeholder="All Statuses" />
          <Select value={risk} onChange={setRisk} options={RISK_FILTERS} placeholder="All Risk" />
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">From</label>
            <DatePicker
              value={dateFrom ? new Date(dateFrom) : null}
              maxDate={dateTo ? new Date(dateTo) : undefined}
              placeholder="Start date"
              onChange={(d) => { setDateFrom(toYMD(d)); setPage(1); }}
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">To</label>
            <DatePicker
              value={dateTo ? new Date(dateTo) : null}
              minDate={dateFrom ? new Date(dateFrom) : undefined}
              placeholder="End date"
              onChange={(d) => { setDateTo(toYMD(d)); setPage(1); }}
            />
          </div>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}>
              Clear dates
            </Button>
          )}

          {/* Table tools — column manager + CSV export */}
          <div className="ml-auto flex items-end gap-2">
            <div className="relative" ref={colsRef}>
              <Button variant="outline" size="sm" leftIcon={<SlidersHorizontal size={14} />} onClick={() => setColsOpen((v) => !v)}>
                Columns
              </Button>
              {colsOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-900/10 p-2 z-50 animate-slide-up">
                  <div className="px-1.5 pb-1.5 mb-1 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Show columns</div>
                  <div className="space-y-1 px-1.5 py-1">
                    {ORDER_COLUMNS.map((c) => (
                      <Checkbox
                        key={c.key}
                        checked={!hiddenCols.has(c.key)}
                        onCheckedChange={() => toggleCol(c.key)}
                        label={c.label}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" leftIcon={<Download size={14} />} onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
        </div>

        {/* Needs-approval banner */}
        {(data?.orders || []).some((o: any) => o.needsApproval) && risk !== 'APPROVAL' && (
          <button
            onClick={() => setRisk('APPROVAL')}
            className="w-full flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4 hover:bg-rose-100 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
              <AlertTriangle size={18} className="text-rose-600" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-extrabold text-rose-700">
                {(data?.orders || []).filter((o: any) => o.needsApproval).length} order(s) need your review
              </div>
              <div className="text-xs text-rose-600 font-medium">
                High RTO risk — click to review and approve or reject
              </div>
            </div>
          </button>
        )}

        {reviewResult && (
          <div className={`flex items-start gap-2 rounded-xl p-3 text-sm border ${
            reviewResult.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {reviewResult.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            <span>{reviewResult.message}</span>
          </div>
        )}

        {/* ₹0.00 explainer — shown while any loaded order is still awaiting its
            total from the channel. Dismissal is remembered per browser. */}
        {!noteDismissed && (data?.orders || []).some((o: any) => isAwaitingTotal(o)) && (
          <div className="flex items-start gap-2.5 rounded-xl p-3 text-sm border bg-amber-50 border-amber-200 text-amber-800">
            <Info size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <span className="font-bold">Some orders show ₹0.00.</span> Amazon doesn&apos;t report an order total while an order is still <span className="font-semibold">Pending</span> — the amount (and the <span className="font-semibold">PARTIAL</span> flag) fill in automatically on the next sync.
            </div>
            <button
              onClick={() => { setNoteDismissed(true); try { localStorage.setItem('kartriq-orders-zero-note', '1'); } catch { /* ignore */ } }}
              className="p-0.5 hover:bg-amber-100 rounded text-amber-700"
              aria-label="Dismiss"
            >
              <XCircle size={15} />
            </button>
          </div>
        )}

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="px-3 py-2.5 font-bold">#</th>
                  {visibleColumns.map((c) => (
                    <th key={c.key} className="px-3 py-2.5 font-bold">
                      {c.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className="inline-flex items-center gap-1 hover:text-slate-600 uppercase tracking-widest"
                        >
                          {c.label}
                          {sortKey === c.key
                            ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
                            : <ChevronsUpDown size={11} className="text-slate-300" />}
                        </button>
                      ) : c.label}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 font-bold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={visibleColumns.length + 2}><Loader size="sm" /></td></tr>
                ) : sortedOrders.length ? sortedOrders.map((o: any, idx: number) => (
                  <tr key={o.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-2.5 text-slate-500 font-semibold">{(page - 1) * pageSize + idx + 1}</td>
                    {visibleColumns.map((c) => renderCell(o, c.key))}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {o.needsApproval && (
                          <>
                            <Tooltip content="Approve order">
                              <Button variant="outline" size="icon" onClick={() => approveMutation.mutate(o.id)} disabled={approveMutation.isPending}>
                                <CheckCircle2 size={13} />
                              </Button>
                            </Tooltip>
                            <Tooltip content="Reject order">
                              <Button variant="danger" size="icon" onClick={() => rejectMutation.mutate(o.id)} disabled={rejectMutation.isPending}>
                                <XCircle size={13} />
                              </Button>
                            </Tooltip>
                          </>
                        )}
                        {o.status === 'DELIVERED' && (
                          <Tooltip content={o.reviewRequestedAt ? `Requested on ${new Date(o.reviewRequestedAt).toLocaleDateString()}` : 'Request product review'}>
                            <Button variant="secondary" size="icon" onClick={() => reviewMutation.mutate(o.id)} disabled={reviewMutation.isPending || !!o.reviewRequestedAt}>
                              <Star size={13} />
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip content="View order">
                          <Link href={`/orders/${o.id}`}>
                            <Button variant="outline" size="icon"><Eye size={13} /></Button>
                          </Link>
                        </Tooltip>
                        {o.fulfillmentType === 'CHANNEL' ? (
                          <Tooltip content="Fulfilled by Amazon — managed by the channel">
                            <span><Button variant="outline" size="icon" disabled><Lock size={13} /></Button></span>
                          </Tooltip>
                        ) : (
                          <Tooltip content="Edit fulfillment">
                            <Button variant="outline" size="icon" onClick={() => openEdit(o)}><Pencil size={13} /></Button>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={visibleColumns.length + 2} className="p-0">
                      <EmptyState
                        icon={<ShoppingBag size={28} />}
                        iconBg="bg-emerald-50 text-emerald-600"
                        title="No orders yet"
                        description="Orders flow in automatically from connected channels (Amazon, Shopify, Flipkart…). You can also create one manually for offline / B2B sales."
                        action={
                          <Link href="/channels">
                            <Button leftIcon={<Plug size={14} />}>Connect a channel</Button>
                          </Link>
                        }
                        secondaryAction={
                          <Button variant="ghost" size="sm" leftIcon={<Plus size={12} />} onClick={() => setModalOpen(true)}>
                            Create manually
                          </Button>
                        }
                        decorative
                        size="lg"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="md:hidden divide-y divide-slate-100">
            {(data?.orders || []).map((o: any) => (
              <Link key={o.id} href={`/orders/${o.id}`} className="flex items-center gap-3 p-4 hover:bg-slate-50/70 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Package size={15} className="text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-sm truncate">{o.channelOrderId || o.orderNumber}</div>
                  <div className="text-xs text-slate-500 truncate">{o.customer?.name} · {o.channel?.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-900">{formatCurrency(o.total)}</div>
                  <Badge variant={o.status === 'DELIVERED' ? 'emerald' : 'slate'} className="mt-1">{o.status}</Badge>
                </div>
              </Link>
            ))}
          </div>

          {(data?.total || 0) > pageSize && (
            <div className="border-t border-slate-100">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={data?.total || 0}
                onPageChange={setPage}
                onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
              />
            </div>
          )}
        </Card>
      </div>

      <NewOrderModal open={modalOpen} onClose={() => setModalOpen(false)} />

      {/* Per-order quick-edit slide-over. MFN / manual orders are editable;
          FBA orders are read-only (Amazon manages fulfillment). */}
      <Modal
        open={!!editOrder}
        onClose={() => setEditOrder(null)}
        title={editOrder ? (editOrder.channelOrderId || editOrder.orderNumber) : 'Order'}
        description={editOrder?.customer?.name ? `${editOrder.customer.name} · ${editOrder.channel?.name || 'Order'}` : undefined}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOrder(null)}>Close</Button>
            {editOrder && editOrder.fulfillmentType !== 'CHANNEL' && (
              <Button
                loading={editStatusMutation.isPending}
                onClick={() => editStatusMutation.mutate({
                  status: editStatus,
                  trackingNumber: editTracking || undefined,
                  courierName: editCourier || undefined,
                })}
              >
                Save changes
              </Button>
            )}
          </>
        }
      >
        {editOrder && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={editOrder.fulfillmentType === 'CHANNEL' ? 'violet' : editOrder.fulfillmentType === 'DROPSHIP' ? 'amber' : 'blue'} dot>
                {(() => {
                  const isAmazon = String(editOrder.channel?.type || '').toUpperCase().includes('AMAZON');
                  if (editOrder.fulfillmentType === 'CHANNEL') return isAmazon ? 'Fulfilled by Amazon (FBA)' : 'Fulfilled by channel';
                  if (editOrder.fulfillmentType === 'DROPSHIP') return 'Dropship';
                  return isAmazon ? 'Self-fulfilled (MFN)' : 'Self-fulfilled';
                })()}
              </Badge>
              <Badge variant={editOrder.status === 'DELIVERED' ? 'emerald' : editOrder.status === 'CANCELLED' ? 'rose' : 'slate'}>{editOrder.status}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">{formatCurrency(editOrder.total || 0)}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ordered</div>
                <div className="text-sm font-semibold text-slate-700 mt-0.5">{editOrder.orderedAt || editOrder.createdAt ? formatDateTime(editOrder.orderedAt || editOrder.createdAt) : '—'}</div>
              </div>
            </div>

            {editOrder.fulfillmentType === 'CHANNEL' ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">
                <Truck size={16} className="text-violet-600 mt-0.5 flex-shrink-0" />
                <div><span className="font-bold">Fulfilled by Amazon.</span> Stock and shipping are handled by Amazon, so this order is read-only in Kartriq — its status and tracking sync in automatically.</div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <Truck size={15} className="text-emerald-600" /> Update fulfillment
                  <span className="text-xs font-normal text-slate-400">you ship this order</span>
                </div>
                <Select label="Status" value={editStatus} onChange={setEditStatus} options={EDIT_STATUSES} fullWidth />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Tracking number" value={editTracking} onChange={(e) => setEditTracking(e.target.value)} placeholder="e.g. 1Z999AA10123" />
                  <Input label="Courier" value={editCourier} onChange={(e) => setEditCourier(e.target.value)} placeholder="e.g. Delhivery" />
                </div>
                {editOrder.channelOrderId && editOrder.fulfillmentType === 'SELF' && (
                  <p className="text-xs text-slate-500">Marking this shipped with a tracking number confirms the shipment back to {editOrder.channel?.name || 'the channel'} so the buyer sees tracking.</p>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// New Order Modal
// ═══════════════════════════════════════════════════════════════════════════
interface OrderItem {
  id: string;
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
}

function NewOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItem[]>([
    { id: '1', name: '', sku: '', qty: 1, unitPrice: 0 },
  ]);
  const [error, setError] = useState('');

  const { data: customers } = useQuery({
    queryKey: ['customers-list'],
    queryFn: () => customerApi.list().then(r => r.data),
    enabled: open,
  });
  const { data: channels } = useQuery({
    queryKey: ['channels-list'],
    queryFn: () => channelApi.list().then(r => r.data),
    enabled: open,
  });

  const customerOptions = (customers?.customers || customers || []).map((c: any) => ({
    value: c.id, label: c.name,
  }));
  const channelOptions = (channels || []).map((c: any) => ({
    value: c.id, label: c.name,
  }));

  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  const createMutation = useMutation({
    mutationFn: () => orderApi.create({
      customerId,
      channelId,
      notes,
      items: items.filter(i => i.name && i.qty > 0).map(i => ({
        name: i.name, sku: i.sku, qty: i.qty, unitPrice: i.unitPrice,
        total: i.qty * i.unitPrice,
      })),
      subtotal, total: subtotal,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      reset();
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });

  const reset = () => {
    setCustomerId(''); setChannelId(''); setNotes(''); setError('');
    setItems([{ id: '1', name: '', sku: '', qty: 1, unitPrice: 0 }]);
  };

  const updateItem = (id: string, patch: Partial<OrderItem>) => {
    setItems(items.map(i => i.id === id ? { ...i, ...patch } : i));
  };

  const addItem = () => {
    setItems([...items, { id: String(Date.now()), name: '', sku: '', qty: 1, unitPrice: 0 }]);
  };

  const removeItem = (id: string) => {
    if (items.length === 1) return;
    setItems(items.filter(i => i.id !== id));
  };

  return (
    <Modal
      open={open}
      onClose={() => { onClose(); reset(); }}
      title="Create New Order"
      description="Manually enter a new order — items, customer, and channel"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => { onClose(); reset(); }}>Cancel</Button>
          <Button
            onClick={() => { setError(''); createMutation.mutate(); }}
            loading={createMutation.isPending}
            disabled={!customerId || !channelId || items.every(i => !i.name)}
          >
            Create Order
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            label="Customer"
            value={customerId}
            onChange={setCustomerId}
            options={customerOptions}
            placeholder="Select customer…"
            fullWidth
          />
          <Select
            label="Channel"
            value={channelId}
            onChange={setChannelId}
            options={channelOptions}
            placeholder="Select channel…"
            fullWidth
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Items</label>
            <Button variant="ghost" size="sm" leftIcon={<Plus size={12} />} onClick={addItem}>
              Add item
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={item.id} className="grid grid-cols-12 gap-2 p-3 bg-slate-50 rounded-xl items-center">
                <div className="col-span-12 md:col-span-4">
                  <Input
                    value={item.name}
                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                    placeholder="Product name"
                  />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Input
                    value={item.sku}
                    onChange={(e) => updateItem(item.id, { sku: e.target.value })}
                    placeholder="SKU"
                  />
                </div>
                <div className="col-span-3 md:col-span-2">
                  <Input
                    type="number"
                    value={item.qty}
                    onChange={(e) => updateItem(item.id, { qty: Number(e.target.value) })}
                    placeholder="Qty"
                  />
                </div>
                <div className="col-span-3 md:col-span-2">
                  <Input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(item.id, { unitPrice: Number(e.target.value) })}
                    placeholder="Price"
                  />
                </div>
                <div className="col-span-12 md:col-span-1 flex items-center justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(item.id)}
                    disabled={items.length === 1}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Special instructions, internal notes…"
          rows={3}
        />

        <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl">
          <span className="text-sm font-bold text-slate-700">Subtotal</span>
          <span className="text-xl font-bold text-emerald-700">{formatCurrency(subtotal)}</span>
        </div>

        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}
