'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { warehouseApi } from '@/lib/api';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import {
  Button, Badge, Card, Modal, Input, Checkbox, EmptyState,
} from '@/components/ui';
import { Plus, Store, MapPin, Package, Pencil, Trash2 } from 'lucide-react';

export default function WarehousesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editWarehouse, setEditWarehouse] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehouseApi.list().then(r => r.data),
  });

  const allWarehouses = data || [];
  const warehouses = useFilteredBySearch(allWarehouses, (w: any) =>
    `${w.name || ''} ${w.code || ''} ${w.address?.line1 || ''} ${w.address?.city || ''} ${w.address?.state || ''} ${w.address?.pincode || ''}`
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => warehouseApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      setDeleteTarget(null);
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up">
        <PageHeader
          title="Warehouses"
          subtitle={`${warehouses.length} fulfillment locations`}
          actions={
            <Button leftIcon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
              New Warehouse
            </Button>
          }
        />

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="p-5 animate-shimmer h-48" />)}
          </div>
        ) : warehouses.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {warehouses.map((w: any) => (
              <Card key={w.id} className="p-6 hover:shadow-lg transition-shadow relative overflow-hidden">
                <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-emerald-100 blur-2xl opacity-50" />
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white shadow-lg">
                      <Store size={18} />
                    </div>
                    <Badge variant={w.isActive ? 'emerald' : 'slate'} dot>
                      {w.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <h3 className="font-bold text-slate-900 text-lg">{w.name}</h3>
                  <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mt-0.5">{w.code}</div>
                  {w.address && (
                    <div className="flex items-start gap-2 mt-3 text-xs text-slate-600">
                      <MapPin size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
                      <span>
                        {typeof w.address === 'object'
                          ? [w.address.line1, w.address.city, w.address.state, w.address.pincode].filter(Boolean).join(', ')
                          : w.address}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 flex-1">
                      <Package size={12} className="text-emerald-500" />
                      <span className="font-bold">{w.inventoryItems?.length || 0}</span> SKUs
                    </div>
                    <Button variant="ghost" size="sm" leftIcon={<Pencil size={11} />} onClick={() => setEditWarehouse(w)}>
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" leftIcon={<Trash2 size={11} />} onClick={() => setDeleteTarget(w)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon={<Store size={28} />}
              iconBg="bg-emerald-50 text-emerald-600"
              title="No warehouses yet"
              description="Warehouses are physical locations where stock lives — your shop, a 3PL, or a home garage. Add one to start tracking inventory."
              action={
                <Button leftIcon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
                  New warehouse
                </Button>
              }
              tip="even single-location sellers should add at least one — it's how stock counts get tracked."
              decorative
              size="lg"
            />
          </Card>
        )}
      </div>

      <WarehouseModal open={createOpen} onClose={() => setCreateOpen(false)} mode="create" />
      <WarehouseModal open={!!editWarehouse} onClose={() => setEditWarehouse(null)} mode="edit" warehouse={editWarehouse} />

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Warehouse"
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
          Delete <span className="font-bold">{deleteTarget?.name}</span>? Inventory records linked to this warehouse will also be removed.
        </p>
      </Modal>
    </DashboardLayout>
  );
}

function WarehouseModal({ open, onClose, mode, warehouse }: {
  open: boolean; onClose: () => void; mode: 'create' | 'edit'; warehouse?: any;
}) {
  const qc = useQueryClient();
  const addr = typeof warehouse?.address === 'object' ? warehouse.address : {};
  const [form, setForm] = useState({
    name:    warehouse?.name  || '',
    code:    warehouse?.code  || '',
    line1:   addr.line1   || '',
    city:    addr.city    || '',
    state:   addr.state   || '',
    pincode: addr.pincode || '',
    isActive: warehouse?.isActive ?? true,
  });
  const [error, setError] = useState('');

  // (Re)hydrate the form whenever the modal opens or the warehouse changes.
  useEffect(() => {
    if (!open) return;
    const a = typeof warehouse?.address === 'object' ? warehouse.address : {};
    setForm({
      name:    warehouse?.name  || '',
      code:    warehouse?.code  || '',
      line1:   a.line1   || '',
      city:    a.city    || '',
      state:   a.state   || '',
      pincode: a.pincode || '',
      isActive: warehouse?.isActive ?? true,
    });
    setError('');
  }, [open, warehouse]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        code: form.code,
        address: { line1: form.line1, city: form.city, state: form.state, pincode: form.pincode, country: 'India' },
        isActive: form.isActive,
      };
      return mode === 'create' ? warehouseApi.create(payload) : warehouseApi.update(warehouse.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      setError('');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'New Warehouse' : 'Edit Warehouse'}
      description={mode === 'create' ? 'Add a fulfillment location' : 'Update warehouse details'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => { setError(''); mutation.mutate(); }}
            loading={mutation.isPending}
            disabled={!form.name || !form.code}
          >
            {mode === 'create' ? 'Create Warehouse' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Warehouse Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Main Warehouse" />
          <Input label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WH-01" />
        </div>
        <Input label="Address Line" leftIcon={<MapPin size={14} />} value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} placeholder="Street, area, landmark" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Bangalore" />
          <Input label="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="Karnataka" />
          <Input label="Pincode" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} placeholder="560001" />
        </div>
        {mode === 'edit' && (
          <Checkbox
            label="Active warehouse"
            checked={form.isActive}
            onCheckedChange={(v) => setForm({ ...form, isActive: v })}
          />
        )}
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}
