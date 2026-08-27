'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { purchaseApi, vendorApi, productApi, warehouseApi } from '@/lib/api';
import { TableRowsSkeleton } from '@/components/Shimmer';
import { StatRow } from '@/components/StatCards';
import {
  Button, Badge, Card, Modal, Input, Textarea, Select, EmptyState, Tooltip, Pagination, Tabs,
} from '@/components/ui';
import type { TabItem } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/store/toast.store';
import {
  Plus, ClipboardList, Trash2, Search, PackageCheck, X, Send, CheckCircle2, Truck, Ban,
} from 'lucide-react';

type PoStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

const STATUS_META: Record<PoStatus, { label: string; variant: 'slate' | 'blue' | 'violet' | 'amber' | 'emerald' | 'rose' }> = {
  DRAFT:              { label: 'Draft',              variant: 'slate' },
  SENT:               { label: 'Sent',               variant: 'blue' },
  CONFIRMED:          { label: 'Confirmed',          variant: 'violet' },
  PARTIALLY_RECEIVED: { label: 'Partially received', variant: 'amber' },
  RECEIVED:           { label: 'Received',           variant: 'emerald' },
  CANCELLED:          { label: 'Cancelled',          variant: 'rose' },
};

const STATUS_TABS: TabItem<string>[] = [
  { key: 'ALL', label: 'All' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SENT', label: 'Sent' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PARTIALLY_RECEIVED', label: 'Partial' },
  { key: 'RECEIVED', label: 'Received' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const PAGE_SIZE = 20;

export default function PurchasesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const qc = useQueryClient();
  useEffect(() => { setPage(1); }, [statusFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', statusFilter, page],
    queryFn: () => purchaseApi.list({
      page, limit: PAGE_SIZE,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
    }).then((r) => r.data),
  });

  const pos: any[] = data?.purchaseOrders || (Array.isArray(data) ? data : []);
  const total: number = data?.total ?? pos.length;

  // Lightweight roll-up for the stat strip (this page only — the API is paginated).
  const { data: allForStats } = useQuery({
    queryKey: ['purchases', 'stats'],
    queryFn: () => purchaseApi.list({ limit: 100 }).then((r) => r.data),
  });
  const statPos: any[] = allForStats?.purchaseOrders || [];
  const openCount = statPos.filter((p) => ['DRAFT', 'SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED'].includes(p.status)).length;
  const receivedCount = statPos.filter((p) => p.status === 'RECEIVED').length;
  const openValue = statPos
    .filter((p) => !['RECEIVED', 'CANCELLED'].includes(p.status))
    .reduce((s, p) => s + Number(p.totalAmount || 0), 0);

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => purchaseApi.setStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      toast.success('Purchase order updated');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => purchaseApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      setDeleteTarget(null);
      toast.success('Purchase order deleted');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to delete'),
  });

  return (
    <>
      <div className="space-y-5 animate-slide-up">
        <PageHeader title="Purchase orders" subtitle="Order stock from vendors and receive it into your warehouse." />

        <StatRow items={[
          { label: 'Purchase orders', value: total, tone: 'slate', icon: <ClipboardList size={16} /> },
          { label: 'Open', value: openCount, tone: 'blue', icon: <Send size={16} />, hint: 'Draft, sent, confirmed or partially received' },
          { label: 'Received', value: receivedCount, tone: 'emerald', icon: <PackageCheck size={16} /> },
          { label: 'Open value', value: formatCurrency(openValue), tone: 'violet', icon: <Truck size={16} />, hint: 'Value of stock ordered but not yet received' },
        ]} cols={4} />

        <Card className="p-0 overflow-visible">
          <div className="p-3 sm:p-4 space-y-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Tabs<string> value={statusFilter} onChange={setStatusFilter} size="sm" items={STATUS_TABS} />
              <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
                New purchase order
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-2.5 font-bold whitespace-nowrap">PO #</th>
                  <th className="px-4 py-2.5 font-bold w-full">Vendor</th>
                  <th className="px-4 py-2.5 font-bold text-center whitespace-nowrap">Items</th>
                  <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">Total</th>
                  <th className="px-4 py-2.5 font-bold whitespace-nowrap">Status</th>
                  <th className="px-4 py-2.5 font-bold whitespace-nowrap">Expected</th>
                  <th className="px-4 py-2.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <TableRowsSkeleton rows={6} cols={7} cellClassName="px-4 py-3.5" />
                ) : pos.length ? pos.map((po: any) => {
                  const meta = STATUS_META[po.status as PoStatus] || STATUS_META.DRAFT;
                  const itemCount = po.items?.length || 0;
                  const canReceive = ['SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED'].includes(po.status);
                  const canSend = po.status === 'DRAFT';
                  const canConfirm = po.status === 'SENT';
                  const canCancel = ['DRAFT', 'SENT', 'CONFIRMED'].includes(po.status);
                  const canDelete = ['DRAFT', 'CANCELLED'].includes(po.status);
                  return (
                    <tr key={po.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700 whitespace-nowrap">{po.poNumber}</td>
                      <td className="px-4 py-3 max-w-[240px]">
                        <div className="font-semibold text-slate-900 truncate" title={po.vendor?.name || undefined}>
                          {po.vendor?.name || <span className="text-slate-400 italic font-normal">Unknown vendor</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 tabular-nums">{itemCount}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">{formatCurrency(Number(po.totalAmount || 0))}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><Badge variant={meta.variant} dot>{meta.label}</Badge></td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canSend && (
                            <Tooltip content="Mark as sent to vendor">
                              <Button variant="outline" size="icon" onClick={() => setStatus.mutate({ id: po.id, status: 'SENT' })}><Send size={13} /></Button>
                            </Tooltip>
                          )}
                          {canConfirm && (
                            <Tooltip content="Mark as confirmed">
                              <Button variant="outline" size="icon" onClick={() => setStatus.mutate({ id: po.id, status: 'CONFIRMED' })}><CheckCircle2 size={13} /></Button>
                            </Tooltip>
                          )}
                          {canReceive && (
                            <Tooltip content="Receive stock">
                              <Button variant="primary" size="icon" onClick={() => setReceiveTarget(po)}><PackageCheck size={13} /></Button>
                            </Tooltip>
                          )}
                          {canCancel && (
                            <Tooltip content="Cancel PO">
                              <Button variant="outline" size="icon" onClick={() => setStatus.mutate({ id: po.id, status: 'CANCELLED' })}><Ban size={13} /></Button>
                            </Tooltip>
                          )}
                          {canDelete && (
                            <Tooltip content="Delete PO">
                              <Button variant="danger" size="icon" onClick={() => setDeleteTarget(po)}><Trash2 size={13} /></Button>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={7} className="p-0">
                      <EmptyState
                        icon={<ClipboardList size={28} />}
                        iconBg="bg-emerald-50 text-emerald-600"
                        title={statusFilter === 'ALL' ? 'No purchase orders yet' : 'No purchase orders in this status'}
                        description={statusFilter === 'ALL'
                          ? 'Raise a purchase order to buy stock from a vendor. When it arrives, receive it here and the quantities land straight in your inventory.'
                          : 'Try a different status filter, or create a new purchase order.'}
                        action={statusFilter === 'ALL' ? (
                          <Button leftIcon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>New purchase order</Button>
                        ) : undefined}
                        decorative
                        size="lg"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {total > PAGE_SIZE && (
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        )}
      </div>

      <CreatePoModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ReceiveModal po={receiveTarget} onClose={() => setReceiveTarget(null)} />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete purchase order"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => deleteMutation.mutate(deleteTarget.id)} loading={deleteMutation.isPending}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete <span className="font-bold">{deleteTarget?.poNumber}</span>? This can&apos;t be undone.
        </p>
      </Modal>
    </>
  );
}

// ── Create PO ──────────────────────────────────────────────────────────────
type Line = { variantId: string; orderedQty: string; unitCost: string };

function CreatePoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [vendorId, setVendorId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ variantId: '', orderedQty: '1', unitCost: '' }]);
  const [error, setError] = useState('');

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => vendorApi.list().then((r) => r.data),
    enabled: open,
  });
  const { data: productData } = useQuery({
    queryKey: ['products', 'po-picker'],
    queryFn: () => productApi.list({ limit: 500 }).then((r) => r.data),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setVendorId(''); setExpectedDate(''); setNotes('');
    setLines([{ variantId: '', orderedQty: '1', unitCost: '' }]);
    setError('');
  }, [open]);

  const vendorOptions = useMemo(
    () => (vendors || []).map((v: any) => ({ value: v.id, label: v.name })),
    [vendors]
  );
  // Flatten every product's variants into "Product — SKU" options.
  const variantOptions = useMemo(() => {
    const products = productData?.products || (Array.isArray(productData) ? productData : []);
    const out: { value: string; label: string }[] = [];
    for (const p of products) {
      for (const v of (p.variants || [])) {
        out.push({ value: v.id, label: `${p.name} — ${v.sku || v.id.slice(0, 6)}` });
      }
    }
    return out;
  }, [productData]);

  const totalAmount = lines.reduce((s, l) => s + (Number(l.unitCost) || 0) * (Number(l.orderedQty) || 0), 0);

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, { variantId: '', orderedQty: '1', unitCost: '' }]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const mutation = useMutation({
    mutationFn: () => {
      const items = lines
        .filter((l) => l.variantId && Number(l.orderedQty) > 0)
        .map((l) => ({ variantId: l.variantId, orderedQty: Number(l.orderedQty), unitCost: Number(l.unitCost) || 0 }));
      return purchaseApi.create({
        vendorId,
        expectedDate: expectedDate ? new Date(expectedDate).toISOString() : undefined,
        notes: notes || undefined,
        items,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      toast.success('Purchase order created');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });

  const validLines = lines.filter((l) => l.variantId && Number(l.orderedQty) > 0);
  const canSubmit = !!vendorId && validLines.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New purchase order"
      description="Order stock from a vendor. Receive it later to add the quantities to inventory."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setError(''); mutation.mutate(); }} loading={mutation.isPending} disabled={!canSubmit}>
            Create draft PO
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Vendor"
            value={vendorId}
            onChange={setVendorId}
            options={vendorOptions}
            placeholder={vendorOptions.length ? 'Select a vendor…' : 'No vendors — add one first'}
            fullWidth
          />
          <Input label="Expected date" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Line items</label>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <Select
                    value={line.variantId}
                    onChange={(v) => updateLine(i, { variantId: v })}
                    options={variantOptions}
                    placeholder="Select product / SKU…"
                    fullWidth
                  />
                </div>
                <div className="w-20 flex-shrink-0">
                  <Input type="number" min={1} value={line.orderedQty} onChange={(e) => updateLine(i, { orderedQty: e.target.value })} placeholder="Qty" />
                </div>
                <div className="w-28 flex-shrink-0">
                  <Input type="number" min={0} step="0.01" value={line.unitCost} onChange={(e) => updateLine(i, { unitCost: e.target.value })} placeholder="Unit ₹" leftIcon={<span className="text-slate-400 text-xs">₹</span>} />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0 text-slate-400 hover:text-rose-600"
                  onClick={() => removeLine(i)}
                  disabled={lines.length === 1}
                  aria-label="Remove line"
                >
                  <X size={15} />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" leftIcon={<Plus size={14} />} className="mt-2" onClick={addLine}>
            Add line
          </Button>
        </div>

        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — delivery instructions, reference numbers…" rows={2} />

        <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-slate-600">Total</span>
          <span className="text-lg font-bold text-slate-900 tabular-nums">{formatCurrency(totalAmount)}</span>
        </div>

        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}

// ── Receive stock ──────────────────────────────────────────────────────────
function ReceiveModal({ po, onClose }: { po: any; onClose: () => void }) {
  const qc = useQueryClient();
  const open = !!po;
  const [warehouseId, setWarehouseId] = useState('');
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehouseApi.list().then((r) => r.data),
    enabled: open,
  });

  // Fetch the full PO (with variant/product names) when opening.
  const { data: full } = useQuery({
    queryKey: ['purchase', po?.id],
    queryFn: () => purchaseApi.get(po.id).then((r) => r.data),
    enabled: open,
  });
  const items: any[] = full?.items || po?.items || [];

  useEffect(() => {
    if (!open) return;
    setWarehouseId(''); setError('');
    // Default each editable qty to the remaining amount.
    const seed: Record<string, string> = {};
    for (const it of items) {
      const remaining = (it.orderedQty || 0) - (it.receivedQty || 0);
      seed[it.id] = String(Math.max(0, remaining));
    }
    setQtys(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, full]);

  const realWarehouses = (warehouses || []).filter((w: any) => !w.isVirtual && w.externalSource !== 'AMAZON_FBA' && w.isActive);
  const warehouseOptions = realWarehouses.map((w: any) => ({ value: w.id, label: w.name }));

  const mutation = useMutation({
    mutationFn: () => {
      const lines = items
        .map((it) => ({ itemId: it.id, qty: Number(qtys[it.id]) || 0 }))
        .filter((l) => l.qty > 0);
      return purchaseApi.receive(po.id, {
        warehouseId: warehouseId || undefined,
        lines: lines.length ? lines : undefined,
      });
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      const into = res?.data?.receivedInto?.name;
      toast.success(into ? `Stock received into ${into}` : 'Stock received');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });

  const anyQty = items.some((it) => Number(qtys[it.id]) > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Receive stock — ${po?.poNumber || ''}`}
      description="Confirm the quantities that arrived. They're added to the selected warehouse's on-hand stock."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setError(''); mutation.mutate(); }} loading={mutation.isPending} disabled={!anyQty} leftIcon={<PackageCheck size={15} />}>
            Receive stock
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Receive into warehouse"
          value={warehouseId}
          onChange={setWarehouseId}
          options={warehouseOptions}
          placeholder={warehouseOptions.length ? 'Default (first warehouse)' : 'No warehouse available'}
          fullWidth
        />

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/60 border-b border-slate-100">
              <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                <th className="px-3 py-2 font-bold w-full">Product</th>
                <th className="px-3 py-2 font-bold text-center whitespace-nowrap">Ordered</th>
                <th className="px-3 py-2 font-bold text-center whitespace-nowrap">Received</th>
                <th className="px-3 py-2 font-bold text-center whitespace-nowrap">Receive now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it) => {
                const remaining = (it.orderedQty || 0) - (it.receivedQty || 0);
                const name = it.variant?.product?.name || it.variant?.sku || 'Item';
                return (
                  <tr key={it.id}>
                    <td className="px-3 py-2.5 max-w-[240px]">
                      <div className="font-semibold text-slate-800 truncate" title={name}>{name}</div>
                      <div className="text-[11px] text-slate-400 font-mono truncate">{it.variant?.sku || ''}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-slate-600">{it.orderedQty}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-slate-600">{it.receivedQty}</td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="number"
                        min={0}
                        max={remaining}
                        value={qtys[it.id] ?? ''}
                        onChange={(e) => setQtys((prev) => ({ ...prev, [it.id]: e.target.value }))}
                        disabled={remaining <= 0}
                        className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:bg-slate-50 disabled:text-slate-300"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500">
          Receiving all remaining quantities marks the PO <b>Received</b>; a partial receipt marks it <b>Partially received</b> so you can receive the rest later.
        </p>

        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}
