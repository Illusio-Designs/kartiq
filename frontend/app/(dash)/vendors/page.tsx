'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { vendorApi } from '@/lib/api';
import { TableRowsSkeleton } from '@/components/Shimmer';
import { StatRow } from '@/components/StatCards';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import {
  Button, Badge, Card, Modal, Input, EmptyState, Tooltip,
} from '@/components/ui';
import { Plus, Truck, Pencil, Trash2, Search, Mail, Phone, FileText } from 'lucide-react';

export default function VendorsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editVendor, setEditVendor] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [search, setSearch] = useState('');

  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => vendorApi.list().then((r) => r.data),
  });

  const allVendors: any[] = data || [];
  const globallyFiltered = useFilteredBySearch(allVendors, (v: any) =>
    `${v.name || ''} ${v.email || ''} ${v.phone || ''} ${v.gstin || ''}`
  );
  const vendors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return globallyFiltered;
    return globallyFiltered.filter((v: any) =>
      `${v.name || ''} ${v.email || ''} ${v.phone || ''} ${v.gstin || ''}`.toLowerCase().includes(q)
    );
  }, [globallyFiltered, search]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vendorApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] });
      setDeleteTarget(null);
    },
  });

  const withGstin = allVendors.filter((v: any) => v.gstin).length;

  return (
    <>
      <div className="space-y-5 animate-slide-up">
        <PageHeader title="Vendors" subtitle="Suppliers you raise purchase orders against." />

        <StatRow items={[
          { label: 'Vendors', value: allVendors.length, tone: 'slate', icon: <Truck size={16} /> },
          { label: 'GST registered', value: withGstin, tone: 'emerald', icon: <FileText size={16} />, hint: 'Vendors with a GSTIN on file' },
          { label: 'With email', value: allVendors.filter((v: any) => v.email).length, tone: 'blue', icon: <Mail size={16} /> },
          { label: 'With phone', value: allVendors.filter((v: any) => v.phone).length, tone: 'violet', icon: <Phone size={16} /> },
        ]} cols={4} />

        <Card className="p-0 overflow-visible">
          <div className="p-3 sm:p-4 space-y-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium text-slate-500">
                {`${vendors.length} supplier${vendors.length !== 1 ? 's' : ''}`}
              </p>
              <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
                New vendor
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[180px] max-w-sm">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search vendors…"
                  leftIcon={<Search size={14} />}
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-2.5 font-bold w-full">Vendor</th>
                  <th className="px-4 py-2.5 font-bold whitespace-nowrap">Contact</th>
                  <th className="px-4 py-2.5 font-bold whitespace-nowrap">GSTIN</th>
                  <th className="px-4 py-2.5 font-bold whitespace-nowrap">Terms</th>
                  <th className="px-4 py-2.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <TableRowsSkeleton rows={5} cols={5} cellClassName="px-4 py-3.5" />
                ) : vendors.length ? vendors.map((v: any) => {
                  const contact = [v.phone, v.email].filter(Boolean).join(' · ');
                  return (
                    <tr key={v.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-4 py-3 max-w-[280px]">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 bg-emerald-50 text-emerald-600">
                            <Truck size={17} />
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate" title={v.name || undefined}>{v.name}</div>
                            {v.paymentTerms && <div className="text-[11px] text-slate-400 truncate">{v.paymentTerms}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-[220px]">
                        {contact ? <div className="truncate" title={contact}>{contact}</div> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap font-mono text-xs">
                        {v.gstin || <span className="text-slate-300 font-sans">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {v.paymentTerms || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip content="Edit vendor">
                            <Button variant="outline" size="icon" onClick={() => setEditVendor(v)}>
                              <Pencil size={13} />
                            </Button>
                          </Tooltip>
                          <Tooltip content="Delete vendor">
                            <Button variant="danger" size="icon" onClick={() => setDeleteTarget(v)}>
                              <Trash2 size={13} />
                            </Button>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <EmptyState
                        icon={<Truck size={28} />}
                        iconBg="bg-emerald-50 text-emerald-600"
                        title={search ? 'No matching vendors' : 'No vendors yet'}
                        description={search
                          ? 'No vendors match your search. Try a different name, email, or GSTIN.'
                          : 'Vendors are the suppliers you buy stock from. Add one so you can raise purchase orders and receive inventory against them.'}
                        action={search ? undefined : (
                          <Button leftIcon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
                            New vendor
                          </Button>
                        )}
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
      </div>

      <VendorModal open={createOpen} onClose={() => setCreateOpen(false)} mode="create" />
      <VendorModal open={!!editVendor} onClose={() => setEditVendor(null)} mode="edit" vendor={editVendor} />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete vendor"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => deleteMutation.mutate(deleteTarget.id)} loading={deleteMutation.isPending}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Delete <span className="font-bold">{deleteTarget?.name}</span>? Existing purchase orders keep their history, but you won&apos;t be able to raise new ones against this vendor.
        </p>
      </Modal>
    </>
  );
}

function VendorModal({ open, onClose, mode, vendor }: {
  open: boolean; onClose: () => void; mode: 'create' | 'edit'; vendor?: any;
}) {
  const qc = useQueryClient();
  const blank = { name: '', email: '', phone: '', gstin: '', paymentTerms: '' };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      name: vendor?.name || '',
      email: vendor?.email || '',
      phone: vendor?.phone || '',
      gstin: vendor?.gstin || '',
      paymentTerms: vendor?.paymentTerms || '',
    });
    setError('');
  }, [open, vendor]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload: any = {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        gstin: form.gstin || undefined,
        paymentTerms: form.paymentTerms || undefined,
      };
      return mode === 'create' ? vendorApi.create(payload) : vendorApi.update(vendor.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendors'] });
      setError('');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'New vendor' : 'Edit vendor'}
      description={mode === 'create' ? 'Add a supplier to raise purchase orders against' : 'Update vendor details'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setError(''); mutation.mutate(); }} loading={mutation.isPending} disabled={!form.name}>
            {mode === 'create' ? 'Create vendor' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Vendor name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Supplies Pvt Ltd" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Email" type="email" leftIcon={<Mail size={14} />} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="orders@acme.com" />
          <Input label="Phone" leftIcon={<Phone size={14} />} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98xxxxxxx" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="29ABCDE1234F1Z5" />
          <Input label="Payment terms" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} placeholder="Net 30" />
        </div>
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}
