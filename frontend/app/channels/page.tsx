'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchStore } from '@/store/search.store';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { channelApi, oauthApi } from '@/lib/api';
import {
  Plug, CheckCircle2, Circle, Clock, ExternalLink, Inbox, Sparkles, Lock,
  ShoppingBag, Zap, Truck, Globe, MessageCircle, Building2, Boxes, ChevronRight, HelpCircle, Mail,
  Calculator, ScanLine, CreditCard, Receipt, Users, Undo2, Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { Avatar } from '@/components/ui/Avatar';
import { getSchemaForType } from '@/lib/channel-schemas';
import { CategorySectionSkeleton } from '@/components/Shimmer';
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
  const [connectModal, setConnectModal] = useState<CatalogEntry | null>(null);
  const [requestModal, setRequestModal] = useState<CatalogEntry | null>(null);
  const qc = useQueryClient();

  // Topbar global search — case-insensitive substring match against the
  // channel name, type and tagline so "amaz" finds Amazon India / Amazon US,
  // "razor" finds Razorpay, etc.
  const searchQuery = useSearchStore((s) => s.query);

  const { data, isLoading } = useQuery({
    queryKey: ['channels-catalog'],
    queryFn: () => channelApi.catalog().then(r => r.data),
  });

  // Group catalog by category after filtering
  const grouped = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const all: CatalogEntry[] = (data?.catalog || []).filter((e: CatalogEntry) => {
      if (statusFilter && e.status !== statusFilter) return false;
      if (q) {
        const hay = `${e.name} ${e.type} ${e.tagline || ''} ${e.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const map: Record<string, CatalogEntry[]> = {};
    for (const entry of all) {
      if (!map[entry.category]) map[entry.category] = [];
      map[entry.category].push(entry);
    }
    return map;
  }, [data, statusFilter, searchQuery]);

  const summary = data?.summary || { total: 0, connected: 0, available: 0, not_available: 0 };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-slide-up">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 p-8 md:p-10 text-white shadow-2xl shadow-emerald-500/25">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-emerald-400/20 blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-1/3 w-72 h-72 rounded-full bg-cyan-400/15 blur-3xl translate-y-1/2" />

          <div className="relative flex items-end justify-between flex-wrap gap-6">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur text-xs font-semibold tracking-wide mb-4">
                <Sparkles size={12} /> {summary.total} CHANNELS IN MARKET
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
                Sell everywhere.<br />
                <span className="bg-gradient-to-r from-white to-emerald-300 bg-clip-text text-transparent">Ship anything.</span>
              </h1>
              <p className="text-white/80 text-sm md:text-base mt-3 leading-relaxed">
                Connect to {summary.total}+ marketplaces, quick-commerce, logistics, social shops and D2C platforms — all from one dashboard.
              </p>
            </div>

            <Link
              href="/channels/requests"
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 text-sm font-semibold rounded-xl transition-all"
            >
              <Inbox size={15} /> My Requests
            </Link>
          </div>

          <div className="relative mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
            <StatPill label="Connected"     value={summary.connected}     dot="bg-emerald-400" />
            <StatPill label="Available"     value={summary.available}     dot="bg-sky-400" />
            <StatPill label="Not Available" value={summary.not_available} dot="bg-amber-400" />
            <StatPill label="Total"         value={summary.total}         dot="bg-white" />
          </div>
        </div>

        {/* Quick-jump category nav */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {CATEGORY_ORDER.map(key => {
            const meta = CATEGORY_META[key];
            const count = grouped[key]?.length || 0;
            if (count === 0) return null;
            const Icon = meta.icon;
            return (
              <a
                key={key}
                href={`#category-${key}`}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 rounded-xl text-sm font-semibold whitespace-nowrap transition-all"
              >
                <Icon size={14} />
                {meta.label}
                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold">
                  {count}
                </span>
              </a>
            );
          })}
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-3 items-center sticky top-16 z-20 py-3 -my-3 bg-gradient-to-b from-slate-50/95 via-slate-50/95 to-transparent backdrop-blur-md">
          <div className="flex gap-1.5 p-1 bg-white border border-slate-200 rounded-xl">
            {[
              { key: '',              label: 'All' },
              { key: 'connected',     label: 'Connected' },
              { key: 'available',     label: 'Available' },
              { key: 'not_available', label: 'Soon' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key as any)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  statusFilter === f.key
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category sections */}
        {isLoading ? (
          <div className="space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <CategorySectionSkeleton key={i} />
            ))}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="card-premium p-16 text-center">
            <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 items-center justify-center mb-4">
              <Plug size={28} className="text-emerald-600" />
            </div>
            <h3 className="font-bold text-slate-900 text-lg">No channels match your filters</h3>
            <p className="text-slate-500 text-sm mt-1">Try different filters or search terms.</p>
          </div>
        ) : (
          CATEGORY_ORDER.filter(cat => grouped[cat]).map(category => (
            <CategorySection
              key={category}
              id={`category-${category}`}
              category={category}
              entries={grouped[category]}
              onConnect={setConnectModal}
              onRequest={setRequestModal}
            />
          ))
        )}
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
    </DashboardLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

function StatPill({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 bg-white/10 backdrop-blur-sm rounded-xl border border-white/10">
      <div className={`w-2 h-2 rounded-full ${dot} animate-pulse`} />
      <div>
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="text-[10px] font-semibold text-white/70 uppercase tracking-wider mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function CategorySection({
  id, category, entries, onConnect, onRequest,
}: {
  id: string;
  category: string;
  entries: CatalogEntry[];
  onConnect: (e: CatalogEntry) => void;
  onRequest: (e: CatalogEntry) => void;
}) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  const connectedCount = entries.filter(e => e.status === 'connected').length;

  return (
    <section
      id={id}
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${meta.bgGradient} border border-slate-200/70 shadow-[0_4px_24px_rgba(15,15,30,0.04)] p-6 md:p-7 ring-1 ${meta.ringColor} scroll-mt-24`}
    >
      {/* Decorative gradient blob */}
      <div className={`absolute -top-24 -right-24 w-80 h-80 rounded-full bg-gradient-to-br ${meta.gradient} opacity-10 blur-3xl pointer-events-none`} />

      {/* Section header */}
      <div className="relative flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center text-white shadow-xl`}>
            <Icon size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">{meta.label}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{meta.tagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge bg-white border border-slate-200 text-slate-700">
            {entries.length} channels
          </span>
          {connectedCount > 0 && (
            <span className="badge bg-emerald-50 border border-emerald-200 text-emerald-700">
              <CheckCircle2 size={11} /> {connectedCount} connected
            </span>
          )}
        </div>
      </div>

      {/* Channel grid */}
      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-3">
        {entries.map(entry => (
          <ChannelCard
            key={entry.type}
            entry={entry}
            onConnect={() => onConnect(entry)}
            onRequest={() => onRequest(entry)}
          />
        ))}
      </div>
    </section>
  );
}

function ChannelCard({
  entry, onConnect, onRequest,
}: {
  entry: CatalogEntry;
  onConnect: () => void;
  onRequest: () => void;
}) {
  const STATUS_PILLS: Record<string, { text: string; className: string }> = {
    connected:     { text: 'Connected',    className: 'bg-emerald-50 text-emerald-700' },
    available:     { text: 'Available',    className: 'bg-sky-50 text-sky-700' },
    plan_locked:   { text: 'Upgrade Plan', className: 'bg-slate-100 text-slate-600' },
    not_available: { text: 'Coming Soon',  className: 'bg-amber-50 text-amber-700' },
  };
  const pill = STATUS_PILLS[entry.status] || STATUS_PILLS.not_available;
  const connectedCount = entry.connectedChannels?.length || 0;

  // Logo strategy (matches /integrations and the home-page marquee): if a
  // bundled PNG exists in LOGO_OVERRIDES, prefer it; otherwise resolve a
  // brand domain and walk logo.dev → icon.horse → google favicon → gradient
  // initials. No PNG files need to live in /public/logos for new channels.

  // Single circular action on the right — visual weight reflects the call-to-action.
  const renderAction = () => {
    if (entry.status === 'connected' && entry.connectedChannels?.[0]) {
      return (
        <Link
          href={`/channels/${entry.connectedChannels[0].id}`}
          className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 flex-shrink-0 transition-colors"
          aria-label="Manage channel"
        >
          <ChevronRight size={18} />
        </Link>
      );
    }
    if (entry.status === 'available') {
      return (
        <button
          onClick={onConnect}
          className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 flex-shrink-0 transition-colors"
          aria-label="Connect channel"
        >
          <Plug size={16} />
        </button>
      );
    }
    if (entry.status === 'plan_locked') {
      return (
        <Link
          href="/dashboard/billing"
          className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center flex-shrink-0 transition-colors"
          aria-label="Upgrade plan"
        >
          <Lock size={16} />
        </Link>
      );
    }
    if (entry.pendingRequest) {
      return (
        <Tooltip content={`Request ${entry.pendingRequest.status.toLowerCase()}`}>
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
            <Clock size={16} />
          </div>
        </Tooltip>
      );
    }
    return (
      <button
        onClick={onRequest}
        className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center flex-shrink-0 transition-colors"
        aria-label="Request channel"
      >
        <Mail size={16} />
      </button>
    );
  };

  return (
    <div className="group bg-white rounded-2xl border border-slate-200/70 p-4 flex items-center gap-4 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200">
      {/* Logo */}
      <ChannelCardLogo type={entry.type} name={entry.name} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-slate-900 text-base leading-tight truncate">{entry.name}</h3>
          {entry.status === 'not_available' && entry.note ? (
            <Tooltip content={entry.note} side="left" wrap>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${pill.className}`}>
                {pill.text}
              </span>
            </Tooltip>
          ) : (
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${pill.className}`}>
              {pill.text}
              {entry.status === 'connected' && connectedCount > 1 && ` · ${connectedCount}`}
            </span>
          )}
        </div>
        {entry.tagline && (
          <p className="text-sm text-slate-500 leading-snug line-clamp-2">{entry.tagline}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          {entry.applyUrl && entry.status !== 'connected' && (
            <a
              href={entry.applyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-emerald-600 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              Apply for access <ExternalLink size={10} />
            </a>
          )}
          {entry.features && entry.features.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {entry.features.slice(0, 3).map((f) => (
                <span key={f} className="px-1.5 py-0.5 bg-slate-50 text-slate-500 text-[9px] font-bold rounded uppercase tracking-wide">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action */}
      {renderAction()}
    </div>
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
          <div className="bg-sky-50 border border-sky-200 text-sky-800 text-xs rounded-xl p-3">
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

// Logo component used by ChannelCard. Tries (in order):
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
    <div className="w-16 h-16 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
      {stage === 4 ? (
        <div className="w-full h-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-base font-bold">
          {getChannelInitials(name)}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stage === -1 && override ? override : (remoteSrc as string)}
          alt={name}
          width={128}
          height={128}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="w-full h-full object-contain p-1.5"
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
