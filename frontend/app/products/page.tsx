'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { productApi, inventoryApi, warehouseApi, channelApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/store/toast.store';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import {
  Button, Badge, Card, Modal, Input, Textarea, Select, Pagination, FileUpload, Tooltip, EmptyState, Tabs, Loader,
  Checkbox, SearchField, Popover, BulkActionBar, DensityToggle, Dropdown, useConfirm,
} from '@/components/ui';
import type { Density } from '@/components/ui';
import { Plus, Package, RefreshCw, CheckCircle2, XCircle, Boxes, Layers, AlertTriangle, Ban, Tag, SearchX, ListFilter, ArrowUpDown, Bookmark, Download, SlidersHorizontal, Trash2, Send, Eye, EyeOff, X, ArrowUp, ArrowDown, ChevronsUpDown, Upload } from 'lucide-react';
import { ProductCardSkeleton } from '@/components/Shimmer';
import Link from 'next/link';
import Image from 'next/image';

// Stock status from aggregated available quantity. Low threshold is a simple
// default; per-variant reorder levels can refine this later.
const LOW_STOCK = 15;
function stockStatus(p: any): 'in' | 'low' | 'out' {
  const q = Number(p.stockAvailable ?? 0);
  if (q <= 0) return 'out';
  if (q <= LOW_STOCK) return 'low';
  return 'in';
}
const STATUS_META: Record<string, { variant: 'emerald' | 'amber' | 'rose'; label: string }> = {
  in: { variant: 'emerald', label: 'In stock' },
  low: { variant: 'amber', label: 'Low stock' },
  out: { variant: 'rose', label: 'Out of stock' },
};
// Channel type → short badge (letter + colour).
function channelBadge(type: string): { t: string; bg: string } {
  const s = String(type || '').toUpperCase();
  if (s.includes('AMAZON')) return { t: 'A', bg: '#7c3aed' };
  if (s.includes('SHOPIFY')) return { t: 'S', bg: '#0e9f6e' };
  if (s.includes('FLIPKART')) return { t: 'F', bg: '#2563eb' };
  if (s.includes('MYNTRA')) return { t: 'M', bg: '#e11d48' };
  return { t: s[0] || '?', bg: '#64748b' };
}
type CatalogTab = 'all' | 'low' | 'out' | 'unpriced';

// Configurable catalog columns (leading select + trailing actions are fixed).
// `optional` columns can be hidden via the Columns menu; `sortable` ones sort.
const PRODUCT_COLUMNS: { key: string; label: string; sortable?: boolean; optional?: boolean; align?: 'right' | 'center' }[] = [
  { key: 'product',   label: 'Product',   sortable: true },
  { key: 'category',  label: 'Category',  sortable: true, optional: true },
  { key: 'variants',  label: 'Variants',  optional: true, align: 'center' },
  { key: 'price',     label: 'Price',     sortable: true, align: 'right' },
  { key: 'available', label: 'Available', sortable: true, align: 'right' },
  { key: 'status',    label: 'Status',    optional: true },
  { key: 'channels',  label: 'Channels',  optional: true },
];
const PRODUCT_SORT: Record<string, (p: any) => string | number> = {
  product:   (p) => (p.name || '').toLowerCase(),
  category:  (p) => (p.category?.name || '').toLowerCase(),
  price:     (p) => Number(p.variants?.[0]?.sellingPrice || 0),
  available: (p) => Number(p.stockAvailable || 0),
};
const PRODUCT_CSV: Record<string, (p: any) => string> = {
  product:   (p) => `${p.name || ''} (${p.sku || ''})`,
  category:  (p) => p.category?.name || '',
  variants:  (p) => String(p.variants?.length || 0),
  price:     (p) => String(p.variants?.[0]?.sellingPrice ?? ''),
  available: (p) => String(p.stockAvailable ?? 0),
  status:    (p) => stockStatus(p),
  channels:  (p) => (p.channels || []).join(' '),
};

export default function ProductsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<CatalogTab>('all');
  const [adjustProduct, setAdjustProduct] = useState<any | null>(null);
  // Toolbar / table state
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [unpublishedOnly, setUnpublishedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [density, setDensity] = useState<Density>('comfortable');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [confirmUi, confirm] = useConfirm();

  useEffect(() => {
    try { const d = localStorage.getItem('kartriq-catalog-density'); if (d === 'compact' || d === 'comfortable') setDensity(d); } catch { /* ignore */ }
    try { const h = localStorage.getItem('kartriq-catalog-hidden-cols'); if (h) setHidden(new Set(JSON.parse(h))); } catch { /* ignore */ }
  }, []);
  const changeDensity = (d: Density) => { setDensity(d); try { localStorage.setItem('kartriq-catalog-density', d); } catch { /* ignore */ } };
  const toggleCol = (key: string) => {
    setHidden((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); try { localStorage.setItem('kartriq-catalog-hidden-cols', JSON.stringify([...n])); } catch { /* ignore */ } return n; });
  };
  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, pageSize],
    queryFn: () => productApi.list({ page, limit: pageSize }).then(r => r.data),
  });

  // Filter options
  const { data: catData } = useQuery({ queryKey: ['product-categories'], queryFn: () => productApi.categories().then(r => r.data) });
  const { data: brandData } = useQuery({ queryKey: ['product-brands'], queryFn: () => productApi.brands().then(r => r.data) });
  const { data: channelsData } = useQuery({ queryKey: ['channels'], queryFn: () => channelApi.list().then(r => r.data) });
  const categories = Array.isArray(catData) ? catData : (catData?.categories || []);
  const brands = Array.isArray(brandData) ? brandData : (brandData?.brands || []);
  const channelsList: any[] = Array.isArray(channelsData) ? channelsData : (channelsData?.channels || []);
  const categoryOptions = [{ value: '', label: 'All categories' }, ...categories.map((c: any) => ({ value: c.id, label: c.name }))];
  const brandOptions = [{ value: '', label: 'All brands' }, ...brands.map((b: any) => ({ value: b.id, label: b.name }))];
  const channelOptions = [{ value: '', label: 'All channels' }, ...channelsList.map((c: any) => ({ value: String(c.name || c.type || ''), label: c.name || c.type }))];

  const rowText = (p: any) => `${p.name || ''} ${p.sku || ''} ${p.brand?.name || ''} ${p.category?.name || ''} ${p.barcode || ''}`;
  // Topbar global search, then the in-catalog SearchField and the filter popover.
  const searched = useFilteredBySearch(data?.products, rowText);
  const filteredProducts = useMemo(() => {
    let list = searched || [];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p: any) => rowText(p).toLowerCase().includes(q));
    if (category) list = list.filter((p: any) => (p.category?.id || p.categoryId) === category);
    if (brand) list = list.filter((p: any) => (p.brand?.id || p.brandId) === brand);
    if (channelFilter) list = list.filter((p: any) => (p.channels || []).some((c: any) => String(c).toLowerCase() === channelFilter.toLowerCase()));
    if (unpublishedOnly) list = list.filter((p: any) => p.isActive === false);
    list = list.filter((p: any) => {
      if (tab === 'low') return stockStatus(p) === 'low';
      if (tab === 'out') return stockStatus(p) === 'out';
      if (tab === 'unpriced') return !(p.variants?.[0]?.sellingPrice > 0);
      return true;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, search, category, brand, channelFilter, unpublishedOnly, tab]);

  // Client-side sort of the loaded page.
  const sortedProducts = useMemo(() => {
    if (!sortKey || !PRODUCT_SORT[sortKey]) return filteredProducts;
    const accessor = PRODUCT_SORT[sortKey];
    const arr = [...filteredProducts];
    arr.sort((a, b) => {
      const x = accessor(a); const y = accessor(b);
      if (x < y) return sortDir === 'asc' ? -1 : 1;
      if (x > y) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredProducts, sortKey, sortDir]);

  const visibleColumns = PRODUCT_COLUMNS.filter((c) => !(c.optional && hidden.has(c.key)));

  // ── Selection ──
  useEffect(() => { setSelected(new Set()); }, [page, tab, category, brand, channelFilter, unpublishedOnly]);
  const allSelected = sortedProducts.length > 0 && sortedProducts.every((p: any) => selected.has(p.id));
  const toggleAll = () => setSelected((prev) => (sortedProducts.every((p: any) => prev.has(p.id)) ? new Set() : new Set(sortedProducts.map((p: any) => p.id))));
  const toggleOne = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Active filters ──
  const activeFilterCount = (category ? 1 : 0) + (brand ? 1 : 0) + (channelFilter ? 1 : 0) + (unpublishedOnly ? 1 : 0);
  const activeChips = [
    category ? { key: 'category', label: `Category: ${categoryOptions.find((o) => o.value === category)?.label || category}`, clear: () => { setCategory(''); setPage(1); } } : null,
    brand ? { key: 'brand', label: `Brand: ${brandOptions.find((o) => o.value === brand)?.label || brand}`, clear: () => { setBrand(''); setPage(1); } } : null,
    channelFilter ? { key: 'channel', label: `Channel: ${channelFilter}`, clear: () => { setChannelFilter(''); setPage(1); } } : null,
    unpublishedOnly ? { key: 'unpub', label: 'Unpublished only', clear: () => setUnpublishedOnly(false) } : null,
    search ? { key: 'search', label: `“${search}”`, clear: () => setSearch('') } : null,
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];
  const clearFilters = () => { setCategory(''); setBrand(''); setChannelFilter(''); setUnpublishedOnly(false); setSearch(''); setPage(1); };

  // ── CSV export ──
  const exportRows = (rows: any[]) => {
    const cols = visibleColumns;
    const escape = (v: string) => `"${String(v).replaceAll('"', '""')}"`;
    const header = cols.map((c) => escape(c.label)).join(',');
    const lines = rows.map((p: any) => cols.map((c) => escape(PRODUCT_CSV[c.key]?.(p) ?? '')).join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `catalog-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} product${rows.length !== 1 ? 's' : ''}`);
  };

  // ── Bulk actions ──
  const bulkSync = async () => {
    const ids = [...selected]; if (!ids.length) return;
    setBulkPending(true);
    const res = await Promise.allSettled(ids.map((id) => productApi.syncChannels(id)));
    const ok = res.filter((r) => r.status === 'fulfilled').length;
    setBulkPending(false); setSelected(new Set()); qc.invalidateQueries({ queryKey: ['products'] });
    ok ? toast.success(`Pushed ${ok} product${ok !== 1 ? 's' : ''} to channels`) : toast.error('Could not push the selected products');
  };
  const bulkPublish = async (isActive: boolean) => {
    const ids = [...selected]; if (!ids.length) return;
    setBulkPending(true);
    const res = await Promise.allSettled(ids.map((id) => productApi.update(id, { isActive })));
    const ok = res.filter((r) => r.status === 'fulfilled').length;
    setBulkPending(false); setSelected(new Set()); qc.invalidateQueries({ queryKey: ['products'] });
    ok ? toast.success(`${isActive ? 'Published' : 'Unpublished'} ${ok} product${ok !== 1 ? 's' : ''}`) : toast.error('Could not update the selected products');
  };
  const bulkDelete = async () => {
    const okConfirm = await confirm({ title: `Delete ${selected.size} product${selected.size !== 1 ? 's' : ''}?`, description: 'This permanently removes them from your catalog. This cannot be undone.', variant: 'danger' });
    if (!okConfirm) return;
    const ids = [...selected];
    setBulkPending(true);
    const res = await Promise.allSettled(ids.map((id) => productApi.delete(id)));
    const ok = res.filter((r) => r.status === 'fulfilled').length;
    setBulkPending(false); setSelected(new Set()); qc.invalidateQueries({ queryKey: ['products'] });
    ok ? toast.success(`Deleted ${ok} product${ok !== 1 ? 's' : ''}`) : toast.error('Could not delete the selected products');
  };

  const syncMutation = useMutation({
    mutationFn: (id: string) => productApi.syncChannels(id),
    onMutate: (id) => setSyncingId(id),
    onSuccess: (res) => {
      setSyncingId(null);
      qc.invalidateQueries({ queryKey: ['products'] });
      setSyncResult({ type: 'success', message: `Pushed to ${res.data.updated} channels · ${res.data.skipped} skipped · ${res.data.failed} failed` });
      setTimeout(() => setSyncResult(null), 5000);
    },
    onError: (err: any) => {
      setSyncingId(null);
      setSyncResult({ type: 'error', message: err.response?.data?.error || err.message });
      setTimeout(() => setSyncResult(null), 5000);
    },
  });

  // Render one configurable column cell for a product row.
  const renderProductCell = (p: any, key: string) => {
    switch (key) {
      case 'product': {
        const thumb = p.images?.[0];
        return (
          <td key={key} className="px-3 py-2.5">
            <Link href={`/products/${p.id}`} className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {thumb ? (
                  <Image src={thumb} alt={p.name} width={32} height={32} className="w-full h-full object-cover" sizes="32px" unoptimized={typeof thumb === 'string' && thumb.startsWith('data:')} />
                ) : <Package size={14} className="text-slate-300" />}
              </div>
              <span className="min-w-0">
                <span className="block font-semibold text-slate-800 group-hover:text-emerald-600 truncate max-w-[320px]">{p.name}</span>
                <span className="block text-[11px] text-slate-400 font-mono">{p.sku}</span>
              </span>
            </Link>
          </td>
        );
      }
      case 'category':
        return <td key={key} className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{p.category?.name || '—'}</td>;
      case 'variants':
        return <td key={key} className="px-3 py-2.5 text-center text-slate-600">{p.variants?.length || 0}</td>;
      case 'price': {
        const price = p.variants?.[0]?.sellingPrice;
        return (
          <td key={key} className="px-3 py-2.5 text-right">
            {Number(price) > 0 ? (
              <span className="font-semibold text-slate-900">{formatCurrency(Number(price))}</span>
            ) : (
              <div>
                <span className="font-semibold text-slate-400">{formatCurrency(0)}</span>
                <div className="flex items-center justify-end gap-1 text-[10px] font-semibold text-amber-600 mt-0.5"><span className="w-1 h-1 rounded-full bg-amber-500" /> set price</div>
              </div>
            )}
          </td>
        );
      }
      case 'available': {
        const st = stockStatus(p);
        return (
          <td key={key} className="px-3 py-2.5 text-right">
            <span className={`font-bold tabular-nums ${st === 'out' ? 'text-rose-600' : st === 'low' ? 'text-amber-600' : 'text-slate-900'}`}>{Number(p.stockAvailable ?? 0)}</span>
            <span className="text-[10px] text-slate-400 ml-1">units</span>
          </td>
        );
      }
      case 'status': {
        const st = stockStatus(p);
        return <td key={key} className="px-3 py-2.5"><Badge variant={STATUS_META[st].variant} dot>{STATUS_META[st].label}</Badge></td>;
      }
      case 'channels':
        return (
          <td key={key} className="px-3 py-2.5">
            <div className="flex items-center gap-1">
              {(p.channels || []).length ? (p.channels as string[]).map((c, i) => {
                const b = channelBadge(c);
                return <Tooltip key={i} content={c}><span className="w-5 h-5 rounded-md grid place-items-center text-[9px] font-extrabold text-white" style={{ background: b.bg }}>{b.t}</span></Tooltip>;
              }) : <span className="text-slate-300 text-xs">—</span>}
            </div>
          </td>
        );
      default:
        return <td key={key} className="px-3 py-2.5 text-slate-400">—</td>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up">
        <PageHeader
          title="Catalog"
          subtitle={<>{data?.total || 0} products · stock &amp; listings in one place</>}
          actions={
            <>
              <Link href="/channels">
                <Button variant="secondary" leftIcon={<Upload size={15} />}>Import from channel</Button>
              </Link>
              <Button leftIcon={<Plus size={15} />} onClick={() => setModalOpen(true)}>Add Product</Button>
            </>
          }
        />

        {/* Controls card — tabs · toolbar · filter chips in one surface.
            overflow-visible so the Views/Sort/Columns menus aren't clipped. */}
        <Card className="p-0 overflow-visible">
          <div className="p-3 sm:p-4 space-y-3">
        {/* Catalog tabs */}
        <Tabs<CatalogTab>
          value={tab}
          onChange={(k) => { setTab(k); setPage(1); }}
          items={[
            { key: 'all',      label: 'All products', icon: <Layers size={14} /> },
            { key: 'low',      label: 'Low stock',    icon: <AlertTriangle size={14} /> },
            { key: 'out',      label: 'Out of stock', icon: <Ban size={14} /> },
            { key: 'unpriced', label: 'Needs price',  icon: <Tag size={14} /> },
          ]}
        />

        {/* Toolbar — search · views · filters · sort · columns · export · density */}
        <div className="flex items-center gap-2 flex-wrap">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search products, SKUs, brands…"
            shortcut="/"
            className="flex-1 min-w-[180px] max-w-sm"
          />
          <div className="hidden sm:block flex-1" />

          <Dropdown
            align="right"
            trigger={<Button variant="ghost" size="sm" leftIcon={<Bookmark size={14} />}>Views</Button>}
            items={[
              { label: 'All products', icon: <Layers size={14} />, onClick: () => { clearFilters(); setTab('all'); setPage(1); } },
              { label: 'Low stock', icon: <AlertTriangle size={14} />, onClick: () => { setTab('low'); setPage(1); } },
              { label: 'Out of stock', icon: <Ban size={14} />, onClick: () => { setTab('out'); setPage(1); } },
              { label: 'Needs price', icon: <Tag size={14} />, onClick: () => { setTab('unpriced'); setPage(1); } },
              { label: 'Unpublished', icon: <EyeOff size={14} />, onClick: () => { setUnpublishedOnly(true); setPage(1); } },
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
            items={PRODUCT_COLUMNS.filter((c) => c.sortable).map((c) => ({
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
                {PRODUCT_COLUMNS.filter((c) => c.optional).map((c) => (
                  <Checkbox key={c.key} checked={!hidden.has(c.key)} onCheckedChange={() => toggleCol(c.key)} label={c.label} />
                ))}
              </div>
            </div>
          </Popover>

          <Button variant="ghost" size="sm" leftIcon={<Download size={14} />} onClick={() => exportRows(sortedProducts)}>Export</Button>
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
        </Card>

        {/* Bulk actions */}
        <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
          <Button variant="outline" size="sm" leftIcon={<Send size={13} />} loading={bulkPending} onClick={bulkSync}>Push to channels</Button>
          <Button variant="outline" size="sm" leftIcon={<Eye size={13} />} loading={bulkPending} onClick={() => bulkPublish(true)}>Publish</Button>
          <Button variant="outline" size="sm" leftIcon={<EyeOff size={13} />} loading={bulkPending} onClick={() => bulkPublish(false)}>Unpublish</Button>
          <Button variant="ghost" size="sm" leftIcon={<Download size={13} />} onClick={() => exportRows(sortedProducts.filter((p: any) => selected.has(p.id)))}>Export</Button>
          <Button variant="danger" size="sm" leftIcon={<Trash2 size={13} />} loading={bulkPending} onClick={bulkDelete}>Delete</Button>
        </BulkActionBar>

        {tab === 'unpriced' && (
          <div className="flex items-start gap-2.5 rounded-xl p-3 text-sm border bg-amber-50 border-amber-200 text-amber-800">
            <Tag size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div>These products were imported from a channel with no price. Open one and set its selling price so it can be sold and pushed to channels.</div>
          </div>
        )}

        {syncResult && (
          <div className={`flex items-start gap-2 rounded-xl p-3 text-sm border ${
            syncResult.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {syncResult.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            <span>{syncResult.message}</span>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : data?.products?.length ? (
          filteredProducts.length === 0 ? (
            <Card>
              <EmptyState
                icon={<SearchX size={28} />}
                iconBg="bg-slate-100 text-slate-500"
                title={
                  tab === 'low' ? 'No low-stock products'
                  : tab === 'out' ? 'No out-of-stock products'
                  : tab === 'unpriced' ? 'No products need a price'
                  : 'No products match your search'
                }
                description={
                  tab === 'low' ? 'Nothing on this page is running low on stock.'
                  : tab === 'out' ? 'Everything on this page is in stock.'
                  : tab === 'unpriced' ? 'Every product on this page has a selling price set.'
                  : 'Try a different search term or clear the current filter.'
                }
                action={
                  tab !== 'all' ? (
                    <Button variant="outline" size="sm" onClick={() => { setTab('all'); setPage(1); }}>
                      Show all products
                    </Button>
                  ) : undefined
                }
                size="md"
              />
            </Card>
          ) : (
          <>
            <Card className="p-0 overflow-hidden">
              {/* Mobile: card list */}
              <div className="md:hidden divide-y divide-slate-100">
                {sortedProducts.map((p: any) => {
                  const st = stockStatus(p);
                  const price = p.variants?.[0]?.sellingPrice;
                  const thumb = p.images?.[0];
                  return (
                    <div key={p.id} className="flex items-start gap-3 p-4">
                      <Link href={`/products/${p.id}`} className="w-11 h-11 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {thumb ? (
                          <Image src={thumb} alt={p.name} width={44} height={44} className="w-full h-full object-cover" sizes="44px" unoptimized={typeof thumb === 'string' && thumb.startsWith('data:')} />
                        ) : <Package size={16} className="text-slate-300" />}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link href={`/products/${p.id}`} className="block font-semibold text-slate-800 text-sm truncate">{p.name}</Link>
                        <div className="text-[11px] text-slate-400 font-mono truncate">{p.sku}</div>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <Badge variant={STATUS_META[st].variant} dot>{STATUS_META[st].label}</Badge>
                          <span className="text-[11px] text-slate-500 font-semibold">{Number(p.stockAvailable ?? 0)} units</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <span className={`text-sm font-bold ${Number(price) > 0 ? 'text-slate-900' : 'text-slate-400'}`}>{Number(price) > 0 ? formatCurrency(Number(price)) : '₹0'}</span>
                        <Button variant="outline" size="sm" leftIcon={<Boxes size={12} />} onClick={() => setAdjustProduct(p)}>Stock</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className={`w-full text-sm ${density === 'compact' ? 'tbl-compact' : ''}`}>
                  <thead>
                    <tr className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <th className="px-3 py-2.5 w-px">
                        <Tooltip content="Select all"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></Tooltip>
                      </th>
                      {visibleColumns.map((c) => (
                        <th key={c.key} className={`px-3 py-2.5 ${c.key === 'product' ? 'w-full' : 'whitespace-nowrap'} ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>
                          {c.sortable ? (
                            <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-slate-600 uppercase tracking-wider">
                              {c.label}
                              {sortKey === c.key ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ChevronsUpDown size={11} className="text-slate-300" />}
                            </button>
                          ) : c.label}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProducts.map((p: any) => (
                      <tr key={p.id} className={`border-b border-slate-50 last:border-0 transition-colors ${selected.has(p.id) ? 'bg-emerald-50/60' : 'hover:bg-slate-50/70'}`}>
                        <td className="px-3 py-2.5"><Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleOne(p.id)} /></td>
                        {visibleColumns.map((c) => renderProductCell(p, c.key))}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <Tooltip content="Adjust stock">
                              <Button variant="outline" size="sm" leftIcon={<Boxes size={12} />} onClick={() => setAdjustProduct(p)}>Stock</Button>
                            </Tooltip>
                            <Tooltip content="Push this product to all connected channels">
                              <Button variant="outline" size="icon" loading={syncingId === p.id} onClick={() => syncMutation.mutate(p.id)}>
                                <RefreshCw size={13} />
                              </Button>
                            </Tooltip>
                            <Link href={`/products/${p.id}`} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 px-1">View</Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {(data?.total || 0) > pageSize && (
              <Card>
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={data.total}
                  onPageChange={setPage}
                  onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                />
              </Card>
            )}
          </>
          )
        ) : (
          <Card>
            <EmptyState
              icon={<Package size={28} />}
              iconBg="bg-emerald-50 text-emerald-600"
              title="No products yet"
              description="Add your first product, or pull your existing catalogue from a connected channel like Shopify or Amazon."
              action={
                <Button leftIcon={<Plus size={14} />} onClick={() => setModalOpen(true)}>
                  Add product
                </Button>
              }
              secondaryAction={
                <Link href="/channels" className="text-emerald-600 font-bold hover:text-emerald-700">
                  or import from a channel
                </Link>
              }
              tip={<>press <kbd className="font-mono px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px]">⌘K</kbd> and type &quot;new product&quot; to skip this dialog</>}
              decorative
              size="lg"
            />
          </Card>
        )}
      </div>

      <NewProductModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <StockAdjustDrawer product={adjustProduct} onClose={() => setAdjustProduct(null)} />

      {/* Filters — opens as a right-side drawer */}
      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => clearFilters()}>Clear all</Button>
            <Button onClick={() => setFiltersOpen(false)}>Done</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select label="Category" fullWidth value={category} onChange={(v) => { setCategory(v); setPage(1); }} options={categoryOptions} />
          <Select label="Brand" fullWidth value={brand} onChange={(v) => { setBrand(v); setPage(1); }} options={brandOptions} />
          <Select label="Channel" fullWidth value={channelFilter} onChange={(v) => { setChannelFilter(v); setPage(1); }} options={channelOptions} />
          <Checkbox checked={unpublishedOnly} onCheckedChange={(v) => { setUnpublishedOnly(v); setPage(1); }} label="Unpublished only" />
        </div>
      </Modal>
      {confirmUi}
    </DashboardLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Stock adjust drawer — per-warehouse stock + a quick inbound/outbound/set.
// ═══════════════════════════════════════════════════════════════════════════
function StockAdjustDrawer({ product, onClose }: { product: any | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [type, setType] = useState('INBOUND');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');

  const open = !!product;
  // Full product (with per-warehouse inventoryItems + variants) for the panel.
  const { data: full, isLoading } = useQuery({
    queryKey: ['product', product?.id, 'stock'],
    queryFn: () => productApi.get(product.id).then((r) => r.data),
    enabled: open,
  });
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehouseApi.list().then((r) => r.data),
    enabled: open,
  });

  const variants: any[] = full?.variants || [];
  const inv: any[] = full?.inventoryItems || [];
  const whList: any[] = Array.isArray(warehouses) ? warehouses : (warehouses?.warehouses || []);

  const adjustMutation = useMutation({
    mutationFn: () => inventoryApi.adjust({
      warehouseId: warehouseId || whList[0]?.id,
      variantId: variantId || variants[0]?.id,
      quantity: Number(quantity) || 0,
      type,
      notes: notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product', product.id, 'stock'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setQuantity(''); setNotes('');
      toast.success('Stock updated');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message || 'Failed to adjust stock'),
  });

  const totalAvailable = inv.reduce((s, i) => s + (i.quantityAvailable || 0), 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product?.name || 'Adjust stock'}
      description={product ? `${product.sku} · ${totalAvailable} available` : undefined}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button
            loading={adjustMutation.isPending}
            disabled={!quantity || Number(quantity) <= 0}
            onClick={() => adjustMutation.mutate()}
          >
            Apply adjustment
          </Button>
        </>
      }
    >
      {isLoading ? <Loader size="sm" /> : (
        <div className="space-y-5">
          {/* Stock by warehouse */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Stock by warehouse</div>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/60">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="px-3 py-2 font-bold">Warehouse</th>
                    <th className="px-3 py-2 font-bold text-right">On hand</th>
                    <th className="px-3 py-2 font-bold text-right">Reserved</th>
                    <th className="px-3 py-2 font-bold text-right">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.length ? inv.map((i: any) => (
                    <tr key={i.id} className="border-t border-slate-50">
                      <td className="px-3 py-2 text-slate-700">{i.warehouse?.name || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{i.quantityOnHand ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{i.quantityReserved ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{i.quantityAvailable ?? 0}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400 text-sm">No stock recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick adjust */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Quick adjustment</div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Variant"
                  value={variantId || variants[0]?.id || ''}
                  onChange={setVariantId}
                  options={variants.map((v: any) => ({ value: v.id, label: `${v.name || v.sku}` }))}
                  fullWidth
                />
                <Select
                  label="Warehouse"
                  value={warehouseId || whList[0]?.id || ''}
                  onChange={setWarehouseId}
                  options={whList.map((w: any) => ({ value: w.id, label: w.name }))}
                  placeholder="Select warehouse…"
                  fullWidth
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Movement"
                  value={type}
                  onChange={setType}
                  options={[
                    { value: 'INBOUND', label: 'Inbound (add stock)' },
                    { value: 'OUTBOUND', label: 'Outbound (remove stock)' },
                    { value: 'ADJUSTMENT', label: 'Adjustment' },
                  ]}
                  fullWidth
                />
                <Input label="Quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
              </div>
              <Input label="Note (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. new purchase order" />
            </div>
          </div>

          {!(product?.variants?.[0]?.sellingPrice > 0) && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Tag size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div>This product has no selling price yet. <Link href={`/products/${product?.id}`} className="font-bold underline">Set a price</Link> so it can be sold and pushed to channels.</div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// New Product Modal
// ═══════════════════════════════════════════════════════════════════════════
function NewProductModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', description: '',
    costPrice: '', mrp: '', sellingPrice: '', categoryId: '', brandId: '', weight: '',
  });
  const [images, setImages] = useState<File[]>([]);
  const [error, setError] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['categories-list'],
    queryFn: () => productApi.categories().then(r => r.data),
    enabled: open,
  });
  const { data: brands } = useQuery({
    queryKey: ['brands-list'],
    queryFn: () => productApi.brands().then(r => r.data),
    enabled: open,
  });

  const categoryOptions = (categories || []).map((c: any) => ({ value: c.id, label: c.name }));
  const brandOptions = (brands || []).map((b: any) => ({ value: b.id, label: b.name }));

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

  const createMutation = useMutation({
    mutationFn: async () => {
      const imageUrls = images.length ? await Promise.all(images.map(toBase64)) : undefined;
      return productApi.create({
        name: form.name,
        sku: form.sku,
        barcode: form.barcode || undefined,
        description: form.description || undefined,
        categoryId: form.categoryId || undefined,
        brandId: form.brandId || undefined,
        weight: form.weight ? Number(form.weight) : undefined,
        images: imageUrls,
        variants: [{
          sku: form.sku,
          name: 'Default',
          attributes: {},
          costPrice: Number(form.costPrice || 0),
          mrp: Number(form.mrp || 0),
          sellingPrice: Number(form.sellingPrice || 0),
        }],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      reset();
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });

  const reset = () => {
    setForm({
      name: '', sku: '', barcode: '', description: '',
      costPrice: '', mrp: '', sellingPrice: '', categoryId: '', brandId: '', weight: '',
    });
    setImages([]);
    setError('');
  };

  return (
    <Modal
      open={open}
      onClose={() => { onClose(); reset(); }}
      title="Add New Product"
      description="Create a product to list across your channels"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => { onClose(); reset(); }}>Cancel</Button>
          <Button
            onClick={() => { setError(''); createMutation.mutate(); }}
            loading={createMutation.isPending}
            disabled={!form.name || !form.sku}
          >
            Create Product
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Product Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Premium Cotton T-Shirt"
          />
          <Input
            label="SKU"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            placeholder="e.g. TSH-001"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Barcode (optional)"
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            placeholder="e.g. 8901234567890"
          />
          <Input
            label="Weight (kg)"
            type="number"
            value={form.weight}
            onChange={(e) => setForm({ ...form, weight: e.target.value })}
            placeholder="0.5"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            label="Category"
            value={form.categoryId}
            onChange={(v) => setForm({ ...form, categoryId: v })}
            options={categoryOptions}
            placeholder="Select category…"
            fullWidth
          />
          <Select
            label="Brand"
            value={form.brandId}
            onChange={(v) => setForm({ ...form, brandId: v })}
            options={brandOptions}
            placeholder="Select brand…"
            fullWidth
          />
        </div>

        <Textarea
          label="Description (optional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Describe your product…"
          rows={3}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            label="Cost Price"
            type="number"
            min={0}
            value={form.costPrice}
            onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
            placeholder="0.00"
          />
          <Input
            label="MRP"
            type="number"
            min={0}
            value={form.mrp}
            onChange={(e) => setForm({ ...form, mrp: e.target.value })}
            placeholder="0.00"
          />
          <Input
            label="Selling Price"
            type="number"
            min={0}
            value={form.sellingPrice}
            onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
            placeholder="0.00"
          />
        </div>

        <FileUpload
          label="Product Images"
          accept="image/*"
          multiple
          maxSize={5 * 1024 * 1024}
          value={images}
          onChange={setImages}
          hint="PNG, JPG, WebP — up to 5MB each"
        />

        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}
