'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { channelApi, oauthApi } from '@/lib/api';
import { TableRowsSkeleton } from '@/components/Shimmer';
import {
  Plug, Clock, Inbox, Sparkles, Lock, Plus, Layers,
  ShoppingBag, Zap, Truck, Globe, MessageCircle, Building2, ChevronRight, HelpCircle, Mail,
  Calculator, ScanLine, CreditCard, Receipt, Users, Undo2, Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { StatRow } from '@/components/StatCards';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SearchField } from '@/components/ui/SearchField';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { getSchemaForType } from '@/lib/channel-schemas';
import { ChannelLogo } from '@/components/channels/ChannelLogo';
import { MfnShippingPicker, type MfnChoice } from '@/components/channels/MfnShippingPicker';
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
  groupedUnder?: string;
  region?: string | null;
  addons?: Array<{ type: string; label: string; description?: string; regions: string[] | null; connectedChannels: Array<{ id: string; name: string }> }>;
  pendingRequest?: { id: string; status: string } | null;
};

export default function ChannelsPage() {
  const [statusFilter, setStatusFilter] = useState<'' | 'connected' | 'available' | 'not_available'>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [connectModal, setConnectModal] = useState<CatalogEntry | null>(null);
  const [requestModal, setRequestModal] = useState<CatalogEntry | null>(null);
  const [addonsModal, setAddonsModal] = useState<CatalogEntry | null>(null);
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
      // FBA / Smart Biz live inside the Amazon card as add-ons, not as own rows.
      if (e.groupedUnder) return false;
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

        <StatRow items={[
          { label: 'Connected', value: summary.connected ?? 0, tone: 'emerald', icon: <Plug size={16} /> },
          { label: 'Requested', value: (data?.catalog || []).filter((e: CatalogEntry) => e.pendingRequest).length, tone: 'amber', icon: <Clock size={16} />, hint: 'Integration requests awaiting review', href: '/channels/requests' },
          { label: 'Available', value: summary.available ?? 0, tone: 'blue', icon: <Sparkles size={16} /> },
          { label: 'In market', value: summary.total ?? 0, tone: 'slate', icon: <Layers size={16} /> },
        ]} cols={4} />

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
                className="flex-1 min-w-[180px] sm:min-w-[300px] max-w-md"
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
                  <TableRowsSkeleton rows={6} cols={5} />
                ) :rows.length ? rows.map(entry => (
                  <ChannelRow
                    key={entry.type}
                    entry={entry}
                    onConnect={() => setConnectModal(entry)}
                    onRequest={() => setRequestModal(entry)}
                    onAddons={() => setAddonsModal(entry)}
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
      {addonsModal && (
        <AddonsModal
          entry={addonsModal}
          onClose={() => setAddonsModal(null)}
          onSuccess={() => { setAddonsModal(null); qc.invalidateQueries({ queryKey: ['channels-catalog'] }); }}
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

function AddonPicker({
  addons, region, selected, onChange, disabled,
}: {
  addons: NonNullable<CatalogEntry['addons']>;
  region: string;
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const visible = addons.filter((a) => !a.connectedChannels.length && (!a.regions || a.regions.includes(region)));
  if (!visible.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Also enable (same Amazon account, no extra sign-in)</p>
      {visible.map((a) => (
        <label key={a.type} className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            disabled={disabled}
            checked={selected.includes(a.type)}
            onChange={(e) => onChange(e.target.checked ? [...selected, a.type] : selected.filter((t) => t !== a.type))}
          />
          <span>
            <span className="font-semibold text-slate-900">{a.label}</span>
            {a.description && <span className="block text-xs text-slate-500">{a.description}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

// Add FBA / Smart Biz to an already-connected Amazon channel.
function AddonsModal({
  entry, onClose, onSuccess,
}: { entry: CatalogEntry; onClose: () => void; onSuccess: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const parent = entry.connectedChannels?.[0];
  const region = entry.region || 'IN';
  const mutation = useMutation({
    mutationFn: () => channelApi.amazonAddons(parent!.id, selected),
    onSuccess,
    onError: (err: any) => setError(err.response?.data?.error || err.message),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Add Amazon services"
      description="FBA and Smart Biz reuse your connected Amazon account."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={mutation.isPending} disabled={!selected.length} onClick={() => { setError(''); mutation.mutate(); }}>
            Enable
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <AddonPicker addons={entry.addons || []} region={region} selected={selected} onChange={setSelected} />
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}

function ChannelRow({
  entry, onConnect, onRequest, onAddons,
}: {
  entry: CatalogEntry;
  onConnect: () => void;
  onRequest: () => void;
  onAddons: () => void;
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
            <div className="font-bold text-slate-900 truncate" title={entry.name}>{entry.name}</div>
            {entry.tagline && (
              <div className="text-xs text-slate-500 truncate max-w-[280px]" title={entry.tagline}>{entry.tagline}</div>
            )}
            {entry.addons && entry.status === 'connected' && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {entry.addons.map((a) => (
                  <Badge key={a.type} variant={a.connectedChannels.length ? 'emerald' : 'slate'}>
                    {a.label}{a.connectedChannels.length ? ' ✓' : ''}
                  </Badge>
                ))}
                {entry.addons.some((a) => !a.connectedChannels.length) && (
                  <button onClick={onAddons} className="text-xs font-semibold text-emerald-600 hover:underline">+ Add</button>
                )}
              </div>
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
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  // Amazon asks first how orders you ship yourself (MFN) get their courier.
  const isAmazon = oauthProvider === 'amazon';
  const [step, setStep] = useState<'mfn' | 'connect'>(isAmazon ? 'mfn' : 'connect');
  const [mfn, setMfn] = useState<MfnChoice>({ mfnShipping: 'AMAZON', shippingProviderId: null });
  const { data: logisticsData } = useQuery({
    queryKey: ['channels', 'LOGISTICS'],
    queryFn: () => channelApi.list({ category: 'LOGISTICS' }).then((r) => r.data),
    enabled: isAmazon,
  });
  const courierName = ((Array.isArray(logisticsData) ? logisticsData : logisticsData?.channels) || [])
    .find((c: any) => c.id === mfn.shippingProviderId)?.name;
  const mfnReady = mfn.mfnShipping === 'AMAZON' || !!mfn.shippingProviderId;

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
      if (isAmazon) await channelApi.update(channelId, { mfnShipping: mfn.mfnShipping, shippingProviderId: mfn.shippingProviderId });
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
            // Amazon: enable the ticked add-ons (FBA / Smart Biz) on the same credentials.
            if (selectedAddons.length) {
              try { await channelApi.amazonAddons(channelId, selectedAddons); } catch { /* shown in the channel list */ }
            }
            if (!isAmazon) setTimeout(onSuccess, 1000);
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
          {isAmazon && phase === 'success' ? (
            <Button variant="primary" onClick={onSuccess}>Done</Button>
          ) : isAmazon && step === 'mfn' ? (
            <>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="primary" disabled={!mfnReady} onClick={() => setStep('connect')}>Next</Button>
            </>
          ) : (<>
          <Button variant="ghost" onClick={isAmazon ? () => setStep('mfn') : onClose} disabled={busy}>{isAmazon ? 'Back' : 'Cancel'}</Button>
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
          </>)}
        </>
      }
    >
      {isAmazon && step === 'mfn' ? (
        <div className="space-y-3" data-testid="connect-mfn-step">
          <div className="text-xs font-semibold text-slate-500">Step 1 of 2</div>
          <h3 className="text-base font-bold text-slate-800">How do orders that you ship yourself (MFN) work?</h3>
          <p className="text-xs text-slate-500">Orders Amazon ships from its own warehouse (FBA) need nothing from you. You can change this later in Manage channel.</p>
          <MfnShippingPicker value={mfn} onChange={setMfn} />
        </div>
      ) : isAmazon && phase === 'success' ? (
        <div className="space-y-3" data-testid="connect-done-step">
          <div className="text-center text-3xl">✅</div>
          <h3 className="text-base font-bold text-slate-800 text-center">Amazon is connected</h3>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-1">
            <div>Orders you ship yourself: <b>{mfn.mfnShipping === 'AMAZON' ? 'Amazon arranges the courier' : `Your courier — ${courierName || 'selected'}`}</b></div>
            <div className="text-xs text-slate-500">On an order, press <b>Confirm</b> and the label appears — just print it.</div>
          </div>
        </div>
      ) : (
      <div className="space-y-4">
        {isAmazon && <div className="text-xs font-semibold text-slate-500">Step 2 of 2 — Authorise Amazon</div>}
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

        {entry.addons && (
          <AddonPicker
            addons={entry.addons}
            region={credentials.region || 'IN'}
            selected={selectedAddons}
            onChange={setSelectedAddons}
            disabled={phase !== 'idle'}
          />
        )}

        {phase === 'waiting' && (
          <p className="text-xs text-slate-500">
            A new tab opened for {entry.name} sign-in. Approve access there — this window updates automatically once it’s done.
          </p>
        )}

        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
      )}
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
  return <ChannelLogo type={type} name={name} />;
}
