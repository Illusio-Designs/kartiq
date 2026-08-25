'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { channelApi } from '@/lib/api';
import {
  ArrowLeft, Upload, Download, RefreshCw,
  Plug, AlertCircle, Trash2, KeyRound, CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { ConnectChannelModal } from '@/components/channels/ConnectChannelModal';
import { Badge, Button, Card, Tooltip, useConfirm } from '@/components/ui';
import { toast } from '@/store/toast.store';
import { DetailPageSkeleton } from '@/components/Shimmer';
import { formatDate, formatDateTime } from '@/lib/utils';
import { domainFor, logoDevUrl, iconHorseUrl, googleFaviconUrl, getChannelInitials } from '@/lib/channel-logos';

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
  const lastSync = channel.lastSyncAt ? formatDateTime(channel.lastSyncAt) : 'never';
  const listingCount = listings?.length || 0;
  const unmappedCount = (listings || []).filter((l: any) => !l.product).length;

  return (
    <DashboardLayout>
      {confirmUi}
      <div className="space-y-5 animate-slide-up max-w-5xl">
        <Link href="/channels" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} /> Back to Channels
        </Link>

        {/* Header card — channel identity, meta line, status badge + actions.
            Replaces the old gradient <h1> so dark mode works via the Card. */}
        <Card>
          <div className="flex items-center gap-4 p-5 flex-wrap">
            <ChannelLogo type={channel.type} name={channel.name} />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight truncate">{channel.name}</h1>
              <p className="text-xs text-slate-500 mt-1 truncate">
                {channel.type} · {channel.category}
                {channel.createdAt ? ` · connected ${formatDate(channel.createdAt)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {hasCredentials ? (
                <Badge variant="emerald" dot><CheckCircle2 size={12} /> Connected</Badge>
              ) : (
                <Badge variant="amber" dot>Not connected</Badge>
              )}
              <Button variant="secondary" size="sm" leftIcon={<KeyRound size={14} />} onClick={() => setConnectOpen(true)}>
                {hasCredentials ? 'Settings' : 'Connect'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="text-rose-600 hover:text-rose-700"
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
                Disconnect
              </Button>
            </div>
          </div>
        </Card>

        {/* Status banner */}
        {channel.syncError && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl p-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Last sync error</p>
              <p className="text-xs mt-0.5">{channel.syncError}</p>
            </div>
          </div>
        )}

        {!hasCredentials && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-3">
            <Plug size={16} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Not connected yet</p>
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

        {/* Action tiles — Sync Orders / Pull Catalog / Push Inventory. Each
            preserves its existing mutation, loading and disabled state. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ActionTile
            icon={RefreshCw}
            title="Sync Orders"
            info={`Last sync: ${lastSync}`}
            buttonLabel="Sync now"
            onClick={() => syncOrdersMutation.mutate()}
            loading={syncOrdersMutation.isPending}
            disabled={!hasCredentials}
          />
          <ActionTile
            icon={Download}
            title="Pull Catalog"
            info={`${listingCount} listing${listingCount === 1 ? '' : 's'} imported`}
            buttonLabel="Pull now"
            onClick={() => pullCatalogMutation.mutate()}
            loading={pullCatalogMutation.isPending}
            disabled={!hasCredentials}
          />
          <ActionTile
            icon={Upload}
            title="Push Inventory"
            info="Push current stock levels to this channel"
            buttonLabel="Push now"
            onClick={() => syncInventoryMutation.mutate()}
            loading={syncInventoryMutation.isPending}
            disabled={!hasCredentials}
          />
        </div>

        {/* Listings & SKU mapping */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Listings &amp; SKU mapping</h3>
              <p className="text-xs text-slate-500 mt-0.5">Link channel SKUs to Kartriq products</p>
            </div>
            {unmappedCount > 0 ? (
              <Badge variant="amber" dot>{unmappedCount} unmapped</Badge>
            ) : (
              <span className="text-sm text-slate-500">{listingCount} mapped</span>
            )}
          </div>
          {listings && listings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="px-5 py-2.5">Channel SKU</th>
                    <th className="px-5 py-2.5">Product</th>
                    <th className="px-5 py-2.5">Variant</th>
                    <th className="px-5 py-2.5 text-right">Channel price</th>
                    <th className="px-5 py-2.5">Mapping</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l: any) => (
                    <tr key={l.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-3 font-mono text-xs text-slate-700">{l.channelSku}</td>
                      <td className="px-5 py-3 font-medium text-slate-800">{l.product?.name || <span className="text-slate-400">—</span>}</td>
                      <td className="px-5 py-3 text-slate-500">{l.variant?.name || '—'}</td>
                      <td className="px-5 py-3 text-right text-slate-700 tabular-nums">₹{l.channelPrice}</td>
                      <td className="px-5 py-3">
                        {l.product ? (
                          <Badge variant="emerald" dot>Mapped</Badge>
                        ) : (
                          <Badge variant="slate" dot>Unmapped</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-400">
              No SKUs mapped yet. Use <span className="font-semibold text-slate-500">Pull Catalog</span> above to import this channel&apos;s products, or they map automatically as orders sync.
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}

// Action tile — a Card wrapping one of the sync/pull/push actions. The button
// carries the real loading/disabled state; when the channel is not connected
// the button is disabled and a tooltip explains why.
function ActionTile({
  icon: Icon, title, info, buttonLabel, onClick, loading, disabled,
}: {
  icon: any; title: string; info: string; buttonLabel: string;
  onClick: () => void; loading?: boolean; disabled?: boolean;
}) {
  const button = (
    <Button size="sm" onClick={onClick} loading={loading} disabled={disabled}>
      {buttonLabel}
    </Button>
  );
  return (
    <Card className="p-4 flex flex-col">
      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
        <Icon size={18} className={loading ? 'animate-spin' : ''} />
      </div>
      <h3 className="font-bold text-sm text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500 mt-0.5 mb-3 flex-1">{info}</p>
      {disabled ? (
        <Tooltip content="Connect this channel first" side="top">
          <span className="inline-flex">{button}</span>
        </Tooltip>
      ) : (
        button
      )}
    </Card>
  );
}

// Brand mark for the channel header. Tries logo.dev → icon.horse → Google
// favicon → gradient initials, mirroring the channels list logo. Sized to the
// prototype's 56px rounded tile.
function ChannelLogo({ type, name }: { type: string; name: string }) {
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0);
  const domain = useMemo(() => domainFor(type, name), [type, name]);

  const remoteSrc =
    stage === 0 ? logoDevUrl(domain)
    : stage === 1 ? iconHorseUrl(domain)
    : stage === 2 ? googleFaviconUrl(domain)
    : null;

  return (
    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 dark:bg-slate-800 dark:border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
      {stage === 3 ? (
        <div className="w-full h-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-base font-bold">
          {getChannelInitials(name)}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={remoteSrc as string}
          alt={name}
          width={112}
          height={112}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="w-full h-full object-contain p-1.5"
          onError={() => setStage((s) => Math.min(3, s + 1) as 0 | 1 | 2 | 3)}
        />
      )}
    </div>
  );
}
