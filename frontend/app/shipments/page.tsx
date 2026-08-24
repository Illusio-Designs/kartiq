'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { shipmentApi, orderApi, channelApi } from '@/lib/api';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import { Button, Badge, Card, Pagination, Select, Tooltip, Input, Modal, Loader, EmptyState } from '@/components/ui';
import { Truck, Package, MapPin, Eye, ExternalLink, Search, Plus, CheckCircle2, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const STATUS_FILTERS = [
  { value: '',                 label: 'All Statuses' },
  { value: 'PENDING',          label: 'Pending' },
  { value: 'PICKED_UP',        label: 'Picked Up' },
  { value: 'IN_TRANSIT',       label: 'In Transit' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { value: 'DELIVERED',        label: 'Delivered' },
  { value: 'FAILED',           label: 'Failed' },
  { value: 'RETURNED',         label: 'Returned' },
];

const STATUS_VARIANT: Record<string, any> = {
  PENDING:          'slate',
  PICKED_UP:        'blue',
  IN_TRANSIT:       'blue',
  OUT_FOR_DELIVERY: 'amber',
  DELIVERED:        'emerald',
  FAILED:           'rose',
  RETURNED:         'rose',
};

export default function ShipmentsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState('');
  const [trackModalOpen, setTrackModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [trackingInput, setTrackingInput] = useState('');
  const [trackResult, setTrackResult] = useState<any>(null);
  const [trackError, setTrackError] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['shipments', page, pageSize, status],
    queryFn: () => shipmentApi.list({ page, limit: pageSize, status: status || undefined }).then(r => r.data).catch(() => ({ shipments: [], total: 0 })),
  });

  const allShipments = data?.shipments || data || [];
  const shipments = useFilteredBySearch(allShipments, (s: any) =>
    `${s.orderNumber || ''} ${s.trackingNumber || ''} ${s.courierName || ''} ${s.status || ''}`
  );
  const total = data?.total || shipments.length;
  const delivered = shipments.filter((s: any) => s.status === 'DELIVERED').length;
  const inTransit = shipments.filter((s: any) => ['IN_TRANSIT', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(s.status)).length;

  const handleTrack = async () => {
    if (!trackingInput.trim()) return;
    setTrackLoading(true);
    setTrackResult(null);
    setTrackError('');
    try {
      // Find the shipment by AWB from our list or use a generic channel tracking
      const match = shipments.find((s: any) => s.trackingNumber === trackingInput.trim());
      if (match?.channelId) {
        const res = await channelApi.trackShipment(match.channelId, trackingInput.trim());
        setTrackResult(res.data);
      } else {
        // Fall back to local status from our records
        const res = await shipmentApi.list({ trackingNumber: trackingInput.trim() });
        const found = (res.data?.shipments || [])[0];
        if (found) setTrackResult({ status: found.status, awb: found.trackingNumber, courier: found.courierName });
        else setTrackError('No shipment found with this tracking number.');
      }
    } catch (e: any) {
      setTrackError(e.response?.data?.error || e.message || 'Tracking failed');
    } finally {
      setTrackLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up">
        <PageHeader
          title="Shipments"
          subtitle={`${total} shipments tracked`}
          actions={
            <>
              <Button variant="secondary" leftIcon={<Search size={14} />} onClick={() => { setTrackModalOpen(true); setTrackResult(null); setTrackError(''); setTrackingInput(''); }}>
                Track AWB
              </Button>
              <Button leftIcon={<Plus size={15} />} onClick={() => setCreateModalOpen(true)}>Create Shipment</Button>
            </>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total Shipments" value={total} icon={Package} color="emerald" />
          <StatCard label="In Transit"      value={inTransit} icon={Truck} color="sky" />
          <StatCard label="Delivered"       value={delivered} icon={MapPin} color="emerald" />
        </div>

        <Select value={status} onChange={setStatus} options={STATUS_FILTERS} />

        <Card className="overflow-hidden">
          {/* Mobile: card list */}
          <div className="md:hidden divide-y divide-slate-100">
            {isLoading ? <div className="p-4"><Loader size="sm" /></div> : shipments.length ? shipments.map((s: any) => (
              <div key={s.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="font-bold text-emerald-600 text-sm truncate">{s.orderNumber || s.order?.orderNumber || '—'}</div>
                  <div className="text-xs text-slate-500 truncate">{s.courierName || '—'}{s.trackingNumber ? ` · ${s.trackingNumber}` : ''}</div>
                  <div className="mt-1.5"><Badge variant={STATUS_VARIANT[s.status] || 'slate'} dot>{s.status}</Badge></div>
                </div>
                <div className="text-right flex-shrink-0 text-xs text-slate-500">
                  {s.charges ? <div className="text-sm font-bold text-slate-900">₹{s.charges}</div> : null}
                  {s.weight ? <div>{s.weight} kg</div> : null}
                  <div className="text-slate-400">{s.shippedAt ? new Date(s.shippedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</div>
                </div>
              </div>
            )) : <div className="p-8 text-center text-sm text-slate-400">No shipments.</div>}
          </div>
          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                  {['#', 'Order', 'Courier', 'AWB', 'Status', 'Weight', 'Charges', 'Shipped', 'Actions'].map((h, i) => (
                    <th key={h} className={`px-4 py-3 font-bold whitespace-nowrap ${i === 1 ? 'w-full' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr><td colSpan={9}><Loader size="sm" /></td></tr>
                ) : shipments.length ? shipments.map((s: any, idx: number) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-semibold">{(page - 1) * pageSize + idx + 1}</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">{s.orderNumber || s.order?.orderNumber || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{s.courierName}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{s.trackingNumber || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[s.status] || 'slate'} dot>{s.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{s.weight ? `${s.weight} kg` : '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{s.charges ? `₹${s.charges}` : '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {s.shippedAt ? new Date(s.shippedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {s.trackingNumber && (
                          <Tooltip content="Track AWB">
                            <Button variant="ghost" size="icon" onClick={() => { setTrackingInput(s.trackingNumber); setTrackModalOpen(true); setTrackResult(null); setTrackError(''); }}>
                              <Eye size={13} />
                            </Button>
                          </Tooltip>
                        )}
                        {s.trackingUrl && (
                          <Tooltip content="Track on courier site">
                            <a
                              href={s.trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-900"
                            >
                              <ExternalLink size={13} />
                            </a>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={9} className="p-0">
                      <EmptyState
                        icon={<Truck size={28} />}
                        iconBg="bg-emerald-50 text-emerald-600"
                        title="No shipments yet"
                        description="Add a tracking number to a confirmed order, or connect Shiprocket / Delhivery to pull shipments automatically."
                        action={
                          <Button leftIcon={<Plus size={14} />} onClick={() => setCreateModalOpen(true)}>
                            Create shipment
                          </Button>
                        }
                        secondaryAction={<span>or paste a tracking number above to look one up</span>}
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

      {/* Track AWB Modal */}
      <Modal
        open={trackModalOpen}
        onClose={() => setTrackModalOpen(false)}
        title="Track a Shipment"
        description="Enter an AWB / tracking number to see live status"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTrackModalOpen(false)}>Close</Button>
            <Button onClick={handleTrack} loading={trackLoading} disabled={!trackingInput.trim()}>Track</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Tracking Number (AWB)"
            leftIcon={<Truck size={14} />}
            value={trackingInput}
            onChange={(e) => { setTrackingInput(e.target.value); setTrackResult(null); setTrackError(''); }}
            placeholder="Paste AWB number…"
          />
          {trackError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
              <XCircle size={15} /> {trackError}
            </div>
          )}
          {trackResult && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-emerald-700 font-bold">
                <CheckCircle2 size={15} /> Shipment found
              </div>
              {trackResult.status && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status</span>
                  <Badge variant={STATUS_VARIANT[trackResult.status] || 'slate'} dot>{trackResult.status}</Badge>
                </div>
              )}
              {trackResult.courier && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Courier</span>
                  <span className="font-medium text-slate-700">{trackResult.courier}</span>
                </div>
              )}
              {trackResult.awb && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">AWB</span>
                  <span className="font-mono text-xs text-slate-700">{trackResult.awb}</span>
                </div>
              )}
              {trackResult.estimatedDelivery && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Est. Delivery</span>
                  <span className="font-medium text-slate-700">{new Date(trackResult.estimatedDelivery).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                </div>
              )}
              {trackResult.trackingUrl && (
                <a
                  href={trackResult.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:underline mt-1"
                >
                  <ExternalLink size={11} /> Track on courier site
                </a>
              )}
            </div>
          )}
        </div>
      </Modal>

      <CreateShipmentModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['shipments'] })} />
    </DashboardLayout>
  );
}

function CreateShipmentModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [orderId, setOrderId] = useState('');
  const [courierName, setCourierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [weight, setWeight] = useState('');
  const [charges, setCharges] = useState('');
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: () => shipmentApi.create({
      orderId,
      courierName,
      trackingNumber: trackingNumber || undefined,
      weight: weight ? Number(weight) : undefined,
      charges: charges ? Number(charges) : undefined,
    }),
    onSuccess: () => {
      onCreated();
      onClose();
      setOrderId(''); setCourierName(''); setTrackingNumber(''); setWeight(''); setCharges(''); setError('');
    },
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Shipment"
      description="Manually create a shipment record for an order"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => { setError(''); createMutation.mutate(); }}
            loading={createMutation.isPending}
            disabled={!orderId || !courierName}
          >
            Create Shipment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Paste the order UUID" />
        <Input label="Courier Name" value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="e.g. Delhivery, Shiprocket, BlueDart" />
        <Input label="AWB / Tracking Number" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Optional" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Weight (kg)" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.5" />
          <Input label="Charges (₹)" type="number" value={charges} onChange={(e) => setCharges(e.target.value)} placeholder="0" />
        </div>
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
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
