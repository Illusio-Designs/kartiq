'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { orderApi, channelApi } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import { TableRowsSkeleton, ShimmerTheme, Skeleton } from '@/components/Shimmer';
import {
  Button, Badge, Card, Modal, Input, Select, Pagination, Tooltip, Tabs, EmptyState, Checkbox,
  SearchField, DateRangePicker, Popover, BulkActionBar, DensityToggle, Dropdown, useConfirm,
} from '@/components/ui';
import type { Density } from '@/components/ui';
import { AlertTriangle, CheckCircle2, Star, Trash2, XCircle, Zap, Hand, Layers, ShoppingBag, Plug, RefreshCw, Download, SlidersHorizontal, ArrowUp, ArrowDown, ChevronsUpDown, Eye, Pencil, Lock, Truck, Info, ListFilter, ArrowUpDown, Bookmark, X } from 'lucide-react';
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

// Whether we can ask the channel to request a buyer review. Delivered orders
// always qualify; Amazon has no "delivered" event, so an Amazon order shipped
// at least this many days ago qualifies too (the Solicitations API enforces the
// real 5–30 day window). Mirrors backend review.service.isReviewEligible.
const AMZ_SHIPPED_REVIEW_DAYS = 7;
function reviewEligible(o: any): boolean {
  if (!o.channelOrderId || o.reviewRequestedAt) return false;
  if (o.status === 'DELIVERED') return true;
  if (o.status === 'SHIPPED' && String(o.channel?.type || '').toUpperCase().includes('AMAZON')) {
    const shipped = o.shippedAt || o.orderedAt;
    if (shipped && Date.now() - new Date(shipped).getTime() >= AMZ_SHIPPED_REVIEW_DAYS * 86400000) return true;
  }
  return false;
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

// Colour the order-status badge by its lifecycle stage instead of leaving
// everything but DELIVERED/CANCELLED grey.
const orderStatusVariant = (s?: string): 'emerald' | 'blue' | 'violet' | 'amber' | 'rose' | 'slate' => {
  switch (String(s || '').toUpperCase()) {
    case 'DELIVERED': return 'emerald';
    case 'SHIPPED':
    case 'PARTIALLY_SHIPPED':
    case 'OUT_FOR_DELIVERY': return 'blue';
    case 'PROCESSING':
    case 'CONFIRMED':
    case 'PACKED': return 'violet';
    case 'PENDING':
    case 'UNSHIPPED':
    case 'ON_HOLD': return 'amber';
    case 'CANCELLED':
    case 'RETURNED':
    case 'REFUNDED':
    case 'FAILED': return 'rose';
    default: return 'slate';
  }
};

// The RTO "NEEDS REVIEW" gate only applies before an order is fulfilled. Once
// it ships (or reaches any terminal state) the review is moot, so a lingering
// `needsApproval` flag must NOT mask the real status in the table.
const SHIPPED_OR_TERMINAL = new Set([
  'SHIPPED', 'PARTIALLY_SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED',
  'CANCELLED', 'RETURNED', 'REFUNDED', 'FAILED',
]);
const showsNeedsReview = (o: any): boolean =>
  !!o.needsApproval && !SHIPPED_OR_TERMINAL.has(String(o.status || '').toUpperCase());

// Order tabs split by WHO FULFILS the order — the work you do vs the work the
// channel does:
//   Auto   = channel-fulfilled (Amazon FBA / dropship) — hands-off, no action.
//   Manual = self-fulfilled (Amazon MFN) + orders you create here — you ship
//            them, so they live where you manage fulfilment.
// This maps to the backend `fulfillment` filter (CHANNEL/SELF/DROPSHIP).
type OrderTab = 'all' | 'auto' | 'manual';
const TAB_FULFILLMENT: Record<OrderTab, string | undefined> = {
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
  // Seed the channel filter from ?channelId= so deep links (e.g. from a channel
  // page's "View orders" link) land pre-filtered.
  const [channelId, setChannelId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('channelId') || '';
  });
  const [tab, setTab] = useState<OrderTab>('all');
  const [reviewResult, setReviewResult] = useState<{ id: string; type: 'success' | 'error'; message: string } | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Sorting (client-side, over the loaded page) + column visibility.
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  // Per-order quick-edit slide-over (shared Modal renders as a right drawer).
  const [editOrder, setEditOrder] = useState<any | null>(null);
  const [editStatus, setEditStatus] = useState('PENDING');
  const [editTracking, setEditTracking] = useState('');
  const [editCourier, setEditCourier] = useState('');
  const [noteDismissed, setNoteDismissed] = useState(false);
  // In-table search (distinct from the global topbar search), row selection for
  // bulk actions, and row density.
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [density, setDensity] = useState<Density>('compact');
  const [bulkPending, setBulkPending] = useState(false);
  const [confirmUi, confirm] = useConfirm();
  useEffect(() => {
    try { setNoteDismissed(localStorage.getItem('kartriq-orders-zero-note') === '1'); } catch { /* ignore */ }
    try { const d = localStorage.getItem('kartriq-orders-density'); if (d === 'compact' || d === 'comfortable') setDensity(d); } catch { /* ignore */ }
  }, []);
  const changeDensity = (d: Density) => {
    setDensity(d);
    try { localStorage.setItem('kartriq-orders-density', d); } catch { /* ignore */ }
  };
  const openEdit = (o: any) => {
    setEditOrder(o);
    setEditStatus(o.status || 'PENDING');
    setEditTracking(o.trackingNumber || '');
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
  const visibleColumns = ORDER_COLUMNS.filter((c) => !hiddenCols.has(c.key));

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, pageSize, status, risk, channelId, tab, dateFrom, dateTo],
    queryFn: () => orderApi.list({
      page,
      limit: pageSize,
      status: status || undefined,
      risk: risk && risk !== 'APPROVAL' ? risk : undefined,
      needsApproval: risk === 'APPROVAL' ? 'true' : undefined,
      // Server-side channel filter — the orders controller accepts `channelId`.
      channelId: channelId || undefined,
      fulfillment: TAB_FULFILLMENT[tab],
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }).then(r => r.data),
  });

  // Connected channels — powers the channel filter, per-channel sync menu,
  // and the all-channels "Sync now" fan-out.
  const { data: channelsData } = useQuery({
    queryKey: ['channels'],
    queryFn: () => channelApi.list().then((r) => r.data),
  });
  const channels: any[] = Array.isArray(channelsData) ? channelsData : (channelsData?.channels || []);

  // Topbar global search — filters the visible orders by order number,
  // customer name/email/phone, channel order id and status.
  const rowText = (o: any) =>
    `${o.orderNumber || ''} ${o.channelOrderId || ''} ${o.customer?.name || ''} ${o.customer?.email || ''} ${o.customer?.phone || ''} ${o.channel?.name || ''} ${o.status || ''}`;
  // Global topbar search first, then the in-table SearchField on top of it.
  const filteredOrders = useFilteredBySearch(data?.orders, rowText);
  const searchedOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? filteredOrders.filter((o: any) => rowText(o).toLowerCase().includes(q)) : filteredOrders;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredOrders, search]);

  // Client-side sort of the loaded page (server already paginates/filters).
  const sortedOrders = useMemo(() => {
    if (!sortKey || !ORDER_SORT[sortKey]) return searchedOrders;
    const accessor = ORDER_SORT[sortKey];
    const arr = [...searchedOrders];
    arr.sort((a, b) => {
      const x = accessor(a); const y = accessor(b);
      if (x < y) return sortDir === 'asc' ? -1 : 1;
      if (x > y) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [searchedOrders, sortKey, sortDir]);

  // ── Selection (bulk actions) ──
  useEffect(() => { setSelected(new Set()); }, [page, status, risk, channelId, tab, dateFrom, dateTo]);
  const allSelected = sortedOrders.length > 0 && sortedOrders.every((o: any) => selected.has(o.id));
  const toggleAll = () => {
    setSelected((prev) => {
      if (sortedOrders.every((o: any) => prev.has(o.id))) return new Set();
      return new Set(sortedOrders.map((o: any) => o.id));
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  // ── Active filters (popover count + removable chips) ──
  const activeFilterCount = (status ? 1 : 0) + (risk ? 1 : 0) + (channelId ? 1 : 0) + ((dateFrom || dateTo) ? 1 : 0);
  const statusLabel = STATUSES.find((s) => s.value === status)?.label;
  const riskLabel = RISK_FILTERS.find((r) => r.value === risk)?.label;
  const channelLabel = channels.find((c) => c.id === channelId)?.name;
  const dateLabel = dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : dateFrom ? `From ${dateFrom}` : dateTo ? `Until ${dateTo}` : '';
  const activeChips = [
    status ? { key: 'status', label: `Status: ${statusLabel}`, clear: () => { setStatus(''); setPage(1); } } : null,
    risk ? { key: 'risk', label: `Risk: ${riskLabel}`, clear: () => { setRisk(''); setPage(1); } } : null,
    channelId ? { key: 'channel', label: `Channel: ${channelLabel || '—'}`, clear: () => { setChannelId(''); setPage(1); } } : null,
    (dateFrom || dateTo) ? { key: 'date', label: dateLabel, clear: () => { setDateFrom(''); setDateTo(''); setPage(1); } } : null,
    search ? { key: 'search', label: `“${search}”`, clear: () => setSearch('') } : null,
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];
  const clearFilters = () => { setStatus(''); setRisk(''); setChannelId(''); setDateFrom(''); setDateTo(''); setSearch(''); setPage(1); };

  // Context-aware empty state — the copy + actions match the active tab and
  // whether a search/filter is narrowing the list, so the Manual tab never
  // tells you to "connect a channel".
  const hasActiveQuery = !!(search || status || risk || channelId || dateFrom || dateTo);
  const ordersEmptyState = hasActiveQuery ? (
    <EmptyState
      icon={<ShoppingBag size={26} />}
      iconBg="bg-slate-100 text-slate-500"
      title="No matching orders"
      description="No orders match your current search and filters. Try clearing them to see everything."
      action={<Button variant="outline" leftIcon={<X size={14} />} onClick={clearFilters}>Clear filters</Button>}
      size="lg"
    />
  ) : tab === 'manual' ? (
    <EmptyState
      icon={<Hand size={26} />}
      iconBg="bg-emerald-50 text-emerald-600"
      title="Nothing to fulfill right now"
      description="Orders you ship yourself land here — your Amazon MFN (self-fulfilled) orders. They appear automatically as they sync from the channel."
      decorative
      size="lg"
    />
  ) : tab === 'auto' ? (
    <EmptyState
      icon={<Zap size={26} />}
      iconBg="bg-emerald-50 text-emerald-600"
      title="No hands-off orders yet"
      description="Orders the channel fulfills for you — Amazon FBA and dropship — appear here automatically. Nothing to do; they ship on their own."
      action={<Link href="/channels"><Button leftIcon={<Plug size={14} />}>Connect a channel</Button></Link>}
      decorative
      size="lg"
    />
  ) : (
    <EmptyState
      icon={<ShoppingBag size={28} />}
      iconBg="bg-emerald-50 text-emerald-600"
      title="No orders yet"
      description="Orders flow in automatically from your connected channels (Amazon, Shopify, Flipkart…). Connect a channel or run a sync to pull them in."
      action={<Link href="/channels"><Button leftIcon={<Plug size={14} />}>Connect a channel</Button></Link>}
      decorative
      size="lg"
    />
  );

  // Export a set of rows (visible columns) to CSV.
  const exportRows = (rows: any[]) => {
    const cols = ORDER_COLUMNS.filter((c) => !hiddenCols.has(c.key));
    const escape = (v: string) => `"${String(v).replaceAll('"', '""')}"`;
    const header = cols.map((c) => escape(c.label)).join(',');
    const lines = rows.map((o: any) => cols.map((c) => escape(ORDER_CSV[c.key]?.(o) ?? '')).join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} order${rows.length !== 1 ? 's' : ''}`);
  };
  const exportCsv = () => exportRows(sortedOrders);

  // ── Bulk actions over the selected rows ──
  const bulkSetStatus = async (nextStatus: string, verb: string) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkPending(true);
    const res = await Promise.allSettled(ids.map((id) => orderApi.updateStatus(id, { status: nextStatus })));
    const ok = res.filter((r) => r.status === 'fulfilled').length;
    setBulkPending(false);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ['orders'] });
    if (ok) toast.success(`${verb} ${ok} order${ok !== 1 ? 's' : ''}${ok < ids.length ? ` · ${ids.length - ok} skipped` : ''}`);
    else toast.error('Could not update the selected orders');
  };
  const cancelSelected = async () => {
    const ok = await confirm({
      title: `Cancel ${selected.size} order${selected.size !== 1 ? 's' : ''}?`,
      description: 'The selected orders will be marked cancelled. This cannot be undone.',
      variant: 'danger',
    });
    if (ok) bulkSetStatus('CANCELLED', 'Cancelled');
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

  // Sync a single channel — shows the imported/updated counts it returns.
  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null);
  const syncOneMutation = useMutation({
    mutationFn: async (ch: any) => {
      setSyncingChannelId(ch.id);
      const res = await channelApi.syncOrders(ch.id);
      return { ch, data: res.data };
    },
    onSuccess: ({ ch, data }) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      const imported = data?.imported ?? 0;
      const updated = data?.updated ?? 0;
      const parts = [imported ? `${imported} new` : null, updated ? `${updated} updated` : null].filter(Boolean);
      toast.success(`${ch.name}: ${parts.length ? parts.join(', ') : 'up to date'}`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e?.response?.data?.details || e.message || 'Sync failed'),
    onSettled: () => setSyncingChannelId(null),
  });

  const reviewMutation = useMutation({
    mutationFn: (id: string) => orderApi.requestReview(id),
    onSuccess: (res, id) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      setReviewResult({ id, type: 'success', message: res.data.alreadyRequested ? 'Review already requested' : 'Review request sent to Amazon' });
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
              <Link href={`/orders/${o.id}`} className="font-semibold text-emerald-600 hover:underline whitespace-nowrap">{o.channelOrderId || o.orderNumber}</Link>
              <Badge variant={o.channelOrderId ? 'blue' : 'slate'}>{o.channelOrderId ? 'Auto' : 'Manual'}</Badge>
            </div>
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
        return <td key={key} className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{o.channel?.name}</td>;
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
                <Tooltip content={`Missing: ${(Array.isArray(o.missingFields) ? o.missingFields : []).join(', ') || 'data'}`}>
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
          <td key={key} className="px-3 py-2.5 whitespace-nowrap">
            {isAwaitingTotal(o) ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="font-semibold text-slate-400">{formatCurrency(0)}</span>
                <Tooltip content="Awaiting Amazon — the order total (and PARTIAL flag) fill in automatically on the next sync while the order is still Pending." wrap>
                  <span className="inline-flex text-amber-500 cursor-help"><Info size={13} /></span>
                </Tooltip>
              </span>
            ) : (
              <span className="font-bold text-slate-900">{formatCurrency(o.total)}</span>
            )}
          </td>
        );
      case 'rto':
        return (
          <td key={key} className="px-3 py-2.5 whitespace-nowrap">
            {o.rtoRiskLevel ? (
              <Tooltip content={`RTO Score: ${o.rtoScore}/100 · ${o.rtoRiskLevel}`}>
                <span><Badge variant={riskVariant(o.rtoRiskLevel)} dot>{o.rtoScore ?? 0} {o.rtoRiskLevel}</Badge></span>
              </Tooltip>
            ) : <span className="text-slate-400 text-xs">—</span>}
          </td>
        );
      case 'status':
        return (
          <td key={key} className="px-3 py-2.5 whitespace-nowrap">
            {showsNeedsReview(o) ? (
              <Badge variant="rose" dot>NEEDS REVIEW</Badge>
            ) : (
              <Badge variant={orderStatusVariant(o.status)}>{o.status}</Badge>
            )}
          </td>
        );
      case 'date':
        return <td key={key} className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">{formatDateTime(o.createdAt)}</td>;
      default:
        return <td key={key} className="px-3 py-2.5 text-slate-400">—</td>;
    }
  };

  return (
    <>
      <div className="space-y-5 animate-slide-up">
        <PageHeader title="Orders" />

        {/* Bulk actions (appears when rows are selected) */}
        <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
          <Button variant="outline" size="sm" leftIcon={<Truck size={13} />} loading={bulkPending} onClick={() => bulkSetStatus('SHIPPED', 'Marked shipped')}>Mark shipped</Button>
          <Button variant="outline" size="sm" leftIcon={<Download size={13} />} onClick={() => exportRows(sortedOrders.filter((o: any) => selected.has(o.id)))}>Export</Button>
          <Button variant="danger" size="sm" leftIcon={<XCircle size={13} />} loading={bulkPending} onClick={cancelSelected}>Cancel</Button>
        </BulkActionBar>

        {/* Needs-approval banner */}
        {(data?.orders || []).some((o: any) => showsNeedsReview(o)) && risk !== 'APPROVAL' && (
          <button
            onClick={() => setRisk('APPROVAL')}
            className="w-full flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4 hover:bg-rose-100 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
              <AlertTriangle size={18} className="text-rose-600" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-extrabold text-rose-700">
                {(data?.orders || []).filter((o: any) => showsNeedsReview(o)).length} order(s) need your review
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

        {/* One card — fulfillment tabs · toolbar · filter chips · table · pagination.
            overflow-visible so the Views/Sort/Columns menus aren't clipped. */}
        <Card className="p-0 overflow-visible">
          {/* Header: tabs + toolbar + active filter chips */}
          <div className="p-3 sm:p-4 space-y-3 border-b border-slate-100 dark:border-slate-800">
            {/* Title row — subtitle + primary actions, inside the card */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium text-slate-500">{`${data?.total || 0} ${tab === 'auto' ? 'hands-off' : tab === 'manual' ? 'to fulfill' : 'total'} order${(data?.total || 0) === 1 ? '' : 's'}`}</p>
              <div className="flex items-center gap-2">
                {/* Split button — Sync (all channels) + a menu to sync ONE channel */}
                <div className="flex items-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<RefreshCw size={15} />}
                    loading={syncMutation.isPending}
                    onClick={() => syncMutation.mutate()}
                    className={channels.length ? 'rounded-r-none' : ''}
                  >
                    Sync
                  </Button>
                  {channels.length > 0 && (
                    <Dropdown
                      align="right"
                      trigger={
                        <Button
                          variant="secondary"
                          size="sm"
                          className="rounded-l-none border-l border-slate-200 px-1.5"
                          loading={syncOneMutation.isPending}
                          aria-label="Sync a single channel"
                        >
                          <ChevronsUpDown size={14} />
                        </Button>
                      }
                      items={channels.map((ch) => ({
                        label: `Sync ${ch.name}${syncingChannelId === ch.id ? '…' : ''}`,
                        icon: <Plug size={14} />,
                        onClick: () => syncOneMutation.mutate(ch),
                      }))}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Tabs split by who fulfils the order: Auto = FBA/dropship the
                channel ships (hands-off); Manual = MFN + orders you create and
                ship yourself. */}
            <Tabs<OrderTab>
              value={tab}
              onChange={(k) => { setTab(k); setPage(1); }}
              items={[
                { key: 'all',    label: 'All Orders', icon: <Layers size={14} /> },
                { key: 'auto',   label: 'Auto (FBA)', icon: <Zap size={14} /> },
                { key: 'manual', label: 'Manual (MFN)', icon: <Hand size={14} /> },
              ]}
            />

            {/* Toolbar — search · views · filters · sort · columns · export · density */}
            <div className="flex items-center gap-2 flex-wrap">
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Search orders, customers, channels…"
                shortcut="/"
                className="flex-1 min-w-[180px] max-w-sm"
              />
              <div className="hidden sm:block flex-1" />

              <Dropdown
                align="right"
                trigger={<Button variant="ghost" size="sm" leftIcon={<Bookmark size={14} />}>Views</Button>}
                items={[
                  { label: 'All orders', icon: <Layers size={14} />, onClick: () => { clearFilters(); setTab('all'); } },
                  { label: 'Needs shipping', icon: <Truck size={14} />, onClick: () => { setStatus('PROCESSING'); setRisk(''); setPage(1); } },
                  { label: 'High risk', icon: <AlertTriangle size={14} />, onClick: () => { setRisk('HIGH'); setPage(1); } },
                  { label: 'Needs review', icon: <Star size={14} />, onClick: () => { setRisk('APPROVAL'); setPage(1); } },
                ]}
              />

              <Button variant="outline" size="sm" leftIcon={<ListFilter size={14} />} onClick={() => setFiltersOpen(true)}>
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold">{activeFilterCount}</span>
                )}
              </Button>

              <Dropdown
                align="right"
                trigger={<Button variant="ghost" size="sm" leftIcon={<ArrowUpDown size={14} />}>Sort</Button>}
                items={ORDER_COLUMNS.filter((c) => c.sortable).map((c) => ({
                  label: `${c.label}${sortKey === c.key ? (sortDir === 'asc' ? '  ↑' : '  ↓') : ''}`,
                  onClick: () => toggleSort(c.key),
                }))}
              />

              <Popover
                align="right"
                width="w-56"
                trigger={<Button variant="ghost" size="sm" leftIcon={<SlidersHorizontal size={14} />}>Columns</Button>}
              >
                <div className="p-2">
                  <div className="px-1.5 pb-1.5 mb-1 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Show columns</div>
                  <div className="space-y-1 px-1.5 py-1">
                    {ORDER_COLUMNS.map((c) => (
                      <Checkbox key={c.key} checked={!hiddenCols.has(c.key)} onCheckedChange={() => toggleCol(c.key)} label={c.label} />
                    ))}
                  </div>
                </div>
              </Popover>

              <Button variant="ghost" size="sm" leftIcon={<Download size={14} />} onClick={exportCsv}>Export</Button>
              <DensityToggle value={density} onChange={changeDensity} />
            </div>

            {/* Active filter chips */}
            {activeChips.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Filters</span>
                {activeChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.clear}
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    {chip.label}
                    <span className="w-4 h-4 grid place-items-center rounded-full bg-emerald-100"><X size={10} /></span>
                  </button>
                ))}
                <button type="button" onClick={clearFilters} className="text-xs font-semibold text-slate-400 hover:text-slate-600 underline underline-offset-2">Clear all</button>
              </div>
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className={`w-full text-sm ${density === 'compact' ? 'tbl-compact' : ''}`}>
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="px-3 py-2.5 font-bold w-px">
                    <Tooltip content="Select all"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></Tooltip>
                  </th>
                  {visibleColumns.map((c) => (
                    <th key={c.key} className={`px-3 py-2.5 font-bold ${c.key === 'order' ? 'w-full' : 'whitespace-nowrap'}`}>
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
                  <TableRowsSkeleton rows={8} cols={visibleColumns.length + 2} />
                ) : sortedOrders.length ? sortedOrders.map((o: any) => (
                  <tr key={o.id} className={`transition-colors ${selected.has(o.id) ? 'bg-emerald-50/60' : 'hover:bg-slate-50/70'}`}>
                    <td className="px-3 py-2.5"><Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggleOne(o.id)} /></td>
                    {visibleColumns.map((c) => renderCell(o, c.key))}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {showsNeedsReview(o) && (
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
                        {o.reviewRequestedAt ? (
                          <Tooltip content={`Review requested ${new Date(o.reviewRequestedAt).toLocaleDateString()}`}>
                            <span><Button variant="ghost" size="icon" disabled><Star size={13} className="fill-amber-400 text-amber-400" /></Button></span>
                          </Tooltip>
                        ) : reviewEligible(o) ? (
                          <Tooltip content="Ask Amazon to request a buyer review">
                            <Button variant="secondary" size="icon" onClick={() => reviewMutation.mutate(o.id)} disabled={reviewMutation.isPending}>
                              <Star size={13} />
                            </Button>
                          </Tooltip>
                        ) : null}
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
                      {ordersEmptyState}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="md:hidden divide-y divide-slate-100">
            {isLoading ? (
              <ShimmerTheme>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="p-4 flex items-center gap-3">
                    <Skeleton width={36} height={36} borderRadius={10} />
                    <div className="flex-1"><Skeleton height={12} width="60%" /><Skeleton height={10} width="40%" className="mt-2" /></div>
                    <Skeleton width={54} height={20} borderRadius={20} />
                  </div>
                ))}
              </ShimmerTheme>
            ) : !sortedOrders.length ? (
              ordersEmptyState
            ) : sortedOrders.map((o: any) => {
              const isAmazon = String(o.channel?.type || '').toUpperCase().includes('AMAZON');
              const fulLabel = o.fulfillmentType === 'CHANNEL' ? (isAmazon ? 'FBA' : 'Channel')
                : o.fulfillmentType === 'DROPSHIP' ? 'Dropship' : (isAmazon ? 'MFN' : 'Self');
              const fulVariant = o.fulfillmentType === 'CHANNEL' ? 'violet' : o.fulfillmentType === 'DROPSHIP' ? 'amber' : 'blue';
              return (
                <Link key={o.id} href={`/orders/${o.id}`} className="flex items-start gap-3 p-4 hover:bg-slate-50/70 transition-colors">
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5" style={{ background: avatarColor(o.customer?.name || '?') }}>
                    {initials(o.customer?.name || '?')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">{o.channelOrderId || o.orderNumber}</div>
                    <div className="text-xs text-slate-500 truncate">{o.customer?.name} · {o.channel?.name}</div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <Badge variant={fulVariant} dot>{fulLabel}</Badge>
                      <Badge variant={orderStatusVariant(o.status)}>{o.status}</Badge>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {isAwaitingTotal(o) ? (
                      <>
                        <div className="text-sm font-semibold text-slate-400">{formatCurrency(0)}</div>
                        <div className="flex items-center justify-end gap-1 text-[10px] font-semibold text-amber-600 mt-0.5">
                          <span className="w-1 h-1 rounded-full bg-amber-500" /> awaiting Amazon
                        </div>
                      </>
                    ) : (
                      <div className="text-sm font-bold text-slate-900">{formatCurrency(o.total)}</div>
                    )}
                  </div>
                </Link>
              );
            })}
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

      {/* Filters — opens as a right-side drawer */}
      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => { clearFilters(); }}>Clear all</Button>
            <Button onClick={() => setFiltersOpen(false)}>Done</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select label="Status" fullWidth value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUSES} placeholder="All Statuses" />
          <Select label="Risk" fullWidth value={risk} onChange={(v) => { setRisk(v); setPage(1); }} options={RISK_FILTERS} placeholder="All Risk" />
          <Select
            label="Channel"
            fullWidth
            value={channelId}
            onChange={(v) => { setChannelId(v); setPage(1); }}
            options={[{ value: '', label: 'All channels' }, ...channels.map((c) => ({ value: c.id, label: c.name }))]}
            placeholder="All channels"
          />
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date range</label>
            <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); setPage(1); }} />
          </div>
        </div>
      </Modal>

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
              <div className="flex items-start gap-2.5 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800 dark:text-violet-200">
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

      {confirmUi}
    </>
  );
}
