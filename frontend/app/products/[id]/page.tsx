'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Package, Warehouse as WarehouseIcon, ImageOff, Pencil, X } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { productApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DetailPageSkeleton } from '@/components/Shimmer';
import { Button, Modal, Input, Textarea, Select, FileUpload } from '@/components/ui';

// Product images can be stored as plain URL/data-URI strings or as objects
// ({ url } / { src } / { media_location }) depending on where they were
// imported from. Normalize any entry to a usable src string.
function imgSrc(x: any): string | null {
  if (!x) return null;
  if (typeof x === 'string') return x.trim() || null;
  return x.url || x.src || x.media_location || x.href || null;
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [active, setActive] = useState(0);
  const [editOpen, setEditOpen] = useState(false);

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productApi.get(id).then((r) => r.data),
    enabled: !!id,
  });

  if (isLoading) {
    return <DashboardLayout><DetailPageSkeleton /></DashboardLayout>;
  }

  if (isError || !product) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto text-center py-20">
          <p className="text-slate-500">Product not found.</p>
          <Link href="/products" className="text-emerald-600 font-semibold hover:underline mt-3 inline-block">← Back to Products</Link>
        </div>
      </DashboardLayout>
    );
  }

  const variants: any[] = product.variants || [];
  const inventory: any[] = product.inventoryItems || [];
  const totalStock = inventory.reduce((s: number, i: any) => s + (i.quantityAvailable || 0), 0);
  const images: string[] = (Array.isArray(product.images) ? product.images : [])
    .map(imgSrc)
    .filter(Boolean) as string[];
  const tags: string[] = Array.isArray(product.tags) ? product.tags : [];
  const dims = product.dimensions && typeof product.dimensions === 'object' ? product.dimensions : null;
  const dimStr = dims
    ? [dims.length, dims.width, dims.height].filter((n: any) => n != null && n !== '').join(' × ')
    : '';
  const activeSrc = images[active] || images[0] || null;

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up max-w-4xl">
        <div className="flex items-center justify-between">
          <Link href="/products" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
            <ArrowLeft size={15} /> Back to Products
          </Link>
          <Button variant="outline" size="sm" leftIcon={<Pencil size={13} />} onClick={() => setEditOpen(true)}>
            Edit product
          </Button>
        </div>

        {/* Header: image + title */}
        <div className="flex items-start gap-5 flex-col sm:flex-row">
          <div className="flex gap-3">
            {/* Main image */}
            <div className="w-40 h-40 rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center flex-shrink-0">
              {activeSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeSrc} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-slate-300">
                  <ImageOff size={30} />
                  <span className="text-[11px] font-medium">No image</span>
                </div>
              )}
            </div>
            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex flex-col gap-2 overflow-y-auto max-h-40">
                {images.slice(0, 5).map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    className={`w-12 h-12 rounded-lg overflow-hidden border-2 flex-shrink-0 transition ${i === active ? 'border-emerald-500' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`${product.name} ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{product.name}</h1>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${product.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {product.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1 font-mono">SKU: {product.sku}</p>
            {product.barcode && <p className="text-xs text-slate-400 mt-0.5 font-mono">Barcode: {product.barcode}</p>}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {tags.map((t, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <InfoCard label="In stock" value={String(totalStock)} />
          <InfoCard label="Variants" value={String(variants.length)} />
          <InfoCard label="Brand" value={product.brand?.name || '—'} />
          <InfoCard label="Category" value={product.category?.name || '—'} />
        </div>

        {/* Attributes */}
        {(product.weight || dimStr || product.createdAt) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {product.weight != null && <InfoCard label="Weight" value={`${product.weight} kg`} />}
            {dimStr && <InfoCard label="Dimensions (cm)" value={dimStr} />}
            {product.createdAt && <InfoCard label="Added" value={formatDate(product.createdAt)} />}
          </div>
        )}

        {product.description && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-sm font-bold text-slate-800 mb-1.5">Description</div>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{product.description}</p>
          </div>
        )}

        {/* Variants */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 text-sm font-bold text-slate-800">
            <Package size={15} className="text-emerald-600" /> Variants
            <span className="text-xs text-slate-400 font-normal">{variants.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-5 py-2.5">Variant</th>
                  <th className="px-5 py-2.5">SKU</th>
                  <th className="px-5 py-2.5 text-right">Selling price</th>
                  <th className="px-5 py-2.5 text-right">MRP</th>
                </tr>
              </thead>
              <tbody>
                {variants.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-6 text-center text-slate-500">No variants.</td></tr>
                ) : variants.map((v: any) => (
                  <tr key={v.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 text-slate-800 font-medium">{v.name}</td>
                    <td className="px-5 py-3 text-slate-500 font-mono text-xs">{v.sku}</td>
                    <td className="px-5 py-3 text-right text-slate-700">{formatCurrency(Number(v.sellingPrice ?? 0))}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{formatCurrency(Number(v.mrp ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inventory by warehouse */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 text-sm font-bold text-slate-800">
            <WarehouseIcon size={15} className="text-emerald-600" /> Inventory
          </div>
          {inventory.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-slate-500">No stock recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="px-5 py-2.5">Warehouse</th>
                    <th className="px-5 py-2.5 text-right">On hand</th>
                    <th className="px-5 py-2.5 text-right">Reserved</th>
                    <th className="px-5 py-2.5 text-right">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((i: any) => (
                    <tr key={i.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-3 text-slate-800">{i.warehouse?.name || '—'}</td>
                      <td className="px-5 py-3 text-right text-slate-700">{i.quantityOnHand ?? 0}</td>
                      <td className="px-5 py-3 text-right text-slate-500">{i.quantityReserved ?? 0}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-900">{i.quantityAvailable ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <EditProductModal open={editOpen} onClose={() => setEditOpen(false)} product={product} />
    </DashboardLayout>
  );
}

// ── Edit product ──────────────────────────────────────────────────────────────
function imgToString(x: any): string | null {
  if (!x) return null;
  if (typeof x === 'string') return x.trim() || null;
  return x.url || x.src || x.media_location || x.href || null;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });

function EditProductModal({ open, onClose, product }: { open: boolean; onClose: () => void; product: any }) {
  const qc = useQueryClient();
  const firstVariant = product?.variants?.[0];

  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', description: '', categoryId: '', brandId: '',
    weight: '', tags: '', costPrice: '', mrp: '', sellingPrice: '',
  });
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [error, setError] = useState('');

  // (Re)hydrate the form whenever the modal opens or the product changes.
  useEffect(() => {
    if (!open || !product) return;
    setForm({
      name: product.name || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      description: product.description || '',
      categoryId: product.categoryId || product.category?.id || '',
      brandId: product.brandId || product.brand?.id || '',
      weight: product.weight != null ? String(product.weight) : '',
      tags: Array.isArray(product.tags) ? product.tags.join(', ') : '',
      costPrice: firstVariant?.costPrice != null ? String(firstVariant.costPrice) : '',
      mrp: firstVariant?.mrp != null ? String(firstVariant.mrp) : '',
      sellingPrice: firstVariant?.sellingPrice != null ? String(firstVariant.sellingPrice) : '',
    });
    setExistingImages((Array.isArray(product.images) ? product.images : []).map(imgToString).filter(Boolean) as string[]);
    setNewImages([]);
    setError('');
  }, [open, product, firstVariant]);

  const { data: categories } = useQuery({
    queryKey: ['categories-list'],
    queryFn: () => productApi.categories().then((r) => r.data),
    enabled: open,
  });
  const { data: brands } = useQuery({
    queryKey: ['brands-list'],
    queryFn: () => productApi.brands().then((r) => r.data),
    enabled: open,
  });
  const categoryOptions = (categories || []).map((c: any) => ({ value: c.id, label: c.name }));
  const brandOptions = (brands || []).map((b: any) => ({ value: b.id, label: b.name }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const newBase64 = newImages.length ? await Promise.all(newImages.map(fileToBase64)) : [];
      const images = [...existingImages, ...newBase64];
      const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
      return productApi.update(product.id, {
        name: form.name,
        sku: form.sku,
        barcode: form.barcode || undefined,
        description: form.description || undefined,
        categoryId: form.categoryId || undefined,
        brandId: form.brandId || undefined,
        weight: form.weight ? Number(form.weight) : undefined,
        tags,
        images,
        costPrice: form.costPrice ? Number(form.costPrice) : undefined,
        mrp: form.mrp ? Number(form.mrp) : undefined,
        sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product', product.id] });
      qc.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
    onError: (err: any) => {
      const e = err.response?.data?.error;
      setError(typeof e === 'string' ? e : (err.message || 'Failed to save'));
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Product"
      description="Update product content, images, and pricing"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setError(''); saveMutation.mutate(); }} loading={saveMutation.isPending} disabled={!form.name || !form.sku}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Product Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="e.g. 8901234567890" />
          <Input label="Weight (kg)" type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder="0.5" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select label="Category" value={form.categoryId} onChange={(v) => setForm({ ...form, categoryId: v })} options={categoryOptions} placeholder="Select category…" fullWidth />
          <Select label="Brand" value={form.brandId} onChange={(v) => setForm({ ...form, brandId: v })} options={brandOptions} placeholder="Select brand…" fullWidth />
        </div>

        <Textarea
          label="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Describe your product — this is the content pushed to your channel listings…"
          rows={5}
        />

        <Input label="Tags (comma separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="cotton, summer, unisex" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input label="Cost Price" type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} placeholder="0.00" />
          <Input label="MRP" type="number" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} placeholder="0.00" />
          <Input label="Selling Price" type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} placeholder="0.00" />
        </div>

        {/* Existing images — removable */}
        {existingImages.length > 0 && (
          <div>
            <div className="text-xs font-bold text-slate-500 mb-1.5">Current images</div>
            <div className="flex flex-wrap gap-2">
              {existingImages.map((src, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`image ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setExistingImages(existingImages.filter((_, idx) => idx !== i))}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-90 hover:opacity-100"
                    aria-label="Remove image"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <FileUpload
          label="Add images"
          accept="image/*"
          multiple
          maxSize={5 * 1024 * 1024}
          value={newImages}
          onChange={setNewImages}
          hint="PNG, JPG, WebP — up to 5MB each"
        />

        {error && <p className="text-xs text-rose-600 font-medium">{typeof error === 'string' ? error : 'Failed to save'}</p>}
      </div>
    </Modal>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold text-slate-900 mt-1 truncate">{value}</div>
    </div>
  );
}
