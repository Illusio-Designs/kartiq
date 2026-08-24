'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { customerApi } from '@/lib/api';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import {
  Button, Badge, Card, Modal, Input, Pagination, Tooltip, Checkbox, Loader, Avatar, EmptyState,
  PhoneField, isPhoneEmpty, validatePhone,
} from '@/components/ui';
import {
  Plus, Users, Mail, UserPlus, TrendingUp, Crown, Pencil, Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export default function CustomersPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [createOpen, setCreateOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, pageSize],
    queryFn: () => customerApi.list({ page, limit: pageSize }).then(r => r.data),
  });

  const allCustomers = data?.customers || data || [];
  const customers = useFilteredBySearch(allCustomers, (c: any) =>
    `${c.name || ''} ${c.email || ''} ${c.phone || ''} ${c.gstIn || ''} ${c.city || ''}`
  );
  const total = data?.total || customers.length;
  const b2bCount = customers.filter((c: any) => c.isB2B).length;

  // Customers created in the current calendar month
  const thisMonth = customers.filter((c: any) => {
    if (!c.createdAt) return false;
    const d = new Date(c.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const qc = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: (id: string) => customerApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setDeleteTarget(null);
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent tracking-tight">Customers</h1>
            <p className="text-sm text-slate-500 mt-1">{total} total customers</p>
          </div>
          <Button leftIcon={<UserPlus size={15} />} onClick={() => setCreateOpen(true)}>
            New Customer
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total Customers" value={total}     icon={Users}     color="emerald" />
          <StatCard label="B2B Accounts"    value={b2bCount}  icon={Crown}     color="amber" />
          <StatCard label="This Month"      value={thisMonth} icon={TrendingUp} color="sky" />
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                  {['#', 'Customer', 'Email', 'Phone', 'Type', 'GSTIN', 'Joined', ''].map((h, i) => (
                    <th key={h} className={`px-4 py-3 font-bold whitespace-nowrap ${i === 1 ? 'w-full' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={8}><Loader size="sm" /></td></tr>
                ) : customers.length ? customers.map((c: any, idx: number) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-semibold">{(page - 1) * pageSize + idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.name} size="sm" />
                        <div>
                          <div className="font-bold text-slate-900">{c.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{c.id?.slice(0, 8)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{c.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={c.isB2B ? 'amber' : 'emerald'}>{c.isB2B ? 'B2B' : 'Retail'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{c.gstIn || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Tooltip content="Edit customer">
                          <Button variant="ghost" size="icon" onClick={() => setEditCustomer(c)}>
                            <Pencil size={13} />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Delete customer">
                          <Button variant="danger" size="icon" onClick={() => setDeleteTarget(c)}>
                            <Trash2 size={13} />
                          </Button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <EmptyState
                        icon={<Users size={28} />}
                        iconBg="bg-emerald-50 text-emerald-600"
                        title="No customers yet"
                        description="Customers are created automatically with each order, or you can add them manually for B2B accounts and quotes."
                        action={
                          <Button leftIcon={<UserPlus size={14} />} onClick={() => setCreateOpen(true)}>
                            Add customer
                          </Button>
                        }
                        secondaryAction={<span>or wait — they appear after your first order</span>}
                        decorative
                        size="lg"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {customers.map((c: any) => (
              <div key={c.id} className="p-4 flex items-center gap-3">
                <Avatar name={c.name} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 truncate">{c.name}</div>
                  <div className="text-xs text-slate-500 truncate">{c.email || c.phone || '—'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={c.isB2B ? 'amber' : 'emerald'}>{c.isB2B ? 'B2B' : 'Retail'}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => setEditCustomer(c)}>
                    <Pencil size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {total > pageSize && (
            <div className="border-t border-slate-100">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
              />
            </div>
          )}
        </Card>
      </div>

      <CustomerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
      />
      <CustomerModal
        open={!!editCustomer}
        onClose={() => setEditCustomer(null)}
        mode="edit"
        customer={editCustomer}
      />

      {/* Delete confirm */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Customer"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
              loading={deleteMutation.isPending}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete <span className="font-bold">{deleteTarget?.name}</span>? This cannot be undone.
        </p>
      </Modal>
    </DashboardLayout>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: LucideIcon; color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50 text-amber-600',
    sky:     'bg-sky-50 text-sky-600',
  };
  return (
    <Card className="p-5">
      <div className={`w-10 h-10 rounded-xl ${colorMap[color]} flex items-center justify-center mb-3`}>
        <Icon size={17} />
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 font-semibold mt-1 uppercase tracking-wider">{label}</div>
    </Card>
  );
}

function CustomerModal({
  open, onClose, mode, customer,
}: {
  open: boolean; onClose: () => void; mode: 'create' | 'edit'; customer?: any;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name:  customer?.name  || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    gstIn: customer?.gstIn || '',
    isB2B: customer?.isB2B || false,
  });
  const [error, setError] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Reset form when customer changes (switching between rows)
  const resetToCustomer = (c: any) => setForm({
    name: c?.name || '', email: c?.email || '', phone: c?.phone || '',
    gstIn: c?.gstIn || '', isB2B: c?.isB2B || false,
  });

  const phoneForApi = isPhoneEmpty(form.phone) ? undefined : form.phone;

  const mutation = useMutation({
    mutationFn: () => mode === 'create'
      ? customerApi.create({ ...form, email: form.email || undefined, phone: phoneForApi, gstIn: form.gstIn || undefined })
      : customerApi.update(customer.id, { ...form, email: form.email || undefined, phone: phoneForApi, gstIn: form.gstIn || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setError('');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });

  const submit = () => {
    setError('');
    const pErr = validatePhone(form.phone);
    if (pErr) { setPhoneError(pErr); return; }
    setPhoneError(null);
    mutation.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'New Customer' : 'Edit Customer'}
      description={mode === 'create' ? 'Add a customer to your database' : 'Update customer details'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            loading={mutation.isPending}
            disabled={!form.name}
          >
            {mode === 'create' ? 'Create Customer' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Priya Mehta" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Email" type="email" leftIcon={<Mail size={14} />} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="priya@example.com" />
          <PhoneField
            label="Phone"
            value={form.phone}
            onChange={(v) => { setForm({ ...form, phone: v }); if (phoneError) setPhoneError(null); }}
            error={phoneError || undefined}
          />
        </div>
        <Input label="GSTIN (optional)" value={form.gstIn} onChange={(e) => setForm({ ...form, gstIn: e.target.value.toUpperCase() })} placeholder="22AAAAA0000A1Z5" />
        <Checkbox
          label="B2B Customer"
          description="Mark as wholesale / business buyer"
          checked={form.isB2B}
          onCheckedChange={(v) => setForm({ ...form, isB2B: v })}
        />
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}
