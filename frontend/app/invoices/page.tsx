'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { invoiceApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import { Button, Badge, Card, Pagination, Select, Tooltip, Modal, Input, Loader, EmptyState } from '@/components/ui';
import { FileText, Download, Eye, Plus, Receipt, CreditCard, X } from 'lucide-react';
import Link from 'next/link';

const TYPE_FILTERS = [
  { value: '',             label: 'All Types' },
  { value: 'SALE',         label: 'Sale' },
  { value: 'PURCHASE',     label: 'Purchase' },
  { value: 'CREDIT_NOTE',  label: 'Credit Note' },
  { value: 'DEBIT_NOTE',   label: 'Debit Note' },
];

const STATUS_VARIANT: Record<string, any> = {
  DRAFT:          'slate',
  UNPAID:         'amber',
  PARTIALLY_PAID: 'blue',
  PAID:           'emerald',
  OVERDUE:        'rose',
  CANCELLED:      'slate',
};

const PAYABLE_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'];

export default function InvoicesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [type, setType] = useState('');
  const [viewInvoice, setViewInvoice] = useState<any>(null);
  const [payInvoice, setPayInvoice] = useState<any>(null);
  const [payRef, setPayRef] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payError, setPayError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, pageSize, type],
    queryFn: () => invoiceApi.list({ page, limit: pageSize, type: type || undefined }).then(r => r.data).catch(() => ({ invoices: [], total: 0 })),
  });

  const allInvoices = data?.invoices || data || [];
  const invoices = useFilteredBySearch(allInvoices, (i: any) =>
    `${i.invoiceNumber || ''} ${i.customer?.name || ''} ${i.status || ''} ${i.type || ''}`
  );
  const total = data?.total || invoices.length;
  const totalValue = invoices.reduce((s: number, inv: any) => s + Number(inv.total || 0), 0);
  const paidCount = invoices.filter((i: any) => i.status === 'PAID').length;
  const overdueCount = invoices.filter((i: any) => i.status === 'OVERDUE').length;

  const payMutation = useMutation({
    mutationFn: () => invoiceApi.pay(payInvoice.id, {
      amount: Number(payAmount) || payInvoice.total,
      reference: payRef || undefined,
      method: 'MANUAL',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setPayInvoice(null);
      setPayRef('');
      setPayAmount('');
      setPayError('');
    },
    onError: (err: any) => setPayError(err.response?.data?.error || err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => invoiceApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up">
        <PageHeader title="Invoices" subtitle={`${total} invoices generated`} />

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <Receipt size={17} />
            </div>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(totalValue)}</div>
            <div className="text-xs text-slate-500 font-semibold mt-1 uppercase tracking-wider">Total Value</div>
          </Card>
          <Card className="p-5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <FileText size={17} />
            </div>
            <div className="text-2xl font-bold text-slate-900">{paidCount}</div>
            <div className="text-xs text-slate-500 font-semibold mt-1 uppercase tracking-wider">Paid</div>
          </Card>
          <Card className="p-5">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
              <FileText size={17} />
            </div>
            <div className="text-2xl font-bold text-slate-900">{overdueCount}</div>
            <div className="text-xs text-slate-500 font-semibold mt-1 uppercase tracking-wider">Overdue</div>
          </Card>
        </div>

        <Select value={type} onChange={setType} options={TYPE_FILTERS} />

        <Card className="overflow-hidden">
          {/* Mobile: card list */}
          <div className="md:hidden divide-y divide-slate-100">
            {isLoading ? <div className="p-4"><Loader size="sm" /></div> : invoices.length ? invoices.map((inv: any) => (
              <button key={inv.id} onClick={() => setViewInvoice(inv)} className="w-full text-left flex items-start justify-between gap-3 p-4 hover:bg-slate-50/70">
                <div className="min-w-0">
                  <div className="font-bold text-emerald-600 text-sm truncate">{inv.invoiceNumber}</div>
                  <div className="text-xs text-slate-500 font-mono truncate">{inv.order?.orderNumber || inv.purchaseOrder?.poNumber || '—'}</div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Badge variant="slate">{inv.type}</Badge>
                    <Badge variant={STATUS_VARIANT[inv.status] || 'slate'}>{inv.status}</Badge>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-bold text-slate-900">{formatCurrency(inv.total || 0)}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}</div>
                </div>
              </button>
            )) : <div className="p-8 text-center text-sm text-slate-400">No invoices.</div>}
          </div>
          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                  {['#', 'Invoice #', 'Type', 'Reference', 'Amount', 'Status', 'Due Date', 'Actions'].map((h, i) => (
                    <th key={h} className={`px-4 py-3 font-bold whitespace-nowrap ${i === 3 ? 'w-full' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={8}><Loader size="sm" /></td></tr>
                ) : invoices.length ? invoices.map((inv: any, idx: number) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-semibold">{(page - 1) * pageSize + idx + 1}</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3">
                      <Badge variant="slate">{inv.type}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono">
                      {inv.order?.orderNumber || inv.purchaseOrder?.poNumber || '—'}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">{formatCurrency(inv.total || 0)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[inv.status] || 'slate'}>{inv.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Tooltip content="View invoice">
                          <Button variant="ghost" size="icon" onClick={() => setViewInvoice(inv)}>
                            <Eye size={13} />
                          </Button>
                        </Tooltip>
                        {PAYABLE_STATUSES.includes(inv.status) && (
                          <Tooltip content="Mark as paid">
                            <Button variant="outline" size="icon" onClick={() => { setPayInvoice(inv); setPayAmount(String(inv.total || '')); }}>
                              <CreditCard size={13} />
                            </Button>
                          </Tooltip>
                        )}
                        {inv.status === 'DRAFT' && (
                          <Tooltip content="Delete draft">
                            <Button
                              variant="danger"
                              size="icon"
                              onClick={() => deleteMutation.mutate(inv.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <X size={13} />
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <EmptyState
                        icon={<Receipt size={28} />}
                        iconBg="bg-emerald-50 text-emerald-600"
                        title="No invoices yet"
                        description="Invoices appear automatically when orders are confirmed. You can also draft one manually for pro-forma billing."
                        action={
                          <Link href="/orders">
                            <Button leftIcon={<FileText size={14} />}>View orders</Button>
                          </Link>
                        }
                        secondaryAction={<span>they generate on order confirmation</span>}
                        decorative
                        size="lg"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {total > pageSize && (
            <div className="border-t border-slate-100">
              <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
            </div>
          )}
        </Card>
      </div>

      {/* View Invoice Modal */}
      {viewInvoice && (
        <Modal
          open={!!viewInvoice}
          onClose={() => setViewInvoice(null)}
          title={`Invoice ${viewInvoice.invoiceNumber}`}
          size="lg"
          footer={<Button variant="secondary" onClick={() => setViewInvoice(null)}>Close</Button>}
        >
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Type</div>
                <Badge variant="slate">{viewInvoice.type}</Badge>
              </div>
              <div>
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Status</div>
                <Badge variant={STATUS_VARIANT[viewInvoice.status] || 'slate'}>{viewInvoice.status}</Badge>
              </div>
              <div>
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Total</div>
                <div className="font-bold text-slate-900 text-lg">{formatCurrency(viewInvoice.total || 0)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Due Date</div>
                <div className="text-slate-700">
                  {viewInvoice.dueDate ? new Date(viewInvoice.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </div>
              </div>
              {viewInvoice.order?.orderNumber && (
                <div>
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Order</div>
                  <div className="font-mono text-slate-700">{viewInvoice.order.orderNumber}</div>
                </div>
              )}
              {viewInvoice.purchaseOrder?.poNumber && (
                <div>
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">PO Number</div>
                  <div className="font-mono text-slate-700">{viewInvoice.purchaseOrder.poNumber}</div>
                </div>
              )}
            </div>
            {viewInvoice.notes && (
              <div>
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">Notes</div>
                <div className="text-slate-600 bg-slate-50 rounded-lg p-3">{viewInvoice.notes}</div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Pay Invoice Modal */}
      {payInvoice && (
        <Modal
          open={!!payInvoice}
          onClose={() => { setPayInvoice(null); setPayError(''); }}
          title={`Record Payment — ${payInvoice.invoiceNumber}`}
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => { setPayInvoice(null); setPayError(''); }}>Cancel</Button>
              <Button
                onClick={() => { setPayError(''); payMutation.mutate(); }}
                loading={payMutation.isPending}
                disabled={!payAmount || Number(payAmount) <= 0}
              >
                Confirm Payment
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="text-xs text-slate-500">Invoice total</div>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(payInvoice.total || 0)}</div>
            </div>
            <Input
              label="Amount being paid (₹)"
              type="number"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder={String(payInvoice.total || 0)}
            />
            <Input
              label="Payment reference (optional)"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="e.g. UTR number, cheque #, transaction ID"
            />
            {payError && <p className="text-xs text-rose-600 font-medium">{payError}</p>}
          </div>
        </Modal>
      )}
    </DashboardLayout>
  );
}
