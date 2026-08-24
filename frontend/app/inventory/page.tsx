'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { inventoryApi, warehouseApi, productApi, channelApi } from '@/lib/api';
import { toast } from '@/store/toast.store';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import {
  Button, Badge, Card, Modal, Input, Textarea, Select, Pagination, Tabs, EmptyState,
} from '@/components/ui';
import { AlertTriangle, Plus, ArrowUpDown, Boxes, History, Package, RefreshCw } from 'lucide-react';
import Link from 'next/link';

const TYPE_OPTIONS = [
  { value: 'INBOUND',    label: 'Inbound (Add Stock)' },
  { value: 'OUTBOUND',   label: 'Outbound (Remove Stock)' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
];

const MOVEMENT_VARIANT: Record<string, string> = {
  INBOUND:    'emerald',
  OUTBOUND:   'rose',
  ADJUSTMENT: 'amber',
  TRANSFER:   'blue',
  RETURN:     'violet',
};

type Tab = 'stock' | 'movements';

export default function InventoryPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('stock');
  const [warehouseId, setWarehouseId] = useState('');
  const [showAdjust, setShowAdjust] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [movPage, setMovPage] = useState(1);
  const [adjustForm, setAdjustForm] = useState({
    warehouseId: '', variantId: '', quantity: 0, type: 'ADJUSTMENT', notes: '',
  });
  const [error, setError] = useState('');

  const { data } = useQuery({
    queryKey: ['inventory', warehouseId, page, pageSize],
    queryFn: () => inventoryApi.list({ warehouseId: warehouseId || undefined, page, limit: pageSize }).then(r => r.data),
  });

  // Topbar global search — matches sku, product name, barcode, warehouse code.
  const filteredItems = useFilteredBySearch(data?.items, (item: any) =>
    `${item.variant?.sku || item.sku || ''} ${item.product?.name || item.variant?.product?.name || ''} ${item.variant?.barcode || ''} ${item.warehouse?.name || ''} ${item.warehouse?.code || ''}`
  );
  const { data: lowStock } = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => inventoryApi.lowStock().then(r => r.data),
  });
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehouseApi.list().then(r => r.data),
  });
  const { data: movements } = useQuery({
    queryKey: ['movements', movPage],
    queryFn: () => inventoryApi.movements({ page: movPage, limit: 20 }).then(r => r.data),
    enabled: tab === 'movements',
  });
  // Fetch products+variants for the adjust dropdown
  const { data: products } = useQuery({
    queryKey: ['products-variants'],
    queryFn: () => productApi.list({ limit: 200 }).then(r => r.data),
    enabled: showAdjust,
  });

  const warehouseOptions = [
    { value: '', label: 'All Warehouses' },
    ...(warehouses || []).map((w: any) => ({ value: w.id, label: w.name })),
  ];
  const adjustWarehouseOptions = (warehouses || []).map((w: any) => ({ value: w.id, label: w.name }));

  // Build variant options from all products
  const variantOptions = (products?.products || []).flatMap((p: any) =>
    (p.variants || []).map((v: any) => ({
      value: v.id,
      label: `${p.name} — ${v.name || v.sku} (${v.sku})`,
    }))
  );

  const adjustMutation = useMutation({
    mutationFn: (d: any) => inventoryApi.adjust(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      setShowAdjust(false);
      setAdjustForm({ warehouseId: '', variantId: '', quantity: 0, type: 'ADJUSTMENT', notes: '' });
      setError('');
    },
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });

  // Push current stock levels out to every connected channel.
  const { data: channelsData } = useQuery({
    queryKey: ['channels'],
    queryFn: () => channelApi.list().then((r) => r.data),
  });
  const channels: any[] = Array.isArray(channelsData) ? channelsData : (channelsData?.channels || []);
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!channels.length) throw new Error('No channels connected yet');
      const results = await Promise.allSettled(channels.map((c) => channelApi.syncInventory(c.id)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      return { ok, failed: results.length - ok };
    },
    onSuccess: ({ ok, failed }) => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(`Pushed inventory to ${ok} channel${ok !== 1 ? 's' : ''}${failed ? `, ${failed} failed` : ''}`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message),
  });

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent tracking-tight">Inventory</h1>
            <p className="text-sm text-slate-500 mt-1">{data?.total || 0} SKUs tracked</p>
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
            <Button leftIcon={<Plus size={15} />} onClick={() => setShowAdjust(true)}>
              Adjust Stock
            </Button>
          </div>
        </div>

        {lowStock && lowStock.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-800 text-sm">{lowStock.length} items are running low on stock</p>
              <p className="text-amber-700 text-xs mt-0.5">Review and reorder soon to avoid stockouts.</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { key: 'stock',     label: 'Stock Levels', icon: <Boxes size={14} /> },
            { key: 'movements', label: 'Movements',    icon: <History size={14} /> },
          ]}
        />

        {tab === 'stock' && (
          <>
            <Select value={warehouseId} onChange={setWarehouseId} options={warehouseOptions} />
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                      {['#', 'Product', 'SKU', 'Warehouse', 'On Hand', 'Reserved', 'Available', 'Reorder', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.length ? filteredItems.map((item: any, idx: number) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 text-slate-500 font-semibold">{(page - 1) * pageSize + idx + 1}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">{item.variant?.product?.name}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.variant?.sku}</td>
                        <td className="px-4 py-3 text-slate-500">{item.warehouse?.name}</td>
                        <td className="px-4 py-3 font-semibold">{item.quantityOnHand}</td>
                        <td className="px-4 py-3 text-slate-400">{item.quantityReserved}</td>
                        <td className="px-4 py-3 font-bold">{item.quantityAvailable}</td>
                        <td className="px-4 py-3 text-slate-400">{item.reorderPoint}</td>
                        <td className="px-4 py-3">
                          {item.quantityAvailable <= item.reorderPoint ? (
                            <Badge variant="rose" dot>Low Stock</Badge>
                          ) : (
                            <Badge variant="emerald" dot>In Stock</Badge>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">No inventory items</td></tr>
                    )}
                  </tbody>
                </table>
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
          </>
        )}

        {tab === 'movements' && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                    {['#', 'Type', 'Product / SKU', 'Warehouse', 'Qty', 'Notes', 'Date'].map(h => (
                      <th key={h} className="px-4 py-3 font-bold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(movements?.movements || movements || []).length ? (movements?.movements || movements || []).map((m: any, idx: number) => (
                    <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3 text-slate-500 font-semibold">{(movPage - 1) * 20 + idx + 1}</td>
                      <td className="px-4 py-3">
                        <Badge variant={(MOVEMENT_VARIANT[m.type] as any) || 'slate'}>{m.type}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{m.variant?.product?.name || '—'}</div>
                        <div className="text-xs text-slate-400 font-mono">{m.variant?.sku}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{m.warehouse?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${['INBOUND', 'RETURN'].includes(m.type) ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {['INBOUND', 'RETURN'].includes(m.type) ? '+' : '-'}{Math.abs(m.quantity)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">{m.notes || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {m.createdAt ? new Date(m.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <EmptyState
                          icon={<ArrowUpDown size={28} />}
                          iconBg="bg-emerald-50 text-emerald-600"
                          title="No stock movements yet"
                          description="Every adjustment, transfer, sale and receipt lands here as an audit trail. Add a product to start moving stock."
                          action={
                            <Link href="/products">
                              <Button leftIcon={<Package size={14} />}>Manage products</Button>
                            </Link>
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
            {(movements?.total || 0) > 20 && (
              <div className="border-t border-slate-100">
                <Pagination
                  page={movPage}
                  pageSize={20}
                  total={movements?.total || 0}
                  onPageChange={setMovPage}
                  onPageSizeChange={() => {}}
                />
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Adjust Stock Modal */}
      <Modal
        open={showAdjust}
        onClose={() => { setShowAdjust(false); setError(''); }}
        title="Adjust Stock"
        description="Add, remove, or correct inventory at a specific warehouse"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdjust(false)}>Cancel</Button>
            <Button
              onClick={() => { setError(''); adjustMutation.mutate(adjustForm); }}
              loading={adjustMutation.isPending}
              disabled={!adjustForm.warehouseId || !adjustForm.variantId || !adjustForm.quantity}
            >
              Save Adjustment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Warehouse"
            value={adjustForm.warehouseId}
            onChange={(v) => setAdjustForm(f => ({ ...f, warehouseId: v }))}
            options={adjustWarehouseOptions}
            placeholder="Select warehouse…"
            fullWidth
          />
          <Select
            label="Product / SKU"
            value={adjustForm.variantId}
            onChange={(v) => setAdjustForm(f => ({ ...f, variantId: v }))}
            options={variantOptions}
            placeholder={variantOptions.length ? 'Select product variant…' : 'Loading products…'}
            fullWidth
          />
          <Select
            label="Movement Type"
            value={adjustForm.type}
            onChange={(v) => setAdjustForm(f => ({ ...f, type: v }))}
            options={TYPE_OPTIONS}
            fullWidth
          />
          <Input
            label="Quantity"
            type="number"
            value={adjustForm.quantity || ''}
            onChange={(e) => setAdjustForm(f => ({ ...f, quantity: Number(e.target.value) }))}
            placeholder="0"
          />
          <Textarea
            label="Notes (optional)"
            value={adjustForm.notes}
            onChange={(e) => setAdjustForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Reason for adjustment…"
            rows={3}
          />
          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        </div>
      </Modal>
    </DashboardLayout>
  );
}
