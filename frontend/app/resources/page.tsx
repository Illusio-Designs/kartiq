'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PublicLayout, usePublicLoading } from '@/components/layout/PublicLayout';
import { publicApi } from '@/lib/api';
import { getIcon } from '@/lib/icon';
import { Sparkles, ArrowRight } from 'lucide-react';
import { ResourceTileSkeleton } from '@/components/Shimmer';

interface Tile {
  id: string;
  title: string;
  subtitle: string | null;
  icon: string | null;
  href: string | null;
  data: any;
}

// Curated blog roll — real Kartriq playbooks & product updates from the approved design.
const POSTS = [
  { date: 'Aug 2026', tag: 'Guide', title: 'Connecting Amazon SP-API the right way' },
  { date: 'Aug 2026', tag: 'Playbook', title: 'Cut RTO on COD orders with address scoring' },
  { date: 'Jul 2026', tag: 'Case study', title: 'How Bloom & Bee scaled to 6 channels' },
  { date: 'Jul 2026', tag: 'Docs', title: 'Inventory & bundles: how shared stock stays accurate' },
  { date: 'Jun 2026', tag: 'Guide', title: 'PAYG & wallet, demystified — no billing surprises' },
];

export default function ResourcesPage() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [loading, setLoading] = useState(true);
  usePublicLoading('resources', loading);

  useEffect(() => {
    publicApi.content('RESOURCE_TILE')
      .then((r) => setTiles(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <PublicLayout>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 pb-10">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-50 via-white to-white dark:from-emerald-500/10 dark:via-transparent dark:to-transparent" />
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-emerald-700 uppercase tracking-[0.14em] shadow-sm">
            <Sparkles size={12} /> Resources
          </div>
          <h1 className="mt-5 text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.05]">
            Learn. Build.{' '}
            <span className="bg-gradient-to-r from-emerald-500 to-teal-400 bg-clip-text text-transparent">Scale.</span>
          </h1>
          <p className="mt-5 text-base md:text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
            Guides, tutorials, case studies, and product updates — everything you need to succeed with Kartriq.
          </p>
        </div>
      </section>

      {/* ── Resource category cards ──────────────────────────────────── */}
      <section className="pt-4 pb-6">
        <div className="max-w-6xl mx-auto px-6">
          {tiles.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <ResourceTileSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
              {tiles.map((t) => {
                const Icon = getIcon(t.icon);
                return (
                  <Link
                    key={t.id}
                    href={t.href || '#'}
                    className="group block bg-white rounded-2xl border border-slate-200 overflow-hidden hover:-translate-y-1 hover:border-emerald-300 hover:shadow-xl transition-all"
                  >
                    <div className="h-28 flex items-center justify-center bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-400 dark:from-emerald-500 dark:via-teal-500 dark:to-cyan-400">
                      <span className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                        <Icon size={26} className="text-white" />
                      </span>
                    </div>
                    <div className="p-5">
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-emerald-600">
                        Resource
                      </div>
                      <h3 className="mt-1.5 font-bold text-[15px] leading-snug text-slate-900 group-hover:text-emerald-700 transition-colors">
                        {t.title}
                      </h3>
                      {t.subtitle && (
                        <p className="mt-2 text-[13px] text-slate-600 leading-relaxed line-clamp-2">{t.subtitle}</p>
                      )}
                      <div className="inline-flex items-center gap-1.5 mt-4 text-xs font-bold text-emerald-600 group-hover:translate-x-1 transition-transform">
                        Explore <ArrowRight size={12} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── From the blog ────────────────────────────────────────────── */}
      <section className="pt-10 pb-24">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-xs font-bold uppercase tracking-[0.1em] text-emerald-600">From the blog</div>
          <h2 className="mt-3 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
            Latest playbooks &amp; product updates
          </h2>

          <div className="mt-8 flex flex-col gap-3">
            {POSTS.map((p) => (
              <Link
                key={p.title}
                href="/resources/blog"
                className="group flex flex-wrap items-center gap-x-4 gap-y-1.5 bg-white rounded-2xl border border-slate-200 px-5 py-4 hover:border-emerald-400 hover:shadow-md transition-all"
              >
                <span className="w-20 shrink-0 text-[11.5px] font-semibold text-slate-500">{p.date}</span>
                <span className="w-24 shrink-0 text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-emerald-600">
                  {p.tag}
                </span>
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                  {p.title}
                </h4>
                <ArrowRight
                  size={14}
                  className="ml-auto text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all"
                />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
