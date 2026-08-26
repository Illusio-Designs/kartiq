'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { warehouseApi } from '@/lib/api';
import { TableRowsSkeleton } from '@/components/Shimmer';
import { StatRow } from '@/components/StatCards';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import {
  Button, Badge, Card, Modal, Input, Checkbox, EmptyState, Tooltip,
} from '@/components/ui';
import { toast } from '@/store/toast.store';
import { Plus, Store, MapPin, Pencil, Trash2, Search, Cloud, RefreshCw } from 'lucide-react';

// The pooled, Amazon-managed "Amazon FBA" facility — read-only in Kartriq.
function isVirtualFacility(w: any): boolean {
  return !!w?.isVirtual || w?.externalSource === 'AMAZON_FBA';
}

// A real (self-managed) warehouse whose address is not yet complete enough to
// print shipping labels. When a seller connects a channel we auto-create a
// "My Warehouse" location; it starts with a blank address that the seller must
// fill in before MFN/self-ship orders can be routed and labelled.
function isIncompleteReal(w: any): boolean {
  if (isVirtualFacility(w) || !w?.isActive) return false;
  const a = typeof w?.address === 'object' && w.address ? w.address : {};
  return !(a.line1 && a.city && a.pincode);
}

// Render the address (object or legacy string) as a short "City, State" line.
function locationLine(address: any): string {
  if (!address) return '';
  if (typeof address === 'object') {
    return [address.city, address.state].filter(Boolean).join(', ');
  }
  return String(address);
}
// Full address for the tooltip on the location cell.
function fullAddress(address: any): string {
  if (!address) return '';
  if (typeof address === 'object') {
    return [address.line1, address.city, address.state, address.pincode].filter(Boolean).join(', ');
  }
  return String(address);
}

export default function WarehousesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editWarehouse, setEditWarehouse] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [setupDismissed, setSetupDismissed] = useState(false);

  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehouseApi.list().then(r => r.data),
  });

  const allWarehouses = data || [];
  // The first real location still missing a shippable address (usually the
  // auto-created "My Warehouse" from connecting a channel).
  const incompleteWarehouse = useMemo(
    () => allWarehouses.find(isIncompleteReal) || null,
    [allWarehouses],
  );
  // Global topbar search first, then the in-table search on top of it.
  const globallyFiltered = useFilteredBySearch(allWarehouses, (w: any) =>
    `${w.name || ''} ${w.code || ''} ${w.address?.line1 || ''} ${w.address?.city || ''} ${w.address?.state || ''} ${w.address?.pincode || ''}`
  );
  const warehouses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return globallyFiltered;
    return globallyFiltered.filter((w: any) =>
      `${w.name || ''} ${w.code || ''} ${w.address?.city || ''}`.toLowerCase().includes(q)
    );
  }, [globallyFiltered, search]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => warehouseApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      setDeleteTarget(null);
    },
  });

  // Amazon has no "list my warehouses" API — FBA stock is pooled across its
  // fulfilment network. This ensures the single read-only "Amazon FBA" facility
  // exists so FBA inventory and orders always have a location to attach to.
  const syncFbaMutation = useMutation({
    mutationFn: () => warehouseApi.syncFba().then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('Amazon FBA facility is synced');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message || 'Could not sync Amazon facility'),
  });

  // Auto-open the setup popup once per browser session when there's a location
  // still missing its address — so a seller who just connected a channel is
  // nudged to finish it, but isn't nagged on every visit.
  const [setupPopupOpen, setSetupPopupOpen] = useState(false);
  useEffect(() => {
    if (!incompleteWarehouse) return;
    let seen = false;
    try { seen = sessionStorage.getItem('kq-wh-setup-seen') === '1'; } catch {}
    if (!seen) {
      setSetupPopupOpen(true);
      try { sessionStorage.setItem('kq-wh-setup-seen', '1'); } catch {}
    }
  }, [incompleteWarehouse]);

  const completeSetup = (w: any) => {
    setSetupPopupOpen(false);
    setEditWarehouse(w);
  };

  return (
    <>
      <div className="space-y-5 animate-slide-up">
        <PageHeader title="Warehouses" />

        <StatRow items={[
          { label: 'Locations', value: allWarehouses.length, tone: 'slate', icon: <Store size={16} /> },
          { label: 'Active', value: allWarehouses.filter((w: any) => w.isActive).length, tone: 'emerald', icon: <Store size={16} /> },
          { label: 'Amazon FBA', value: allWarehouses.filter(isVirtualFacility).length, tone: 'violet', icon: <Cloud size={16} />, hint: 'Read-only pooled facility' },
          { label: 'Incomplete address', value: allWarehouses.filter(isIncompleteReal).length, tone: 'amber', icon: <MapPin size={16} />, hint: 'Finish the address to print MFN labels' },
        ]} cols={4} />

        {/* Address-completion nudge for the auto-created location. Persists
            (unlike the one-time popup) until the address is filled in. */}
        {incompleteWarehouse && !setupDismissed && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-900">
            <span className="mt-0.5 flex-shrink-0 grid place-items-center w-8 h-8 rounded-lg bg-amber-100 text-amber-600">
              <MapPin size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Finish setting up “{incompleteWarehouse.name}”</p>
              <p className="mt-0.5 text-xs text-amber-800">
                We created this warehouse for you when you connected a channel. Add its
                full address (street, city &amp; pincode) so self-shipped (MFN) orders can be
                routed and labelled from here.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <Button size="sm" leftIcon={<Pencil size={13} />} onClick={() => completeSetup(incompleteWarehouse)}>
                  Complete address
                </Button>
                <Button size="sm" variant="ghost" className="text-amber-800 hover:bg-amber-100" onClick={() => setSetupDismissed(true)}>
                  Later
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* One card — header (subtitle + primary action) · toolbar · table.
            overflow-visible keeps any menus/tooltips from being clipped. */}
        <Card className="p-0 overflow-visible">
          {/* Header: subtitle + primary action, then a toolbar row with search */}
          <div className="p-3 sm:p-4 space-y-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium text-slate-500">
                {`${warehouses.length} fulfillment location${warehouses.length !== 1 ? 's' : ''}`}
              </p>
              <div className="flex items-center gap-2">
                <Tooltip content="Amazon FBA warehouses can't be listed via API — this adds the pooled, read-only Amazon FBA facility that FBA stock & orders attach to.">
                  <Button size="sm" variant="outline" leftIcon={<RefreshCw size={14} className={syncFbaMutation.isPending ? 'animate-spin' : ''} />} loading={syncFbaMutation.isPending} onClick={() => syncFbaMutation.mutate()}>
                    Sync Amazon FBA
                  </Button>
                </Tooltip>
                <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
                  New warehouse
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[180px] max-w-sm">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search warehouses…"
                  leftIcon={<Search size={14} />}
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-2.5 font-bold w-full">Warehouse</th>
                  <th className="px-4 py-2.5 font-bold whitespace-nowrap">Location</th>
                  <th className="px-4 py-2.5 font-bold whitespace-nowrap">Contact</th>
                  <th className="px-4 py-2.5 font-bold whitespace-nowrap">Status</th>
                  <th className="px-4 py-2.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <TableRowsSkeleton rows={5} cols={5} />
                ) : warehouses.length ? warehouses.map((w: any) => {
                  const loc = locationLine(w.address);
                  const contact = [w.phone, w.email].filter(Boolean).join(' · ');
                  const virtual = isVirtualFacility(w);
                  return (
                    <tr key={w.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className={`w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 ${virtual ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {virtual ? <Cloud size={17} /> : <Store size={17} />}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 truncate" title={w.name || undefined}>{w.name}</span>
                              {virtual && <Badge variant="amber">Amazon · System</Badge>}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono font-bold uppercase tracking-wider">{w.code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {loc ? (
                          <Tooltip content={fullAddress(w.address)}>
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin size={13} className="text-slate-400 flex-shrink-0" />
                              {loc}
                            </span>
                          </Tooltip>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-[200px]">
                        {contact ? <div className="truncate" title={contact}>{contact}</div> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant={w.isActive ? 'emerald' : 'slate'} dot>
                          {w.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {virtual ? (
                            <Tooltip content="Amazon-managed facility — read-only">
                              <span><Button variant="outline" size="icon" disabled><Cloud size={13} /></Button></span>
                            </Tooltip>
                          ) : (
                            <>
                              <Tooltip content="Edit warehouse">
                                <Button variant="outline" size="icon" onClick={() => setEditWarehouse(w)}>
                                  <Pencil size={13} />
                                </Button>
                              </Tooltip>
                              <Tooltip content="Delete warehouse">
                                <Button variant="danger" size="icon" onClick={() => setDeleteTarget(w)}>
                                  <Trash2 size={13} />
                                </Button>
                              </Tooltip>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <EmptyState
                        icon={<Store size={28} />}
                        iconBg="bg-emerald-50 text-emerald-600"
                        title={search ? 'No matching warehouses' : 'No warehouses yet'}
                        description={search
                          ? 'No warehouses match your search. Try a different name, code, or city.'
                          : 'Warehouses are physical locations where stock lives — your shop, a 3PL, or a home garage. Add one to start tracking inventory.'}
                        action={search ? undefined : (
                          <Button leftIcon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
                            New warehouse
                          </Button>
                        )}
                        tip={search ? undefined : "even single-location sellers should add at least one — it's how stock counts get tracked."}
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

      <WarehouseModal open={createOpen} onClose={() => setCreateOpen(false)} mode="create" />
      <WarehouseModal open={!!editWarehouse} onClose={() => setEditWarehouse(null)} mode="edit" warehouse={editWarehouse} />

      {/* One-time setup prompt shown when a location is missing its address. */}
      <Modal
        open={setupPopupOpen && !!incompleteWarehouse}
        onClose={() => setSetupPopupOpen(false)}
        title="Finish your warehouse setup"
        description="One quick step before you can ship self-fulfilled orders"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSetupPopupOpen(false)}>Not now</Button>
            <Button leftIcon={<MapPin size={14} />} onClick={() => incompleteWarehouse && completeSetup(incompleteWarehouse)}>
              Add address
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            We automatically created <span className="font-bold text-slate-900">“{incompleteWarehouse?.name}”</span> for
            you when you connected your channel, so your inventory has a home.
          </p>
          <p>
            To route and print labels for self-shipped <span className="font-semibold">(MFN)</span> orders, add its
            pickup address — street, city and pincode. It only takes a moment.
          </p>
        </div>
      </Modal>

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
    </>
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
