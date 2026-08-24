'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { productApi, inventoryApi, warehouseApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/store/toast.store';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import {
  Button, Badge, Card, Modal, Input, Textarea, Select, Pagination, FileUpload, Tooltip, EmptyState, Tabs, Loader,
} from '@/components/ui';
import { Plus, Package, RefreshCw, CheckCircle2, XCircle, Boxes, Layers, AlertTriangle, Ban, Tag } from 'lucide-react';
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

export default function ProductsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<CatalogTab>('all');
  const [adjustProduct, setAdjustProduct] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, pageSize],
    queryFn: () => productApi.list({ page, limit: pageSize }).then(r => r.data),
  });

  // Topbar global search — filters by name, sku, brand, category.
  const searched = useFilteredBySearch(data?.products, (p: any) =>
    `${p.name || ''} ${p.sku || ''} ${p.brand?.name || ''} ${p.category?.name || ''} ${p.barcode || ''}`
  );
  // Tab filter (client-side over the loaded page).
  const filteredProducts = (searched || []).filter((p: any) => {
    if (tab === 'low') return stockStatus(p) === 'low';
    if (tab === 'out') return stockStatus(p) === 'out';
    if (tab === 'unpriced') return !(p.variants?.[0]?.sellingPrice > 0);
    return true;
  });

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

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent tracking-tight">Catalog</h1>
            <p className="text-sm text-slate-500 mt-1">{data?.total || 0} products · stock &amp; listings in one place</p>
          </div>
          <Button leftIcon={<Plus size={15} />} onClick={() => setModalOpen(true)}>Add Product</Button>
        </div>

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
          <>
            <Card className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <th className="px-3 py-2.5 w-full">Product</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">Category</th>
                      <th className="px-3 py-2.5 text-center whitespace-nowrap">Variants</th>
                      <th className="px-3 py-2.5 text-right whitespace-nowrap">Price</th>
                      <th className="px-3 py-2.5 text-right whitespace-nowrap">Available</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">Status</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">Channels</th>
                      <th className="px-3 py-2.5 text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p: any) => {
                      const thumb = p.images?.[0];
                      const price = p.variants?.[0]?.sellingPrice;
                      const st = stockStatus(p);
                      return (
                        <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 transition-colors">
                          <td className="px-3 py-2.5">
                            <Link href={`/products/${p.id}`} className="flex items-center gap-2.5 group">
                              <div className="w-8 h-8 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                {thumb ? (
                                  <Image
                                    src={thumb}
                                    alt={p.name}
                                    width={32}
                                    height={32}
                                    className="w-full h-full object-cover"
                                    sizes="32px"
                                    unoptimized={typeof thumb === 'string' && thumb.startsWith('data:')}
                                  />
                                ) : (
                                  <Package size={14} className="text-slate-300" />
                                )}
                              </div>
                              <span className="min-w-0">
                                <span className="block font-semibold text-slate-800 group-hover:text-emerald-600 truncate max-w-[320px]">{p.name}</span>
                                <span className="block text-[11px] text-slate-400 font-mono">{p.sku}</span>
                              </span>
                            </Link>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{p.category?.name || '—'}</td>
                          <td className="px-3 py-2.5 text-center text-slate-600">{p.variants?.length || 0}</td>
                          <td className="px-3 py-2.5 text-right">
                            {Number(price) > 0 ? (
                              <span className="font-semibold text-slate-900">{formatCurrency(Number(price))}</span>
                            ) : (
                              <div>
                                <span className="font-semibold text-slate-400">{formatCurrency(0)}</span>
                                <div className="flex items-center justify-end gap-1 text-[10px] font-semibold text-amber-600 mt-0.5">
                                  <span className="w-1 h-1 rounded-full bg-amber-500" /> set price
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={`font-bold tabular-nums ${st === 'out' ? 'text-rose-600' : st === 'low' ? 'text-amber-600' : 'text-slate-900'}`}>
                              {Number(p.stockAvailable ?? 0)}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-1">units</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant={STATUS_META[st].variant} dot>{STATUS_META[st].label}</Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              {(p.channels || []).length ? (p.channels as string[]).map((c, i) => {
                                const b = channelBadge(c);
                                return (
                                  <Tooltip key={i} content={c}>
                                    <span className="w-5 h-5 rounded-md grid place-items-center text-[9px] font-extrabold text-white" style={{ background: b.bg }}>{b.t}</span>
                                  </Tooltip>
                                );
                              }) : <span className="text-slate-300 text-xs">—</span>}
                            </div>
                          </td>
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
                      );
                    })}
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
            value={form.costPrice}
            onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
            placeholder="0.00"
          />
          <Input
            label="MRP"
            type="number"
            value={form.mrp}
            onChange={(e) => setForm({ ...form, mrp: e.target.value })}
            placeholder="0.00"
          />
          <Input
            label="Selling Price"
            type="number"
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
