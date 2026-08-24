'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Package, Warehouse as WarehouseIcon, ImageOff } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { productApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DetailPageSkeleton } from '@/components/Shimmer';

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
        <Link href="/products" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} /> Back to Products
        </Link>

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
    </DashboardLayout>
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
