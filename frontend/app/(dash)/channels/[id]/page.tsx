'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { channelApi, productApi } from '@/lib/api';
import {
  ArrowLeft, Upload, Download, RefreshCw,
  Plug, AlertCircle, Trash2, KeyRound, CheckCircle2,
  ShieldCheck, XCircle, Settings2, Save, Boxes, Search, Check, ChevronDown, Unlink,
} from 'lucide-react';
import Link from 'next/link';
import { ConnectChannelModal } from '@/components/channels/ConnectChannelModal';
import { Badge, Button, Card, Input, Select, Tooltip, useConfirm } from '@/components/ui';
import { toast } from '@/store/toast.store';
import { DetailPageSkeleton } from '@/components/Shimmer';
import { formatDate, formatDateTime, cn } from '@/lib/utils';
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

  // ── Catalog variants for the SKU-mapping picker ──
  const { data: productsData } = useQuery({
    queryKey: ['products-for-channel-map'],
    queryFn: () => productApi.list({ limit: 200 }).then(r => r.data),
    enabled: !!channel,
  });
  const variantOptions: VariantOption[] = useMemo(() =>
    ((productsData?.products || productsData || []) as any[])
      .flatMap((p: any) => (p.variants || []).map((v: any) => ({
        value: v.id,
        label: `${p.name} · ${v.sku || v.name || 'variant'}`,
        productId: p.id,
      }))), [productsData]);

  // ── SKU ↔ variant mapping mutations ──
  const createListingMutation = useMutation({
    mutationFn: (vars: { channelSku: string; variantId: string; productId?: string }) =>
      channelApi.createListing(id, vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel-listings', id] });
      toast.success('SKU mapped to variant');
    },
    onError: (err: any) => toast.error(err.response?.data?.details || err.response?.data?.error || err.message),
  });

  const deleteListingMutation = useMutation({
    mutationFn: (channelSku: string) => channelApi.deleteListing(id, channelSku),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel-listings', id] });
      toast.success('Mapping removed');
    },
    onError: (err: any) => toast.error(err.response?.data?.details || err.response?.data?.error || err.message),
  });

  // ── Settings (rename + default fulfilment) ──
  const [nameInput, setNameInput] = useState('');
  const [fulfilment, setFulfilment] = useState<'SELF' | 'CHANNEL'>('SELF');
  useEffect(() => {
    if (channel) {
      setNameInput(channel.name || '');
      setFulfilment(channel.defaultFulfillmentType === 'CHANNEL' ? 'CHANNEL' : 'SELF');
    }
    // Re-seed only when the channel identity changes, so refetches don't clobber edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  const updateChannelMutation = useMutation({
    mutationFn: (data: { name: string; defaultFulfillmentType: string }) => channelApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel', id] });
      toast.success('Channel settings saved');
    },
    onError: (err: any) => toast.error(err.response?.data?.details || err.response?.data?.error || err.message),
  });

  // ── Real connection test ──
  const [testState, setTestState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const testMutation = useMutation({
    mutationFn: () => channelApi.test(id),
    onSuccess: (res) => {
      setTestState('ok');
      const mk: string[] = res.data?.marketplaces || [];
      toast.success(mk.length ? `Verified · ${mk.join(', ')}` : 'Connection verified', 'Connected');
    },
    onError: (err: any) => {
      setTestState('fail');
      toast.error(err.response?.data?.details || err.response?.data?.error || err.message, 'Connection failed');
    },
  });

  // ── Amazon FBA / MCF on-hand inventory ──
  const [mcfRows, setMcfRows] = useState<any[] | null>(null);
  const mcfMutation = useMutation({
    mutationFn: () => channelApi.mcfInventory(id),
    onSuccess: (res) => setMcfRows(res.data || []),
    onError: (err: any) => {
      setMcfRows(null);
      toast.error(err.response?.data?.details || err.response?.data?.error || err.message);
    },
  });

  if (isLoading || !channel) {
    return <DetailPageSkeleton />;
  }

  const hasCredentials = !!channel.credentials;
  const isAmazon = channel.type === 'AMAZON_SMARTBIZ' || channel.type === 'AMAZON_FBA';
  const lastSync = channel.lastSyncAt ? formatDateTime(channel.lastSyncAt) : 'never';
  const listingCount = listings?.length || 0;
  const isMapped = (l: any) => !!(l.variantId || l.variant || l.product);
  const unmappedCount = (listings || []).filter((l: any) => !isMapped(l)).length;

  return (
    <>
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
              {testState === 'ok' && (
                <Badge variant="emerald" dot><ShieldCheck size={12} /> Verified</Badge>
              )}
              {testState === 'fail' && (
                <Badge variant="rose" dot><XCircle size={12} /> Verification failed</Badge>
              )}
              {hasCredentials && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<ShieldCheck size={14} />}
                  loading={testMutation.isPending}
                  onClick={() => testMutation.mutate()}
                >
                  Test connection
                </Button>
              )}
              <Button variant="secondary" size="sm" leftIcon={<KeyRound size={14} />} onClick={() => setConnectOpen(true)}>
                {hasCredentials ? 'Credentials' : 'Connect'}
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
                  {listings.map((l: any) => {
                    const mapped = isMapped(l);
                    const rowPending =
                      (createListingMutation.isPending && createListingMutation.variables?.channelSku === l.channelSku) ||
                      (deleteListingMutation.isPending && deleteListingMutation.variables === l.channelSku);
                    return (
                      <tr key={l.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3 font-mono text-xs text-slate-700">{l.channelSku}</td>
                        <td className="px-5 py-3 font-medium text-slate-800">
                          {mapped ? (
                            l.product?.name || <span className="text-slate-400">—</span>
                          ) : (
                            <VariantPicker
                              options={variantOptions}
                              loading={rowPending}
                              onPick={(variantId, productId) =>
                                createListingMutation.mutate({ channelSku: l.channelSku, variantId, productId })
                              }
                            />
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-500">{l.variant?.name || '—'}</td>
                        <td className="px-5 py-3 text-right text-slate-700 tabular-nums">
                          {l.channelPrice != null ? `₹${l.channelPrice}` : '—'}
                        </td>
                        <td className="px-5 py-3">
                          {mapped ? (
                            <div className="flex items-center gap-2">
                              <Badge variant="emerald" dot>Mapped</Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-rose-600 hover:text-rose-700"
                                leftIcon={<Unlink size={13} />}
                                loading={rowPending}
                                onClick={async () => {
                                  const ok = await askConfirm({
                                    title: 'Remove this mapping?',
                                    description: `SKU ${l.channelSku} will no longer be linked to a Kartriq variant.`,
                                    confirmLabel: 'Unmap',
                                    variant: 'danger',
                                  });
                                  if (ok) deleteListingMutation.mutate(l.channelSku);
                                }}
                              >
                                Unmap
                              </Button>
                            </div>
                          ) : (
                            <Badge variant="slate" dot>Unmapped</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-400">
              No SKUs mapped yet. Use <span className="font-semibold text-slate-500">Pull Catalog</span> above to import this channel&apos;s products, or they map automatically as orders sync.
            </div>
          )}
        </Card>

        {/* Amazon FBA / MCF on-hand inventory — Amazon channels only */}
        {isAmazon && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Boxes size={17} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">FBA inventory</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Amazon fulfilment-network on-hand quantities</p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw size={14} className={mcfMutation.isPending ? 'animate-spin' : ''} />}
                loading={mcfMutation.isPending}
                disabled={!hasCredentials}
                onClick={() => mcfMutation.mutate()}
              >
                Load FBA inventory
              </Button>
            </div>
            {mcfRows === null ? (
              <div className="p-8 text-center text-sm text-slate-400">
                Load on-hand FBA quantities to see what Amazon is holding for this channel.
              </div>
            ) : mcfRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">No FBA inventory returned for this channel.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <th className="px-5 py-2.5">SKU</th>
                      <th className="px-5 py-2.5">Product</th>
                      <th className="px-5 py-2.5 text-right">On hand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mcfRows.map((r: any, i: number) => (
                      <tr key={r.channelSku || r.sku || i} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3 font-mono text-xs text-slate-700">{r.channelSku || r.sku || '—'}</td>
                        <td className="px-5 py-3 text-slate-700">{r.name || r.productName || '—'}</td>
                        <td className="px-5 py-3 text-right text-slate-900 font-semibold tabular-nums">{r.quantity ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Channel settings — rename + default fulfilment */}
        <Card>
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Settings2 size={17} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Channel settings</h3>
              <p className="text-xs text-slate-500 mt-0.5">Rename this channel and set how its orders are fulfilled</p>
            </div>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Channel name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Amazon India"
            />
            <Select
              label="Default fulfilment type"
              fullWidth
              value={fulfilment}
              onChange={(v) => setFulfilment(v as 'SELF' | 'CHANNEL')}
              options={[
                { value: 'SELF', label: 'Self — you ship from your own stock' },
                { value: 'CHANNEL', label: 'Channel — the marketplace fulfils (FBA/MCF)' },
              ]}
            />
          </div>
          <div className="flex justify-end px-5 pb-5">
            <Button
              size="sm"
              leftIcon={<Save size={14} />}
              loading={updateChannelMutation.isPending}
              disabled={!nameInput.trim()}
              onClick={() => updateChannelMutation.mutate({ name: nameInput.trim(), defaultFulfillmentType: fulfilment })}
            >
              Save settings
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

type VariantOption = { value: string; label: string; productId: string };

// Inline searchable variant dropdown used on unmapped listing rows. Matches the
// shared Select's popover styling but adds a type-to-filter input, since the
// catalog can hold hundreds of variants.
function VariantPicker({
  options, onPick, loading,
}: {
  options: VariantOption[];
  onPick: (variantId: string, productId: string) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
    return list.slice(0, 50);
  }, [options, query]);

  return (
    <div ref={ref} className="relative w-full max-w-[280px]">
      <button
        type="button"
        disabled={loading}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center justify-between gap-2 w-full bg-white text-slate-500 border border-slate-200 hover:border-slate-300 transition-all',
          'focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 px-2.5 py-1 text-xs rounded-lg disabled:opacity-60'
        )}
      >
        <span className="truncate">{loading ? 'Mapping…' : 'Map to variant…'}</span>
        <ChevronDown size={14} className={cn('text-slate-400 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-900/10 z-50 animate-slide-up">
          <div className="p-1.5 border-b border-slate-100">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products…"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-400 text-center">No matching variants</p>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onPick(opt.value, opt.productId); setOpen(false); setQuery(''); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs text-left text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <span className="truncate">{opt.label}</span>
                  <Check size={13} className="text-emerald-600 opacity-0" />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
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
