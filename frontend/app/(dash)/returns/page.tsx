'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { returnApi, orderApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { TableRowsSkeleton } from '@/components/Shimmer';
import { StatRow } from '@/components/StatCards';
import {
  Button, Badge, Card, Modal, Input, Textarea, Select, EmptyState, Tooltip, Pagination, Tabs,
} from '@/components/ui';
import type { TabItem } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/store/toast.store';
import {
  Plus, RotateCcw, Trash2, CheckCircle2, XCircle, PackageCheck, IndianRupee, Sparkles,
} from 'lucide-react';

type RStatus = 'REQUESTED' | 'APPROVED' | 'RECEIVED' | 'REFUNDED' | 'REJECTED';

const STATUS_META: Record<RStatus, { label: string; variant: 'amber' | 'blue' | 'violet' | 'emerald' | 'rose' }> = {
  REQUESTED: { label: 'Requested', variant: 'amber' },
  APPROVED:  { label: 'Approved',  variant: 'blue' },
  RECEIVED:  { label: 'Received',  variant: 'violet' },
  REFUNDED:  { label: 'Refunded',  variant: 'emerald' },
  REJECTED:  { label: 'Rejected',  variant: 'rose' },
};

const STATUS_TABS: TabItem<string>[] = [
  { key: 'ALL', label: 'All' },
  { key: 'REQUESTED', label: 'Requested' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'RECEIVED', label: 'Received' },
  { key: 'REFUNDED', label: 'Refunded' },
  { key: 'REJECTED', label: 'Rejected' },
];

const PAGE_SIZE = 20;

export default function ReturnsPage() {
  const plan = useAuthStore((s) => s.plan);
  const tier = (plan?.features as any)?.returns;
  const enhanced = tier && tier !== 'basic';

  const [createOpen, setCreateOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const qc = useQueryClient();
  useEffect(() => { setPage(1); }, [statusFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['returns', statusFilter, page],
    queryFn: () => returnApi.list({
      page, limit: PAGE_SIZE,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
    }).then((r) => r.data),
  });
  const rows: any[] = data?.returns || (Array.isArray(data) ? data : []);
  const total: number = data?.total ?? rows.length;

  const { data: allForStats } = useQuery({
    queryKey: ['returns', 'stats'],
    queryFn: () => returnApi.list({ limit: 100 }).then((r) => r.data),
  });
  const statRows: any[] = allForStats?.returns || [];
  const openCount = statRows.filter((r) => ['REQUESTED', 'APPROVED', 'RECEIVED'].includes(r.status)).length;
  const refundedCount = statRows.filter((r) => r.status === 'REFUNDED').length;
  const refundedValue = statRows.filter((r) => r.status === 'REFUNDED').reduce((s, r) => s + Number(r.refundAmt || 0), 0);

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => returnApi.setStatus(id, { status }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      if (vars.status === 'RECEIVED' && enhanced) {
        qc.invalidateQueries({ queryKey: ['inventory'] });
        toast.success('Return received — stock restocked to inventory');
      } else {
        toast.success('Return updated');
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => returnApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      setDeleteTarget(null);
      toast.success('Return deleted');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to delete'),
  });

  return (
    <>
      <div className="space-y-5 animate-slide-up">
        <PageHeader
          title="Returns"
          subtitle={enhanced
            ? 'Track RMAs end to end. Received returns restock automatically.'
            : 'Track return requests through to refund.'}
        />

        <StatRow items={[
          { label: 'Returns', value: total, tone: 'slate', icon: <RotateCcw size={16} /> },
          { label: 'Open', value: openCount, tone: 'amber', icon: <PackageCheck size={16} />, hint: 'Requested, approved or received' },
          { label: 'Refunded', value: refundedCount, tone: 'emerald', icon: <CheckCircle2 size={16} /> },
          { label: 'Refunded value', value: formatCurrency(refundedValue), tone: 'rose', icon: <IndianRupee size={16} /> },
        ]} cols={4} />

        {enhanced && (
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-emerald-800">
            <Sparkles size={15} className="flex-shrink-0" />
            <p className="text-xs font-medium">
              Enhanced returns: when you mark a self-fulfilled return <b>Received</b>, the items are added back to your inventory automatically, and refunds pre-fill from the order total.
            </p>
          </div>
        )}

        <Card className="p-0 overflow-visible">
          <div className="p-3 sm:p-4 space-y-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Tabs<string> value={statusFilter} onChange={setStatusFilter} size="sm" items={STATUS_TABS} />
              <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
                New return
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-2.5 font-bold whitespace-nowrap">Order</th>
                  <th className="px-4 py-2.5 font-bold w-full">Reason</th>
                  <th className="px-4 py-2.5 font-bold whitespace-nowrap">Requested</th>
                  <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">Refund</th>
                  <th className="px-4 py-2.5 font-bold whitespace-nowrap">Status</th>
                  <th className="px-4 py-2.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <TableRowsSkeleton rows={6} cols={6} cellClassName="px-4 py-3.5" />
                ) : rows.length ? rows.map((r: any) => {
                  const meta = STATUS_META[r.status as RStatus] || STATUS_META.REQUESTED;
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono text-xs font-bold text-slate-700">{r.order?.orderNumber || '—'}</div>
                        {r.order?.customer?.name && <div className="text-[11px] text-slate-400 truncate max-w-[140px]">{r.order.customer.name}</div>}
                      </td>
                      <td className="px-4 py-3 max-w-[320px]">
                        <div className="text-slate-700 truncate" title={r.reason || undefined}>{r.reason}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        {r.refundAmt != null ? formatCurrency(Number(r.refundAmt)) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><Badge variant={meta.variant} dot>{meta.label}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {r.status === 'REQUESTED' && (
                            <>
                              <Tooltip content="Approve return">
                                <Button variant="outline" size="icon" onClick={() => setStatus.mutate({ id: r.id, status: 'APPROVED' })}><CheckCircle2 size={13} /></Button>
                              </Tooltip>
                              <Tooltip content="Reject return">
                                <Button variant="outline" size="icon" onClick={() => setStatus.mutate({ id: r.id, status: 'REJECTED' })}><XCircle size={13} /></Button>
                              </Tooltip>
                            </>
                          )}
                          {r.status === 'APPROVED' && (
                            <>
                              <Tooltip content={enhanced ? 'Mark received — restocks inventory' : 'Mark received'}>
                                <Button variant="primary" size="icon" onClick={() => setStatus.mutate({ id: r.id, status: 'RECEIVED' })}><PackageCheck size={13} /></Button>
                              </Tooltip>
                              <Tooltip content="Reject return">
                                <Button variant="outline" size="icon" onClick={() => setStatus.mutate({ id: r.id, status: 'REJECTED' })}><XCircle size={13} /></Button>
                              </Tooltip>
                            </>
                          )}
                          {r.status === 'RECEIVED' && (
                            <Tooltip content="Issue refund">
                              <Button variant="primary" size="icon" onClick={() => setRefundTarget(r)}><IndianRupee size={13} /></Button>
                            </Tooltip>
                          )}
                          {['REQUESTED', 'REJECTED'].includes(r.status) && (
                            <Tooltip content="Delete return">
                              <Button variant="danger" size="icon" onClick={() => setDeleteTarget(r)}><Trash2 size={13} /></Button>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <EmptyState
                        icon={<RotateCcw size={28} />}
                        iconBg="bg-emerald-50 text-emerald-600"
                        title={statusFilter === 'ALL' ? 'No returns yet' : 'No returns in this status'}
                        description={statusFilter === 'ALL'
                          ? 'Log a return against an order to track it from request through to refund.'
                          : 'Try a different status filter, or log a new return.'}
                        action={statusFilter === 'ALL' ? (
                          <Button leftIcon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>New return</Button>
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

      <CreateReturnModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <RefundModal ret={refundTarget} enhanced={!!enhanced} onClose={() => setRefundTarget(null)} />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete return"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => deleteMutation.mutate(deleteTarget.id)} loading={deleteMutation.isPending}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete this return for <span className="font-bold">{deleteTarget?.order?.orderNumber}</span>? This can&apos;t be undone.
        </p>
      </Modal>
    </>
  );
}

// ── Create return ──────────────────────────────────────────────────────────
function CreateReturnModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [orderId, setOrderId] = useState('');
  const [reason, setReason] = useState('');
  const [refundAmt, setRefundAmt] = useState('');
  const [error, setError] = useState('');

  const { data: orderData } = useQuery({
    queryKey: ['orders', 'return-picker'],
    queryFn: () => orderApi.list({ limit: 100 }).then((r) => r.data),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setOrderId(''); setReason(''); setRefundAmt(''); setError('');
  }, [open]);

  const orderOptions = useMemo(() => {
    const orders = orderData?.orders || (Array.isArray(orderData) ? orderData : []);
    return orders.map((o: any) => ({
      value: o.id,
      label: `${o.orderNumber}${o.customer?.name ? ` — ${o.customer.name}` : ''}`,
    }));
  }, [orderData]);

  const mutation = useMutation({
    mutationFn: () => returnApi.create({
      orderId,
      reason,
      refundAmt: refundAmt ? Number(refundAmt) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      toast.success('Return logged');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New return"
      description="Log a return against an existing order."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setError(''); mutation.mutate(); }} loading={mutation.isPending} disabled={!orderId || !reason.trim()}>
            Log return
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Order"
          value={orderId}
          onChange={setOrderId}
          options={orderOptions}
          placeholder={orderOptions.length ? 'Select an order…' : 'No orders found'}
          fullWidth
        />
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being returned? (damaged, wrong item, changed mind…)" rows={3} />
        <Input label="Refund amount (optional)" type="number" min={0} step="0.01" value={refundAmt} onChange={(e) => setRefundAmt(e.target.value)} placeholder="Leave blank to set at refund time" leftIcon={<IndianRupee size={13} />} />
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}

// ── Refund ─────────────────────────────────────────────────────────────────
function RefundModal({ ret, enhanced, onClose }: { ret: any; enhanced: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const open = !!ret;
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    // Pre-fill: existing refundAmt, else the order total (enhanced auto-fills).
    const seed = ret?.refundAmt ?? (enhanced ? ret?.order?.total : '');
    setAmount(seed != null && seed !== '' ? String(seed) : '');
    setError('');
  }, [open, ret, enhanced]);

  const mutation = useMutation({
    mutationFn: () => returnApi.setStatus(ret.id, {
      status: 'REFUNDED',
      refundAmt: amount ? Number(amount) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['returns'] });
      toast.success('Refund recorded');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Issue refund"
      description={`Record the refund for order ${ret?.order?.orderNumber || ''}.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setError(''); mutation.mutate(); }} loading={mutation.isPending} disabled={!amount || Number(amount) < 0} leftIcon={<IndianRupee size={14} />}>
            Mark refunded
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Refund amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} leftIcon={<IndianRupee size={13} />} />
        {enhanced && ret?.order?.total != null && (
          <p className="text-[11px] text-slate-500">Order total was {formatCurrency(Number(ret.order.total))}.</p>
        )}
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}
