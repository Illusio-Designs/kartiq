'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { publicApi } from '@/lib/api';
import { useDemoTrigger } from '@/components/public/DemoTrigger';
import {
  domainFor, logoDevUrl, iconHorseUrl, googleFaviconUrl, getChannelInitials,
} from '@/lib/channel-logos';
import {
  Sparkles, Search, ShoppingBag, Zap, Truck, Globe, MessageCircle, Building2,
  Calculator, ScanLine, CreditCard, Receipt, Users, Undo2, Warehouse,
  CheckCircle2, Clock, ExternalLink, ArrowRight, Plug,
} from 'lucide-react';

type Item = {
  type: string;
  category: string;
  name: string;
  tagline?: string;
  integrated: boolean;
  comingSoon: boolean;
  requiresApproval?: boolean;
  manualOnly?: boolean;
  features?: string[];
  applyUrl?: string | null;
  docsUrl?: string | null;
};

const CATEGORY_META: Record<string, { label: string; tagline: string; icon: any }> = {
  ECOM:        { label: 'E-commerce',  tagline: 'Marketplaces',          icon: ShoppingBag },
  QUICKCOM:    { label: 'Quick Commerce', tagline: '10-minute delivery', icon: Zap },
  LOGISTICS:   { label: 'Logistics',   tagline: 'Couriers & aggregators', icon: Truck },
  OWNSTORE:    { label: 'Own Store',   tagline: 'Your D2C website',      icon: Globe },
  SOCIAL:      { label: 'Social',      tagline: 'Instagram, WhatsApp',   icon: MessageCircle },
  B2B:         { label: 'B2B',         tagline: 'Wholesale & distributor', icon: Building2 },
  ACCOUNTING:  { label: 'Accounting',  tagline: 'Tally, Zoho, QuickBooks', icon: Calculator },
  POS_SYSTEM:  { label: 'POS',         tagline: 'Point of sale',          icon: ScanLine },
  PAYMENT:     { label: 'Payments',    tagline: 'Razorpay, Stripe, PayU', icon: CreditCard },
  TAX:         { label: 'Tax',         tagline: 'GST, e-invoicing',       icon: Receipt },
  CRM:         { label: 'CRM',         tagline: 'HubSpot, Klaviyo',        icon: Users },
  RETURNS:     { label: 'Returns',     tagline: 'Reverse logistics',       icon: Undo2 },
  FULFILLMENT: { label: 'Fulfillment', tagline: 'FBA, 3PL networks',       icon: Warehouse },
  CUSTOM:      { label: 'Custom',      tagline: 'Webhooks & misc',         icon: Plug },
};

const CATEGORY_ORDER = [
  'ECOM', 'QUICKCOM', 'OWNSTORE', 'SOCIAL', 'LOGISTICS',
  'PAYMENT', 'ACCOUNTING', 'POS_SYSTEM', 'TAX', 'CRM',
  'RETURNS', 'FULFILLMENT', 'B2B', 'CUSTOM',
];

function ChannelLogo({ name, type }: { name: string; type: string }) {
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0);
  const domain = domainFor(type, name);
  const src =
    stage === 0 ? logoDevUrl(domain)
    : stage === 1 ? iconHorseUrl(domain)
    : googleFaviconUrl(domain);

  if (stage === 3) {
    return (
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-xs font-extrabold tracking-tight shadow-sm flex-shrink-0">
        {getChannelInitials(name)}
      </div>
    );
  }
  return (
    <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={name}
        width={96}
        height={96}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="w-full h-full object-contain p-1.5"
        onError={() => setStage((s) => Math.min(3, s + 1) as 0 | 1 | 2 | 3)}
      />
    </div>
  );
}

export default function IntegrationsPage() {
  const [data, setData] = useState<{ summary: any; items: Item[] } | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'soon'>('all');
  const { open: openDemo } = useDemoTrigger();

  useEffect(() => {
    publicApi.integrations()
      .then((r) => setData(r.data))
      .catch(() => setData({ summary: { total: 0, live: 0, comingSoon: 0 }, items: [] }));
  }, []);

  const filtered = useMemo(() => {
    if (!data?.items) return [];
    const q = search.trim().toLowerCase();
    return data.items.filter((it) => {
      if (activeCategory !== 'ALL' && it.category !== activeCategory) return false;
      if (statusFilter === 'live' && (it.comingSoon || !it.integrated)) return false;
      if (statusFilter === 'soon' && !it.comingSoon) return false;
      if (q && !it.name.toLowerCase().includes(q) && !(it.tagline || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, activeCategory, statusFilter, search]);

  const counts = useMemo(() => {
    if (!data?.items) return {} as Record<string, number>;
    const m: Record<string, number> = { ALL: data.items.length };
    for (const it of data.items) {
      m[it.category] = (m[it.category] || 0) + 1;
    }
    return m;
  }, [data]);

  return (
    <PublicLayout>
      <main className="bg-gradient-to-b from-white via-emerald-50/40 to-white dark:from-slate-950 dark:via-emerald-950/20 dark:to-slate-950">

        {/* ─── HERO ─────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden pt-20 pb-12">
          <div className="absolute top-0 right-0 w-[40rem] h-[40rem] rounded-full bg-emerald-200/30 blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
          <div className="absolute top-1/3 left-0 w-96 h-96 rounded-full bg-cyan-200/20 blur-3xl -translate-x-1/2 pointer-events-none" />

          <div className="relative max-w-5xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-5">
              <Sparkles size={12} /> {data?.summary?.total ?? 169} integrations
            </div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-slate-900 leading-[1.05]">
              Every channel that matters.<br />
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">One platform.</span>
            </h1>
            <p className="mt-5 text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Connect to {data?.summary?.live ?? 56}+ live marketplaces, logistics partners and store platforms — across India, Southeast Asia, Latin America, Europe and the Middle East.
            </p>

            <div className="mt-8 grid grid-cols-3 max-w-xl mx-auto gap-3">
              <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3">
                <div className="text-2xl font-bold text-emerald-600">{data?.summary?.live ?? '—'}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Live</div>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3">
                <div className="text-2xl font-bold text-amber-600">{data?.summary?.comingSoon ?? '—'}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Coming Soon</div>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3">
                <div className="text-2xl font-bold text-slate-900">{data?.summary?.total ?? '—'}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Total</div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── SEARCH + STATUS FILTER ─────────────────────────────── */}
        <section className="sticky top-0 z-20 bg-white/85 dark:bg-slate-900/80 backdrop-blur-md border-y border-slate-200 py-3">
          <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px] bg-slate-100 rounded-xl px-3 py-2">
              <Search size={16} className="text-slate-400" />
              <input
                type="text"
                placeholder="Search Walmart, Lazada, Razorpay…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400"
              />
            </div>
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
              {[
                { key: 'all',  label: 'All' },
                { key: 'live', label: 'Live' },
                { key: 'soon', label: 'Coming Soon' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key as any)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    statusFilter === f.key
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category tabs */}
          <div className="max-w-5xl mx-auto px-6 mt-2 flex gap-1.5 overflow-x-auto pb-1">
            <CategoryTab id="ALL" label="All" count={counts.ALL || 0} active={activeCategory === 'ALL'} onClick={() => setActiveCategory('ALL')} />
            {CATEGORY_ORDER.filter((c) => counts[c]).map((c) => (
              <CategoryTab
                key={c}
                id={c}
                label={CATEGORY_META[c]?.label || c}
                count={counts[c]}
                active={activeCategory === c}
                onClick={() => setActiveCategory(c)}
              />
            ))}
          </div>
        </section>

        {/* ─── CHANNEL GRID ───────────────────────────────────────── */}
        <section className="py-10">
          <div className="max-w-6xl mx-auto px-6">
            {!data ? (
              <div className="text-center py-20 text-slate-500">Loading integrations…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-slate-600 font-semibold">No matches.</p>
                <p className="text-sm text-slate-500 mt-1">Try a different search or category.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    {activeCategory === 'ALL' ? 'All channels' : (CATEGORY_META[activeCategory]?.label || activeCategory)}
                  </h2>
                  <span className="text-xs font-bold text-slate-500">
                    {filtered.length} {filtered.length === 1 ? 'channel' : 'channels'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filtered.map((it) => (
                    <ChannelTile key={it.type} item={it} />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* ─── CTA ────────────────────────────────────────────────── */}
        <section className="py-20">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              Ready to connect your stores?
            </h2>
            <p className="mt-3 text-slate-600">
              Sign up free, connect your first channel in under 5 minutes, and start syncing orders + inventory automatically.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-sm font-bold rounded-full shadow-lg shadow-emerald-500/30 hover:-translate-y-0.5 transition-all"
              >
                Try Kartriq Free <ArrowRight size={14} />
              </Link>
              <button
                type="button"
                onClick={() => openDemo({ source: 'demo', subject: 'Integrations inquiry' })}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 hover:border-emerald-300 text-sm font-bold rounded-full transition-all"
              >
                Schedule a Demo
              </button>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}

function CategoryTab({ id, label, count, active, onClick }: { id: string; label: string; count: number; active: boolean; onClick: () => void; }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
        active
          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20'
          : 'bg-white border border-slate-200 text-slate-600 hover:border-emerald-300'
      }`}
      data-category={id}
    >
      {label}
      <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
        active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
      }`}>{count}</span>
    </button>
  );
}

function ChannelTile({ item }: { item: Item }) {
  const isLive = item.integrated && !item.comingSoon;
  const pill = isLive
    ? { text: 'Live',         className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : { text: 'Coming Soon',  className: 'bg-amber-50 text-amber-700 border-amber-200' };

  return (
    <div className="group bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3 hover:shadow-xl hover:-translate-y-0.5 hover:border-emerald-300 transition-all duration-200">
      <ChannelLogo name={item.name} type={item.type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-slate-900 text-sm leading-tight truncate">{item.name}</h3>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border whitespace-nowrap ${pill.className}`}>
            {isLive ? <CheckCircle2 size={9} className="inline mr-0.5 -mt-0.5" /> : <Clock size={9} className="inline mr-0.5 -mt-0.5" />}
            {pill.text}
          </span>
        </div>
        {item.tagline && (
          <p className="text-xs text-slate-500 mt-0.5 leading-snug line-clamp-2">{item.tagline}</p>
        )}
        {item.applyUrl && (
          <a
            href={item.applyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-slate-500 hover:text-emerald-600 transition-colors"
          >
            Apply for access <ExternalLink size={9} />
          </a>
        )}
      </div>
    </div>
  );
}
