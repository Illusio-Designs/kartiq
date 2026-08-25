'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { channelApi } from '@/lib/api';
import {
  ArrowLeft, Upload, Download, PackageSearch,
  Plug, AlertCircle, Trash2, KeyRound, CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { ConnectChannelModal } from '@/components/channels/ConnectChannelModal';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui';
import { toast } from '@/store/toast.store';
import { DetailPageSkeleton } from '@/components/Shimmer';

export default function ChannelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const qc = useQueryClient();
  const [connectOpen, setConnectOpen] = useState(false);
  const [confirmUi, askConfirm] = useConfirm();

  const { data: channel, isLoading } = useQuery({
    queryKey: ['channel', id],
    queryFn: () => channelApi.get(id).then(r => r.data),
  });

  const { data: listings } = useQuery({
    queryKey: ['channel-listings', id],
    queryFn: () => channelApi.listListings(id).then(r => r.data),
    enabled: !!channel,
  });

  const syncInventoryMutation = useMutation({
    mutationFn: () => channelApi.syncInventory(id),
    onSuccess: (res) => toast.success(`Inventory pushed: ${res.data.updated} updated, ${res.data.failed} failed`),
    onError: (err: any) => toast.error(err.response?.data?.details || err.response?.data?.error || err.message),
  });

  const syncOrdersMutation = useMutation({
    mutationFn: () => channelApi.syncOrders(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['channel', id] });
      const d = res.data || {};
      toast.success(`Orders synced: ${d.imported ?? 0} new${d.updated ? `, ${d.updated} updated` : ''}${d.skipped ? `, ${d.skipped} skipped` : ''}`);
    },
    onError: (err: any) => toast.error(err.response?.data?.details || err.response?.data?.error || err.message),
  });

  const pullCatalogMutation = useMutation({
    mutationFn: () => channelApi.pullCatalog(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['channel-listings', id] });
      const d = res.data || {};
      toast.success(`Catalog pulled: ${d.products ?? 0} products, ${d.inventory ?? 0} stock rows${d.failed ? `, ${d.failed} failed` : ''}`);
    },
    onError: (err: any) => toast.error(err.response?.data?.details || err.response?.data?.error || err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => channelApi.delete(id),
    onSuccess: () => router.push('/channels'),
  });

  if (isLoading || !channel) {
    return (
      <DashboardLayout>
        <DetailPageSkeleton />
      </DashboardLayout>
    );
  }

  const hasCredentials = !!channel.credentials;
  const lastSync = channel.lastSyncAt ? new Date(channel.lastSyncAt).toLocaleString() : 'never';

  return (
    <DashboardLayout>
      {confirmUi}
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/channels" className="p-1.5 hover:bg-gray-100 rounded-lg flex-shrink-0">
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent truncate">{channel.name}</h1>
              <p className="text-sm text-gray-500 truncate">
                {channel.type} · {channel.category} · Last sync: {lastSync}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {hasCredentials && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                <CheckCircle2 size={12} /> Connected
              </span>
            )}
            <Button variant="primary" leftIcon={<KeyRound size={14} />} onClick={() => setConnectOpen(true)}>
              {hasCredentials ? 'Update credentials' : 'Connect'}
            </Button>
            <Button
              variant="danger"
              leftIcon={<Trash2 size={14} />}
              onClick={async () => {
                const ok = await askConfirm({
                  title: 'Deactivate this channel?',
                  description: 'Order sync and inventory push will stop. You can reconnect it later.',
                  confirmLabel: 'Deactivate',
                  variant: 'danger',
                });
                if (ok) deleteMutation.mutate();
              }}
            >
              Deactivate
            </Button>
          </div>
        </div>

        {/* Status banner */}
        {channel.syncError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">
            <AlertCircle size={16} className="mt-0.5" />
            <div>
              <p className="font-medium">Last sync error</p>
              <p className="text-xs mt-0.5">{channel.syncError}</p>
            </div>
          </div>
        )}

        {!hasCredentials && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3">
            <Plug size={16} className="mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Not connected yet</p>
              <p className="text-xs mt-0.5">
                Enter your {channel.type} credentials to enable order sync, inventory push and webhooks.
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={() => setConnectOpen(true)}>
              Connect now
            </Button>
          </div>
        )}

        {connectOpen && (
          <ConnectChannelModal
            channelId={id}
            channelType={channel.type}
            channelName={channel.name}
            onClose={() => setConnectOpen(false)}
            onConnected={() => {
              setConnectOpen(false);
              qc.invalidateQueries({ queryKey: ['channel', id] });
            }}
          />
        )}

        {/* Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ActionCard
            icon={Download}
            title="Sync Orders"
            description="Pull the latest orders from this channel."
            onClick={() => syncOrdersMutation.mutate()}
            loading={syncOrdersMutation.isPending}
            disabled={!hasCredentials}
          />
          <ActionCard
            icon={PackageSearch}
            title="Pull Catalog"
            description="Import all of this channel's listings (with price & stock) into Kartriq."
            onClick={() => pullCatalogMutation.mutate()}
            loading={pullCatalogMutation.isPending}
            disabled={!hasCredentials}
          />
          <ActionCard
            icon={Upload}
            title="Push Inventory"
            description="Push current stock levels to this channel."
            onClick={() => syncInventoryMutation.mutate()}
            loading={syncInventoryMutation.isPending}
            disabled={!hasCredentials}
          />
        </div>

        {/* SKU Mappings */}
        <div className="bg-white rounded-xl border">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <h3 className="font-semibold text-gray-900">SKU Mappings</h3>
              <p className="text-xs text-gray-500">Link channel SKUs to Kartriq products</p>
            </div>
            <span className="text-sm text-gray-500">{listings?.length || 0} mapped</span>
          </div>
          {listings && listings.length > 0 ? (
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-gray-50 border-b text-left text-gray-500">
                <tr>
                  <th className="px-5 py-2 font-medium">#</th>
                  <th className="px-5 py-2 font-medium">Channel SKU</th>
                  <th className="px-5 py-2 font-medium">Product</th>
                  <th className="px-5 py-2 font-medium">Variant</th>
                  <th className="px-5 py-2 font-medium">Channel Price</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {listings.map((l: any, idx: number) => (
                  <tr key={l.id}>
                    <td className="px-5 py-3 text-gray-500 font-semibold">{idx + 1}</td>
                    <td className="px-5 py-3 font-mono text-xs">{l.channelSku}</td>
                    <td className="px-5 py-3">{l.product?.name}</td>
                    <td className="px-5 py-3 text-gray-500">{l.variant?.name || '—'}</td>
                    <td className="px-5 py-3">₹{l.channelPrice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-gray-400">
              No SKUs mapped yet. Use <span className="font-semibold text-gray-500">Pull Catalog</span> above to import this channel&apos;s products, or they map automatically as orders sync.
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function ActionCard({
  icon: Icon, title, description, onClick, loading, disabled,
}: {
  icon: any; title: string; description: string;
  onClick: () => void; loading?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="bg-white rounded-xl border p-5 text-left hover:shadow-md hover:border-emerald-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
        <Icon size={18} className={loading ? 'animate-spin' : ''} />
      </div>
      <h4 className="font-semibold text-sm text-gray-900">{title}</h4>
      <p className="text-xs text-gray-500 mt-0.5">{description}</p>
    </button>
  );
}
