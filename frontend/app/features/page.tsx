'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PublicLayout, usePublicLoading } from '@/components/layout/PublicLayout';
import { publicApi } from '@/lib/api';
import { getIcon } from '@/lib/icon';
import { Sparkles, ArrowRight, Check, Boxes } from 'lucide-react';

interface Feature {
  id: string;
  title: string;
  subtitle: string | null;
  icon: string | null;
  category: string | null;
}

export default function FeaturesPage() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  usePublicLoading('features', loading);

  useEffect(() => {
    publicApi.content('FEATURE')
      .then((r) => setFeatures(r.data || []))
      .finally(() => setLoading(false));
  }, []);

  const grouped: Record<string, Feature[]> = {};
  for (const f of features) {
    const k = f.category || 'Features';
    (grouped[k] ||= []).push(f);
  }
  const categories = Object.keys(grouped);

  return (
    <PublicLayout>
      {/* ── Page head ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 pb-8">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-50 via-white to-white dark:from-emerald-950/20 dark:via-transparent dark:to-transparent" />
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-emerald-700 uppercase tracking-[0.08em] shadow-sm">
            <Sparkles size={12} /> Features
          </div>
          <h1 className="mt-5 text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-[1.05]">
            Everything you need to <span className="gradient-text">run commerce.</span>
          </h1>
          <p className="mt-5 text-base md:text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
            One platform for multi-channel inventory, orders, warehousing, finance and analytics
            &mdash; from listing to payout.
          </p>
        </div>
      </section>

      {/* ── Feature grid, grouped by category ─────────────────────── */}
      <section className="pt-6 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 bg-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : features.length === 0 ? (
            <div className="text-center py-24">
              <h2 className="text-xl font-bold text-slate-900">No features listed yet</h2>
              <p className="text-slate-500 mt-2">A platform admin can add features at /admin/content.</p>
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat} className="mb-10">
                {categories.length > 1 && (
                  <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em] mb-3.5">
                    {cat}
                  </h2>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {grouped[cat].map((f) => {
                    const Icon = getIcon(f.icon);
                    return (
                      <div
                        key={f.id}
                        className="group bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:-translate-y-1 hover:shadow-xl hover:border-emerald-300 transition-all duration-200"
                      >
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                          <Icon size={22} className="text-white" />
                        </div>
                        <h3 className="mt-4 font-bold text-lg text-slate-900 tracking-tight">{f.title}</h3>
                        <p className="text-sm text-slate-600 mt-2 leading-relaxed">{f.subtitle}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── Inventory split ───────────────────────────────────────── */}
      <section className="pb-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.1em] text-emerald-700">Inventory</div>
              <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-slate-900 leading-[1.1] max-w-[18ch]">
                One stock pool, always accurate
              </h2>
              <ul className="mt-5 flex flex-col gap-3.5">
                {[
                  { b: 'Real-time sync', t: 'across every channel — stock updates the moment an order lands.' },
                  { b: 'Multi-warehouse', t: 'allocation with low-stock and reorder alerts.' },
                  { b: 'Bundle & variant', t: 'aware — never oversell a shared component.' },
                ].map((item) => (
                  <li key={item.b} className="flex gap-3 items-start text-[15px] text-slate-600 leading-relaxed">
                    <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Check size={13} className="text-emerald-700" strokeWidth={3} />
                    </span>
                    <span>
                      <b className="font-bold text-slate-900">{item.b}</b> {item.t}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-full shadow-lg shadow-emerald-500/30 transition-colors"
                >
                  Start free trial <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-100 to-emerald-50 min-h-[280px] flex items-center justify-center">
              <Boxes size={64} strokeWidth={1.4} className="text-emerald-600" />
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
