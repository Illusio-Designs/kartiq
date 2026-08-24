'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Package, Warehouse as WarehouseIcon } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { productApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { DetailPageSkeleton } from '@/components/Shimmer';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();

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

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up max-w-4xl">
        <Link href="/products" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} /> Back to Products
        </Link>

        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Package size={22} className="text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight truncate">{product.name}</h1>
            <p className="text-sm text-slate-500 mt-1 font-mono">SKU: {product.sku}</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <InfoCard label="In stock" value={String(totalStock)} />
          <InfoCard label="Variants" value={String(variants.length)} />
          <InfoCard label="Brand / Category" value={product.brand?.name || product.category?.name || '—'} />
        </div>

        {product.description && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-sm font-bold text-slate-800 mb-1.5">Description</div>
            <p className="text-sm text-slate-600 leading-relaxed">{product.description}</p>
          </div>
        )}

        {/* Variants */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 text-sm font-bold text-slate-800">Variants</div>
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
