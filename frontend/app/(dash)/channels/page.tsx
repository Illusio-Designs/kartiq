'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { channelApi, oauthApi } from '@/lib/api';
import {
  Plug, Clock, Inbox, Sparkles, Lock, Plus,
  ShoppingBag, Zap, Truck, Globe, MessageCircle, Building2, ChevronRight, HelpCircle, Mail,
  Calculator, ScanLine, CreditCard, Receipt, Users, Undo2, Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Loader } from '@/components/ui/Loader';
import { SearchField } from '@/components/ui/SearchField';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { getSchemaForType } from '@/lib/channel-schemas';
import { domainFor, logoDevUrl, iconHorseUrl, googleFaviconUrl, getChannelInitials } from '@/lib/channel-logos';

const CATEGORY_ORDER = [
  'ECOM', 'QUICKCOM', 'LOGISTICS', 'OWNSTORE', 'SOCIAL', 'B2B',
  'ACCOUNTING', 'POS_SYSTEM', 'PAYMENT', 'TAX', 'CRM', 'RETURNS', 'FULFILLMENT',
  'CUSTOM',
];

// Channel types whose logo file doesn't match the auto-derived slug —
// either the brand reuses an existing logo, or the file extension isn't .png.
const LOGO_OVERRIDES: Record<string, string> = {
  AMAZON_SMARTBIZ:   '/logos/amazon.png',
  BB_NOW:            '/logos/bigbasket.png',
  SWIGGY_INSTAMART:  '/logos/swiggy.png',
  PAYTM_MALL:        '/logos/paytm.png',
  WHATSAPP_BUSINESS: '/logos/whatsapp.png',
  ETSY:              '/logos/etsy.svg',
};

const CATEGORY_META: Record<string, {
  label: string;
  tagline: string;
  icon: any;
  gradient: string;
  bgGradient: string;
  ringColor: string;
}> = {
  ECOM: {
    label: 'E-commerce Marketplaces',
    tagline: 'Biggest players — Amazon, Flipkart, Myntra & more',
    icon: ShoppingBag,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-50',
    ringColor: 'ring-emerald-200/60',
  },
  QUICKCOM: {
    label: 'Quick Commerce',
    tagline: '10-minute delivery — Blinkit, Zepto, Swiggy Instamart',
    icon: Zap,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-50',
    ringColor: 'ring-emerald-200/60',
  },
  LOGISTICS: {
    label: 'Logistics & Shipping',
    tagline: 'Couriers & aggregators — ship with one click',
    icon: Truck,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-50',
    ringColor: 'ring-emerald-200/60',
  },
  OWNSTORE: {
    label: 'Own Store Platforms',
    tagline: 'Your D2C website — Shopify, WooCommerce, Magento',
    icon: Globe,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-50',
    ringColor: 'ring-emerald-200/60',
  },
  SOCIAL: {
    label: 'Social Commerce',
    tagline: 'Sell where your customers hang out',
    icon: MessageCircle,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-50',
    ringColor: 'ring-emerald-200/60',
  },
  B2B: {
    label: 'B2B Channels',
    tagline: 'Wholesale, distributors, bulk orders',
    icon: Building2,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-50',
    ringColor: 'ring-emerald-200/60',
  },
  CUSTOM: {
    label: 'Custom & Webhooks',
    tagline: 'Universal receivers for any system',
    icon: Sparkles,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-50',
    ringColor: 'ring-emerald-200/60',
  },
  ACCOUNTING: {
    label: 'Accounting & ERP',
    tagline: 'Tally, Zoho Books, QuickBooks, SAP & more',
    icon: Calculator,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-50',
    ringColor: 'ring-emerald-200/60',
  },
  POS_SYSTEM: {
    label: 'POS Systems',
    tagline: 'Shopify POS, Square, Lightspeed, GoFrugal & more',
    icon: ScanLine,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-50',
    ringColor: 'ring-emerald-200/60',
  },
  PAYMENT: {
    label: 'Payment Gateways',
    tagline: 'Razorpay, Stripe, PayU, Cashfree & more',
    icon: CreditCard,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-50',
    ringColor: 'ring-emerald-200/60',
  },
  TAX: {
    label: 'Tax & GST Compliance',
    tagline: 'ClearTax, GSTZen, IRP, Avalara & more',
    icon: Receipt,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-50',
    ringColor: 'ring-emerald-200/60',
  },
  CRM: {
    label: 'CRM & Marketing',
    tagline: 'HubSpot, Zoho CRM, Klaviyo, Mailchimp & more',
    icon: Users,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-50',
    ringColor: 'ring-emerald-200/60',
  },
  RETURNS: {
    label: 'Returns & Reverse Logistics',
    tagline: 'Return Prime, WeReturn, EasyVMS & more',
    icon: Undo2,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-50',
    ringColor: 'ring-emerald-200/60',
  },
  FULFILLMENT: {
    label: 'Fulfillment & 3PL',
    tagline: 'Amazon FBA, WareIQ, LogiNext & more',
    icon: Warehouse,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-50',
    ringColor: 'ring-emerald-200/60',
  },
};

// Status → Badge tint + label. Semantic variants read correctly in both themes
// via the .dark compat layer (no literal hex).
const STATUS_BADGE: Record<string, { variant: 'emerald' | 'blue' | 'amber' | 'slate'; label: string }> = {
  connected:     { variant: 'emerald', label: 'Connected' },
  available:     { variant: 'blue',    label: 'Available' },
  plan_locked:   { variant: 'slate',   label: 'Upgrade' },
  not_available: { variant: 'amber',   label: 'Coming soon' },
};

type CatalogEntry = {
  type: string;
  category: string;
  name: string;
  tagline?: string;
  status: 'connected' | 'available' | 'not_available' | 'plan_locked';
  integrated: boolean;
  comingSoon?: boolean;
  note?: string;
  requiresApproval?: boolean;
  manualOnly?: boolean;
  features?: string[];
  applyUrl?: string;
  docsUrl?: string;
  connectedChannels?: Array<{ id: string; name: string }>;
  pendingRequest?: { id: string; status: string } | null;
};

export default function ChannelsPage() {
  const [statusFilter, setStatusFilter] = useState<'' | 'connected' | 'available' | 'not_available'>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [connectModal, setConnectModal] = useState<CatalogEntry | null>(null);
  const [requestModal, setRequestModal] = useState<CatalogEntry | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['channels-catalog'],
    queryFn: () => channelApi.catalog().then(r => r.data),
  });

  // Flatten the catalog into table rows after filtering. The in-page search does
  // a case-insensitive substring match against the channel name, type, tagline
  // and category (key + label) so "amaz" finds Amazon, "razor" finds Razorpay,
  // "logistics" finds every courier, etc. The status segmented control and the
  // category Select narrow further. Rows stay grouped by CATEGORY_ORDER so the
  // table reads in the same order as the old card grid.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all: CatalogEntry[] = (data?.catalog || []).filter((e: CatalogEntry) => {
      if (statusFilter) {
        // "Available" also surfaces plan-locked channels (connect after upgrade).
        if (statusFilter === 'available') {
          if (e.status !== 'available' && e.status !== 'plan_locked') return false;
        } else if (e.status !== statusFilter) {
          return false;
        }
      }
      if (categoryFilter && e.category !== categoryFilter) return false;
      if (q) {
        const hay = `${e.name} ${e.type} ${e.tagline || ''} ${e.category} ${CATEGORY_META[e.category]?.label || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const rank = (c: string) => { const i = CATEGORY_ORDER.indexOf(c); return i === -1 ? 999 : i; };
    // Array.prototype.sort is stable, so within a category the catalog order holds.
    return [...all].sort((a, b) => rank(a.category) - rank(b.category));
  }, [data, statusFilter, search, categoryFilter]);

  const summary = data?.summary || { total: 0, connected: 0, available: 0, not_available: 0 };

  const statusFilters: { key: '' | 'connected' | 'available' | 'not_available'; label: string }[] = [
    { key: '',              label: 'All' },
    { key: 'connected',     label: 'Connected' },
    { key: 'available',     label: 'Available' },
    { key: 'not_available', label: 'Soon' },
  ];

  // Category Select options — every category present in the catalog, in
  // CATEGORY_ORDER, labelled from CATEGORY_META. Built off the full catalog so
  // the dropdown is stable regardless of the active search/status.
  const categoryOptions = useMemo(() => {
    const present = new Set<string>((data?.catalog || []).map((e: CatalogEntry) => e.category));
    const opts = CATEGORY_ORDER
      .filter(c => present.has(c))
      .map(c => ({ value: c, label: CATEGORY_META[c]?.label || c }));
    return [{ value: '', label: 'All categories' }, ...opts];
  }, [data]);

  return (
    <>
      <div className="space-y-5 animate-slide-up">
        <PageHeader title="Channels" />

        {/* One card — header (subtitle + actions + toolbar) then the table. */}
        <Card className="p-0 overflow-visible">
          <div className="p-3 sm:p-4 space-y-3 border-b border-slate-100 dark:border-slate-800">
            {/* Title row — subtitle left, actions right */}
            <div className="flex justify-between items-center flex-wrap gap-3">
              <p className="text-sm text-slate-500">
                {summary.total} channels in market · {summary.connected} connected
              </p>
              <div className="flex items-center gap-2">
                <Link href="/channels/requests">
                  <Button variant="secondary" size="sm" leftIcon={<Inbox size={15} />}>My Requests</Button>
                </Link>
                <Link href="/channels/requests">
                  <Button size="sm" leftIcon={<Plus size={15} />}>Request a channel</Button>
                </Link>
              </div>
            </div>

            {/* Toolbar — search + status segmented control + category filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Search channels — Amazon, Shopify, Delhivery…"
                shortcut="/"
                className="flex-1 min-w-[180px] max-w-sm"
              />
              <div className="hidden sm:block flex-1" />
              <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl">
                {statusFilters.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      statusFilter === f.key
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <Select
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={categoryOptions}
                placeholder="All categories"
                size="sm"
                className="min-w-[150px]"
              />
            </div>
          </div>

          {/* Table — flattened catalog. Scrolls horizontally on narrow screens. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50 border-b border-slate-100 dark:bg-slate-800/40 dark:border-slate-800">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-2.5 font-bold w-full">Channel</th>
                  <th className="px-3 py-2.5 font-bold whitespace-nowrap">Category</th>
                  <th className="px-3 py-2.5 font-bold whitespace-nowrap">Status</th>
                  <th className="px-3 py-2.5 font-bold whitespace-nowrap text-right">Connected</th>
                  <th className="px-4 py-2.5 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isLoading ? (
                  <tr><td colSpan={5} className="p-6"><Loader size="sm" /></td></tr>
                ) : rows.length ? rows.map(entry => (
                  <ChannelRow
                    key={entry.type}
                    entry={entry}
                    onConnect={() => setConnectModal(entry)}
                    onRequest={() => setRequestModal(entry)}
                  />
                )) : (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <div className="p-16 text-center">
                        <div className="inline-flex w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 items-center justify-center mb-4">
                          <Plug size={28} className="text-emerald-600" />
                        </div>
                        <h3 className="font-bold text-slate-900 text-lg">No channels match your filters</h3>
                        <p className="text-slate-500 text-sm mt-1">Try a different search term, status or category.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {connectModal && (
        <ConnectModal
          entry={connectModal}
          onClose={() => setConnectModal(null)}
          onSuccess={() => { setConnectModal(null); qc.invalidateQueries({ queryKey: ['channels-catalog'] }); }}
        />
      )}
      {requestModal && (
        <RequestModal
          entry={requestModal}
          onClose={() => setRequestModal(null)}
          onSuccess={() => { setRequestModal(null); qc.invalidateQueries({ queryKey: ['channels-catalog'] }); }}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

function ChannelRow({
  entry, onConnect, onRequest,
}: {
  entry: CatalogEntry;
  onConnect: () => void;
  onRequest: () => void;
}) {
  const badge = STATUS_BADGE[entry.status] || STATUS_BADGE.not_available;
  const connectedCount = entry.connectedChannels?.length || 0;

  // Single circular action on the right — visual weight reflects the CTA.
  // Mirrors the old card grid: manage · connect · upgrade · request/pending.
  const renderAction = () => {
    if (entry.status === 'connected' && entry.connectedChannels?.[0]) {
      return (
        <Link
          href={`/channels/${entry.connectedChannels[0].id}`}
          className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 flex-shrink-0 transition-colors"
          aria-label="Manage channel"
        >
          <ChevronRight size={16} />
        </Link>
      );
    }
    if (entry.status === 'available') {
      return (
        <button
          onClick={onConnect}
          className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 flex-shrink-0 transition-colors"
          aria-label="Connect channel"
        >
          <Plug size={15} />
        </button>
      );
    }
    if (entry.status === 'plan_locked') {
      return (
        <Link
          href="/dashboard/billing"
          className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center flex-shrink-0 transition-colors"
          aria-label="Upgrade plan"
        >
          <Lock size={15} />
        </Link>
      );
    }
    if (entry.pendingRequest) {
      return (
        <Tooltip content={`Request ${entry.pendingRequest.status.toLowerCase()}`}>
          <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
            <Clock size={15} />
          </div>
        </Tooltip>
      );
    }
    return (
      <button
        onClick={onRequest}
        className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center flex-shrink-0 transition-colors"
        aria-label="Request channel"
      >
        <Mail size={15} />
      </button>
    );
  };

  return (
    <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
      {/* Channel — logo chip + name (+ tagline) */}
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <ChannelCardLogo type={entry.type} name={entry.name} />
          <div className="min-w-0">
            <div className="font-bold text-slate-900 truncate">{entry.name}</div>
            {entry.tagline && (
              <div className="text-xs text-slate-500 truncate max-w-[280px]">{entry.tagline}</div>
            )}
          </div>
        </div>
      </td>

      {/* Category */}
      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
        {CATEGORY_META[entry.category]?.label || entry.category}
      </td>

      {/* Status pill */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        {entry.status === 'not_available' && entry.note ? (
          <Tooltip content={entry.note} side="top" wrap>
            <span><Badge variant={badge.variant} dot>{badge.label}</Badge></span>
          </Tooltip>
        ) : (
          <Badge variant={badge.variant} dot>{badge.label}</Badge>
        )}
      </td>

      {/* Connected count */}
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
        {connectedCount || '—'}
      </td>

      {/* Action */}
      <td className="px-4 py-2.5">
        <div className="flex justify-end">{renderAction()}</div>
      </td>
    </tr>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

function ConnectModal({
  entry, onClose, onSuccess,
}: { entry: CatalogEntry; onClose: () => void; onSuccess: () => void }) {
  // OAuth-capable channels (Amazon, Shopify, Flipkart, Meta, …) authorize in a
  // browser tab — the seller never pastes API keys. Non-OAuth channels keep the
  // manual paste form driven by the catalog's credentialsSchema.
  const oauthProvider = getSchemaForType(entry.type)?.oauth;

  const [name, setName] = useState(`My ${entry.name}`);
  const [credentials, setCredentials] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'idle' | 'authorizing' | 'waiting' | 'success'>('idle');

  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const popupRef = useRef<Window | null>(null);
  const doneRef = useRef(false);
  const channelIdRef = useRef<string | null>(null); // reuse the channel across retries
  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = undefined; } };
  useEffect(() => () => stopPoll(), []);

  const { data: detail } = useQuery({
    queryKey: ['channel-catalog-entry', entry.type],
    queryFn: () => channelApi.catalogEntry(entry.type).then(r => r.data),
  });

  // Manual paste flow (non-OAuth channels only)
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: created } = await channelApi.create({ name, type: entry.type, category: entry.category });
      await channelApi.connect(created.id, credentials);
      return created;
    },
    onSuccess,
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });

  const backendSchema = detail?.credentialsSchema || [];
  // Merge in `help` text from the frontend channel-schemas (single source of truth for tooltips)
  const frontendSchema = getSchemaForType(entry.type);
  const helpByKey = new Map((frontendSchema?.fields || []).map((f) => [f.key, f.help]));
  let schema = backendSchema.map((f: any) => ({ ...f, help: helpByKey.get(f.key) }));
  // For OAuth channels, drop the manual credential inputs (Seller ID, Refresh
  // Token, API keys) — keep only marketplace-selection fields the consent URL
  // needs (region / shop). The seller grants access in the browser instead.
  if (oauthProvider) schema = schema.filter((f: any) => f.key === 'region' || f.key === 'shop');

  const consentUrl = async (channelId: string): Promise<string> => {
    switch (oauthProvider) {
      case 'amazon':       return (await oauthApi.amazonStart(channelId, credentials.region)).data.url;
      case 'shopify':      return (await oauthApi.shopifyStart(channelId, credentials.shop)).data.url;
      case 'flipkart':     return (await oauthApi.flipkartStart(channelId)).data.url;
      case 'meta':         return (await oauthApi.metaStart(channelId)).data.url;
      case 'lazada':       return (await oauthApi.lazadaStart(channelId, credentials.region || 'SG')).data.url;
      case 'shopee':       return (await oauthApi.shopeeStart(channelId, credentials.region || 'SG')).data.url;
      case 'mercadolibre': return (await oauthApi.mercadoLibreStart(channelId, credentials.region || 'AR')).data.url;
      case 'allegro':      return (await oauthApi.allegroStart(channelId, false)).data.url;
      case 'wish':         return (await oauthApi.wishStart(channelId)).data.url;
      default: throw new Error(`OAuth for ${oauthProvider} is not supported yet`);
    }
  };

  const authorize = async () => {
    setError('');
    if (oauthProvider === 'shopify' && !credentials.shop) {
      setError('Enter your myshopify.com store domain first.');
      return;
    }
    setPhase('authorizing');
    try {
      // Create the channel once, then reuse it on retry so repeated Authorize
      // clicks don't create duplicate channels.
      if (!channelIdRef.current) {
        const { data: created } = await channelApi.create({ name, type: entry.type, category: entry.category });
        channelIdRef.current = created.id;
      }
      const channelId = channelIdRef.current!;
      const url = await consentUrl(channelId);

      // Open the provider's consent screen in a new browser tab.
      popupRef.current = window.open(url, '_blank');
      if (!popupRef.current) {
        setError('Your browser blocked the sign-in tab. Allow pop-ups for this site and click Authorize again.');
        setPhase('idle');
        return;
      }
      popupRef.current.focus?.();

      stopPoll();
      doneRef.current = false;
      setPhase('waiting');
      let attempts = 0;
      const MAX_ATTEMPTS = 90; // 90 × 2s = 3 min
      pollRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const r = await oauthApi.status(oauthProvider!, channelId);
          if (r.data.connected) {
            doneRef.current = true;
            stopPoll();
            setPhase('success');
            setTimeout(onSuccess, 1000);
            return;
          }
          if (r.data.error) { stopPoll(); setError(r.data.error); setPhase('idle'); return; }
        } catch { /* transient — keep polling */ }
        if (popupRef.current?.closed && !doneRef.current) {
          stopPoll();
          setPhase('idle');
          setError(`Sign-in tab closed before finishing. Click "Authorize with ${entry.name}" to try again.`);
          return;
        }
        if (attempts >= MAX_ATTEMPTS && !doneRef.current) {
          stopPoll();
          setPhase('idle');
          setError('Authorization timed out. Please retry and approve access in the new tab.');
        }
      }, 2000);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
      setPhase('idle');
    }
  };

  const busy = phase === 'authorizing' || phase === 'waiting' || createMutation.isPending;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Connect ${entry.name}`}
      description={entry.tagline}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          {oauthProvider ? (
            <Button
              variant="primary"
              loading={busy}
              disabled={phase === 'success'}
              onClick={authorize}
            >
              {phase === 'success' ? 'Connected'
                : phase === 'waiting' ? 'Waiting for authorization…'
                : `Authorize with ${entry.name}`}
            </Button>
          ) : (
            <Button
              variant="primary"
              loading={createMutation.isPending}
              onClick={() => { setError(''); createMutation.mutate(); }}
            >
              {createMutation.isPending ? 'Connecting…' : 'Connect Channel'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {entry.requiresApproval && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl p-3">
            ⚠️ This channel requires seller approval.{' '}
            {entry.applyUrl && (
              <a href={entry.applyUrl} target="_blank" rel="noreferrer" className="font-semibold underline">
                Apply here
              </a>
            )}{' '}
            before connecting.
          </div>
        )}

        {entry.manualOnly && (
          <div className="bg-sky-50 border border-sky-200 text-sky-800 dark:text-sky-300 text-xs rounded-xl p-3">
            ℹ️ This is a <span className="font-semibold">manual channel</span>. No external API to connect — once added, enter orders against it via the New Order form.
          </div>
        )}

        {oauthProvider && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-3">
            🔒 Secure sign-in — click <span className="font-semibold">Authorize with {entry.name}</span> and approve access in the new browser tab. No API keys to copy or paste.
          </div>
        )}

        <Field label="Channel Name" value={name} onChange={setName} required />
        {schema.map((field: any) => (
          <Field
            key={field.key}
            label={field.label}
            type={field.type}
            options={field.options}
            value={credentials[field.key] || ''}
            onChange={(v) => setCredentials((c) => ({ ...c, [field.key]: v }))}
            required={field.required}
            help={field.help}
          />
        ))}

        {phase === 'waiting' && (
          <p className="text-xs text-slate-500">
            A new tab opened for {entry.name} sign-in. Approve access there — this window updates automatically once it’s done.
          </p>
        )}

        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}

function RequestModal({
  entry, onClose, onSuccess,
}: { entry: CatalogEntry; onClose: () => void; onSuccess: () => void }) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const m = useMutation({
    mutationFn: () => channelApi.requestIntegration(entry.type, { notes }),
    onSuccess,
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Request ${entry.name}`}
      description="Tell us why you need it — our team reviews each request."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={m.isPending} onClick={() => { setError(''); m.mutate(); }}>
            {m.isPending ? 'Submitting…' : 'Submit Request'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Textarea
          label="Notes"
          placeholder="Use case, monthly volume, timeline, etc."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
        />
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}

function Field({
  label, value, onChange, type = 'text', options, required, help,
}: { label: string; value: any; onChange: (v: any) => void; type?: string; options?: string[]; required?: boolean; help?: string }) {
  const labelNode = (
    <span className="inline-flex items-center gap-1.5">
      <span>
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      {help && (
        <Tooltip content={help} side="top" wrap>
          <HelpCircle size={13} className="text-slate-400 hover:text-emerald-600 cursor-help" />
        </Tooltip>
      )}
    </span>
  );

  if (type === 'select') {
    return (
      <Select
        label={labelNode}
        value={value}
        onChange={(v) => onChange(v)}
        options={(options || []).map((o) => ({ value: o, label: o }))}
        placeholder="Select…"
        fullWidth
      />
    );
  }
  if (type === 'textarea') {
    return <Textarea label={labelNode} value={value} onChange={(e) => onChange(e.target.value)} rows={3} />;
  }
  return (
    <Input
      label={labelNode}
      type={type === 'password' ? 'password' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// Logo component used by the channel table. Tries (in order):
//   1. Bundled override PNG in LOGO_OVERRIDES (e.g. /logos/amazon.png)
//   2. logo.dev — brand-grade CDN keyed by domain
//   3. icon.horse — favicon CDN
//   4. Google favicon — last resort
//   5. Gradient-initials avatar — pure CSS, never errors
function ChannelCardLogo({ type, name }: { type: string; name: string }) {
  const override = LOGO_OVERRIDES[type];
  // Stage 0..3 represents which remote source to try; -1 means we already
  // succeeded on the override; 4 means fallback to gradient initials.
  const [stage, setStage] = useState<-1 | 0 | 1 | 2 | 3 | 4>(override ? -1 : 0);
  const domain = useMemo(() => domainFor(type, name), [type, name]);

  const remoteSrc =
    stage === 0 ? logoDevUrl(domain)
    : stage === 1 ? iconHorseUrl(domain)
    : stage === 2 ? googleFaviconUrl(domain)
    : null;

  return (
    <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 dark:bg-slate-800 dark:border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
      {stage === 4 ? (
        <div className="w-full h-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-[11px] font-bold">
          {getChannelInitials(name)}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stage === -1 && override ? override : (remoteSrc as string)}
          alt={name}
          width={72}
          height={72}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="w-full h-full object-contain p-1"
          style={{ imageRendering: 'auto' }}
          onError={() => {
            // -1 (override) → 0 (logo.dev), then walk the chain to 4 (initials)
            setStage((s) => {
              if (s === -1) return 0;
              return Math.min(4, (s as number) + 1) as 0 | 1 | 2 | 3 | 4;
            });
          }}
        />
      )}
    </div>
  );
}
