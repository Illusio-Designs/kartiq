'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { purchaseApi, vendorApi, productApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import {
  Button, Badge, Card, Modal, Input, Textarea, Select, Pagination, Tooltip, Loader, DatePicker,
} from '@/components/ui';
import { Plus, TrendingUp, Trash2 } from 'lucide-react';

const STATUS_VARIANT: Record<string, any> = {
  DRAFT: 'slate',
  SENT: 'blue',
  CONFIRMED: 'emerald',
  PARTIALLY_RECEIVED: 'amber',
  RECEIVED: 'emerald',
  CANCELLED: 'rose',
};

export default function PurchasesPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalOpen, setModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', page, pageSize],
    queryFn: () => purchaseApi.list({ page, limit: pageSize }).then(r => r.data),
  });

  const allPurchases = data?.purchases || data || [];
  const purchases = useFilteredBySearch(allPurchases, (p: any) =>
    `${p.poNumber || ''} ${p.vendor?.name || ''} ${p.status || ''} ${p.notes || ''}`
  );
  const total = data?.total || purchases.length;

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up">
        <PageHeader
          title="Purchase Orders"
          subtitle={`${total} purchase orders`}
          actions={
            <Button leftIcon={<Plus size={15} />} onClick={() => setModalOpen(true)}>
              New Purchase Order
            </Button>
          }
        />

        <Card className="overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                  {['#', 'PO Number', 'Vendor', 'Status', 'Expected', 'Items', 'Total', 'Created'].map((h, i) => (
                    <th key={h} className={`px-4 py-3 font-bold whitespace-nowrap ${i === 2 ? 'w-full' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={8}><Loader size="sm" /></td></tr>
                ) : purchases.length ? purchases.map((p: any, idx: number) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-semibold">{(page - 1) * pageSize + idx + 1}</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">{p.poNumber}</td>
                    <td className="px-4 py-3 text-slate-700">{p.vendor?.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[p.status] || 'slate'}>{p.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {p.expectedDate ? new Date(p.expectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.items?.length || 0}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{formatCurrency(p.totalAmount || 0)}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(p.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">No purchase orders yet</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-slate-100">
            {purchases.map((p: any) => (
              <div key={p.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-emerald-600">{p.poNumber}</span>
                  <Badge variant={STATUS_VARIANT[p.status] || 'slate'}>{p.status}</Badge>
                </div>
                <div className="text-sm text-slate-700">{p.vendor?.name}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-slate-500">{p.items?.length || 0} items</span>
                  <span className="font-bold text-slate-900">{formatCurrency(p.totalAmount || 0)}</span>
                </div>
              </div>
            ))}
          </div>

          {total > pageSize && (
            <div className="border-t border-slate-100">
              <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
            </div>
          )}
        </Card>
      </div>

      <NewPurchaseModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </DashboardLayout>
  );
}

function NewPurchaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [vendorId, setVendorId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ id: '1', variantId: '', orderedQty: 1, unitCost: 0 }]);
  const [error, setError] = useState('');

  const { data: vendors } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: () => vendorApi.list().then(r => r.data),
    enabled: open,
  });

  // Products (with variants) to pick line items from — the create call needs
  // the variantId, so we flatten every product's variants into one option list.
  const { data: productsData } = useQuery({
    queryKey: ['products-for-po'],
    queryFn: () => productApi.list({ limit: 200 }).then(r => r.data),
    enabled: open,
  });
  const variantOptions = ((productsData?.products || productsData || []) as any[])
    .flatMap((p: any) => (p.variants || []).map((v: any) => ({
      value: v.id,
      label: `${p.name} · ${v.sku || v.name || 'variant'}`,
    })));

  const vendorOptions = (vendors || []).map((v: any) => ({ value: v.id, label: v.name }));
  const subtotal = items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0);

  const createMutation = useMutation({
    mutationFn: () => purchaseApi.create({
      vendorId,
      expectedDate: expectedDate || undefined,
      notes: notes || undefined,
      items: items.filter(i => i.variantId && i.orderedQty > 0).map(i => ({
        variantId: i.variantId,
        orderedQty: i.orderedQty,
        unitCost: i.unitCost,
        totalCost: i.orderedQty * i.unitCost,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      reset();
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });

  const reset = () => {
    setVendorId(''); setExpectedDate(''); setNotes(''); setError('');
    setItems([{ id: '1', variantId: '', orderedQty: 1, unitCost: 0 }]);
  };

  return (
    <Modal
      open={open}
      onClose={() => { onClose(); reset(); }}
      title="New Purchase Order"
      description="Order stock from a vendor"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => { onClose(); reset(); }}>Cancel</Button>
          <Button
            onClick={() => { setError(''); createMutation.mutate(); }}
            loading={createMutation.isPending}
            disabled={!vendorId}
          >
            Create PO
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select label="Vendor" value={vendorId} onChange={setVendorId} options={vendorOptions} placeholder="Select vendor…" fullWidth />
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Expected Date</label>
            <DatePicker
              value={expectedDate ? new Date(expectedDate) : null}
              onChange={(d) => setExpectedDate(d.toISOString().slice(0, 10))}
              placeholder="Select expected date"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Items</label>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Plus size={12} />}
              onClick={() => setItems([...items, { id: String(Date.now()), variantId: '', orderedQty: 1, unitCost: 0 }])}
            >
              Add line
            </Button>
          </div>
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="grid grid-cols-12 gap-2 p-3 bg-slate-50 rounded-xl items-center">
                <div className="col-span-12 md:col-span-6">
                  <Select
                    value={item.variantId}
                    onChange={(val) => setItems(items.map(i => i.id === item.id ? { ...i, variantId: val } : i))}
                    options={variantOptions}
                    placeholder="Select a product…"
                    fullWidth
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <Input
                    type="number"
                    min={1}
                    value={item.orderedQty}
                    onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, orderedQty: Number(e.target.value) } : i))}
                    placeholder="Qty"
                  />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Input
                    type="number"
                    min={0}
                    value={item.unitCost}
                    onChange={(e) => setItems(items.map(i => i.id === item.id ? { ...i, unitCost: Number(e.target.value) } : i))}
                    placeholder="Unit cost"
                  />
                </div>
                <div className="col-span-2 md:col-span-1 flex items-center justify-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => items.length > 1 && setItems(items.filter(i => i.id !== item.id))}
                    disabled={items.length === 1}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Delivery instructions, terms, etc." />

        <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl">
          <span className="text-sm font-bold text-slate-700">Total</span>
          <span className="text-xl font-bold text-emerald-700">{formatCurrency(subtotal)}</span>
        </div>

        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}
