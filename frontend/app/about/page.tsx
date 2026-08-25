'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PublicLayout, usePublicLoading } from '@/components/layout/PublicLayout';
import { publicApi } from '@/lib/api';
import { getIcon } from '@/lib/icon';
import { Sparkles, ArrowRight } from 'lucide-react';

interface Row {
  id: string;
  title: string;
  subtitle: string | null;
  body: string | null;
  icon: string | null;
  data: any;
}

export default function AboutPage() {
  const [sections, setSections] = useState<Row[]>([]);
  const [values, setValues] = useState<Row[]>([]);
  const [timeline, setTimeline] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  usePublicLoading('about', loading);

  useEffect(() => {
    Promise.all([
      publicApi.content('ABOUT_SECTION').then((r) => setSections(r.data || [])).catch(() => {}),
      publicApi.content('ABOUT_VALUE').then((r) => setValues(r.data || [])).catch(() => {}),
      publicApi.content('ABOUT_TIMELINE').then((r) => setTimeline(r.data || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <PublicLayout>
      <section className="relative overflow-hidden pt-20 pb-12">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-emerald-50 via-white to-white" />
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-4">
            <Sparkles size={12} /> About us
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent leading-tight">
            Boring ops, so you<br />
            <span className="gradient-text">don't lose sleep.</span>
          </h1>
        </div>
      </section>

      {/* Story + Mission sections */}
      <section className="pb-20">
        <div className="max-w-4xl mx-auto px-6 space-y-12">
          {sections.map((s) => {
            const Icon = getIcon(s.icon);
            return (
              <div key={s.id} className="flex gap-6 items-start">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Icon size={20} className="text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{s.title}</h2>
                  {s.subtitle && <p className="text-lg text-emerald-600 font-semibold mt-1">{s.subtitle}</p>}
                  {s.body && <p className="text-slate-600 mt-3 leading-relaxed">{s.body}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Values */}
      {values.length > 0 && (
        <section className="py-20 bg-slate-50">
          <div className="max-w-6xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-slate-900 mb-10 text-center">Our values</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {values.map((v) => {
                const Icon = getIcon(v.icon);
                return (
                  <div key={v.id} className="bg-white rounded-2xl border border-slate-200 p-6">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
                      <Icon size={18} className="text-emerald-600" />
                    </div>
                    <h3 className="font-bold text-slate-900">{v.title}</h3>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">{v.subtitle}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <section className="py-20">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-slate-900 mb-10 text-center">Milestones</h2>
            <div className="relative pl-8 border-l-2 border-emerald-200 space-y-8">
              {timeline.map((t) => (
                <div key={t.id} className="relative">
                  <div className="absolute -left-[37px] w-4 h-4 rounded-full bg-emerald-500 border-4 border-white shadow" />
                  <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider">{t.data?.year || ''}</div>
                  <h3 className="font-bold text-slate-900 mt-1">{t.title}</h3>
                  <p className="text-sm text-slate-600 mt-1">{t.subtitle}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Careers (header "Company → Careers" anchor: /about#careers) ── */}
      <section id="careers" className="scroll-mt-28 py-16">
        <div className="max-w-3xl mx-auto px-6">
          <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-500/10 dark:to-transparent p-8 md:p-12 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.1em] text-emerald-700">Careers</div>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-slate-900">We&apos;re hiring</h2>
            <p className="mt-3 text-slate-600 max-w-xl mx-auto leading-relaxed">
              We&apos;re a small team in Rajkot building the commerce operating system for
              Indian brands. If you love hard problems and shipping fast, we&apos;d love to hear
              from you — even if there&apos;s no open role that fits perfectly.
            </p>
            <a
              href="mailto:finverasolutionsllp@gmail.com?subject=Careers%20at%20Kartriq"
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-full transition-colors"
            >
              Send us your CV <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-full"
          >
            Get in touch <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
