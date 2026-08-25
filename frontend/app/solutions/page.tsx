'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PublicLayout, usePublicLoading } from '@/components/layout/PublicLayout';
import { publicApi } from '@/lib/api';
import { getIcon } from '@/lib/icon';
import { Sparkles, ArrowRight, Check, LineChart } from 'lucide-react';

interface Solution {
  id: string;
  title: string;
  subtitle: string | null;
  icon: string | null;
  href: string | null;
  data: any;
}

// Anchor targets for the header "Solutions" mega menu (/solutions#<id>).
// The mega-menu links point here, so these ids MUST match the seeded
// NAV_LINK hrefs (multichannel, inventory, orders, warehouse, shipping,
// returns, analytics).
const CAPABILITIES = [
  { id: 'multichannel', icon: 'Globe',        title: 'Multi-channel Selling', desc: 'Sell on Amazon, Flipkart, Myntra and 56+ more marketplaces from one shared catalog.' },
  { id: 'inventory',    icon: 'Package',       title: 'Inventory Management',  desc: 'Real-time stock synced across every warehouse and sales channel — no more overselling.' },
  { id: 'orders',       icon: 'ShoppingCart',  title: 'Order Management',      desc: 'A single unified inbox for every order across every channel, with bulk actions.' },
  { id: 'warehouse',    icon: 'Warehouse',     title: 'Warehouse Operations',  desc: 'Pick, pack and ship from any location with smart routing and cycle counts.' },
  { id: 'shipping',     icon: 'Truck',         title: 'Shipping & Logistics',  desc: '16+ courier partners in one API, with automated label generation and tracking.' },
  { id: 'returns',      icon: 'RotateCcw',     title: 'Returns & Refunds',     desc: 'Automated RMA workflows and faster refunds that keep customers happy.' },
  { id: 'analytics',    icon: 'BarChart3',     title: 'Reports & Analytics',   desc: 'AI-powered insights on sales, stock health and profitability across channels.' },
];

const BUSINESS_MODELS = [
  {
    label: 'D2C brands',
    body: 'unify your Shopify store, marketplace listings and quick-commerce outlets.',
  },
  {
    label: 'Quick commerce',
    body: 'plug into Blinkit, Zepto, Swiggy Instamart and BB Now with live dark-store sync.',
  },
  {
    label: 'Multi-warehouse 3PL',
    body: 'smart routing, cycle counts and MCF support at scale.',
  },
];

export default function SolutionsPage() {
  const [items, setItems] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(true);
  usePublicLoading('solutions', loading);

  useEffect(() => {
    publicApi.content('SOLUTION')
      .then((r) => setItems(r.data || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PublicLayout>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-12">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-50 via-white to-white dark:from-emerald-500/10 dark:via-transparent dark:to-transparent" />
        <div className="max-w-3xl mx-auto px-6 text-center">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700">
            <Sparkles size={12} /> Solutions
          </span>
          <h1 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight text-slate-900 leading-[1.15]">
            Built for{' '}
            <span className="bg-gradient-to-r from-emerald-500 to-cyan-600 bg-clip-text text-transparent">
              how you sell.
            </span>
          </h1>
          <p className="mt-5 text-base md:text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
            Whether you&apos;re a D2C brand, a marketplace seller, or scaling an omnichannel
            operation &mdash; Kartriq fits every commerce playbook.
          </p>
        </div>
      </section>

      {/* ── Platform capabilities (mega-menu anchor targets) ─── */}
      <section className="pb-8">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <div className="text-xs font-bold uppercase tracking-[0.1em] text-emerald-700">Platform capabilities</div>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-slate-900">Everything you need to run commerce</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CAPABILITIES.map((c) => {
              const Icon = getIcon(c.icon);
              return (
                <div
                  key={c.id}
                  id={c.id}
                  className="scroll-mt-28 flex items-start gap-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 grid place-items-center text-emerald-600 shrink-0">
                    <Icon size={22} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900">{c.title}</h3>
                    <p className="mt-1 text-sm text-slate-600 leading-relaxed">{c.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Solutions grid (by vertical) ─────────────────────── */}
      <section className="pb-8">
        <div className="max-w-6xl mx-auto px-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-24 text-slate-500">
              <h2 className="text-xl font-bold text-slate-900 mb-2">No solutions listed yet</h2>
              A platform admin can add them at /admin/content.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((s) => {
                const Icon = getIcon(s.icon);
                return (
                  <Link
                    key={s.id}
                    /* Per-vertical detail pages (/solutions/d2c, …) don't exist yet,
                       so route these to Contact instead of 404-ing. */
                    href="/contact"
                    className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all"
                  >
                    <div className="h-24 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-600 grid place-items-center mb-4">
                      <span className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur grid place-items-center text-white">
                        <Icon size={24} />
                      </span>
                    </div>
                    <h3 className="font-bold text-lg text-slate-900 tracking-tight">{s.title}</h3>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">{s.subtitle}</p>
                    <div className="inline-flex items-center gap-1.5 mt-4 text-xs font-bold text-emerald-600 group-hover:translate-x-1 transition-transform">
                      Learn more <ArrowRight size={13} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── By business model ────────────────────────────────── */}
      <section className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="order-2 lg:order-1 min-h-[280px] rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-100 to-emerald-50/60 dark:from-emerald-500/20 dark:to-emerald-500/5 grid place-items-center text-emerald-700">
              <LineChart size={64} strokeWidth={1.4} />
            </div>
            <div className="order-1 lg:order-2">
              <div className="text-xs font-bold uppercase tracking-[0.1em] text-emerald-700">
                By business model
              </div>
              <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-slate-900 leading-tight max-w-[18ch]">
                Every playbook, one platform
              </h2>
              <ul className="mt-6 flex flex-col gap-4">
                {BUSINESS_MODELS.map((m) => (
                  <li key={m.label} className="flex gap-3 items-start text-[15px] text-slate-600 leading-relaxed">
                    <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 grid place-items-center text-emerald-700">
                      <Check size={13} strokeWidth={3} />
                    </span>
                    <span>
                      <b className="text-slate-900 font-bold">{m.label}</b> &mdash; {m.body}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
