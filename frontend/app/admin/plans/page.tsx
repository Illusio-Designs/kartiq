'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Plus, Edit2, Trash2, Save } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useConfirm } from '@/components/ui';

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [showNew, setShowNew] = useState(false);
  const [confirmUi, askConfirm] = useConfirm();

  const load = () => adminApi.plans().then((r) => setPlans(r.data));
  useEffect(() => { load(); }, []);

  const save = async (data: any) => {
    if (data.id) await adminApi.updatePlan(data.id, data);
    else await adminApi.createPlan(data);
    setEditing(null); setShowNew(false); load();
  };

  const del = async (id: string) => {
    const ok = await askConfirm({
      title: 'Deactivate this plan?',
      description: 'It will no longer be selectable on the pricing page. Existing subscribers stay on it.',
      confirmLabel: 'Deactivate',
      variant: 'danger',
    });
    if (!ok) return;
    await adminApi.deletePlan(id); load();
  };

  return (
    <div className="p-8">
      {confirmUi}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent">Plans</h1>
          <p className="text-slate-500 mt-1">Subscription tiers shown on the public pricing page.</p>
        </div>
        <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setShowNew(true)}>
          New plan
        </Button>
      </div>

      <Modal
        open={showNew || !!editing}
        onClose={() => { setEditing(null); setShowNew(false); }}
        title={editing ? 'Edit plan' : 'New plan'}
        size="xl"
      >
        <PlanForm
          initial={editing}
          onClose={() => { setEditing(null); setShowNew(false); }}
          onSave={save}
        />
      </Modal>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left p-3">#</th>
              <th className="text-left p-3">Code</th>
              <th className="text-left p-3">Name</th>
              <th className="text-right p-3">Monthly</th>
              <th className="text-right p-3">Yearly</th>
              <th className="text-right p-3">Features</th>
              <th className="text-center p-3">Active</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p, idx) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="p-3 text-slate-500 font-semibold">{idx + 1}</td>
                <td className="p-3 font-mono text-xs">{p.code}</td>
                <td className="p-3 font-semibold">{p.name}</td>
                <td className="p-3 text-right">₹{Number(p.monthlyPrice).toLocaleString()}</td>
                <td className="p-3 text-right">₹{Number(p.yearlyPrice).toLocaleString()}</td>
                <td className="p-3 text-right">{Object.values(p.features || {}).filter(Boolean).length}</td>
                <td className="p-3 text-center">{p.isActive ? '✅' : '—'}</td>
                <td className="p-3 flex gap-2 justify-end">
                  <Tooltip content="Edit plan">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(p)}>
                      <Edit2 size={14} />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Deactivate plan">
                    <Button variant="danger" size="icon" onClick={() => del(p.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlanForm({ initial, onClose, onSave }: {
  initial: any;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [f, setF] = useState<any>(initial || {
    code: '', name: '', tagline: '', monthlyPrice: 0, yearlyPrice: 0,
    features: {}, isPublic: true, isActive: true, sortOrder: 0,
  });
  const FEATURES = [
    'returns','vms','paymentReconciliation','mobileApp','purchaseManagement','barcoding',
    'inwardLogistics','customReports','apiIntegration','advancedWarehouseOps','vendorManagement',
    'omniChannel','erpIntegration',
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="Code" value={f.code ?? ''} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
        <Input label="Name" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="col-span-2">
          <Input label="Tagline" value={f.tagline ?? ''} onChange={(e) => setF({ ...f, tagline: e.target.value })} />
        </div>
        <Input label="Monthly price (₹)" type="number" value={f.monthlyPrice ?? ''} onChange={(e) => setF({ ...f, monthlyPrice: Number(e.target.value) })} />
        <Input label="Yearly price (₹)"  type="number" value={f.yearlyPrice ?? ''}  onChange={(e) => setF({ ...f, yearlyPrice: Number(e.target.value) })} />
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold text-slate-600 uppercase mb-2">Features</div>
        <div className="grid grid-cols-3 gap-2">
          {FEATURES.map((k) => (
            <Checkbox
              key={k}
              checked={!!f.features?.[k]}
              onCheckedChange={(c) => setF({ ...f, features: { ...f.features, [k]: c } })}
              label={k}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 flex gap-2 justify-end">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" leftIcon={<Save size={14} />} onClick={() => onSave(f)}>Save</Button>
      </div>
    </div>
  );
}
