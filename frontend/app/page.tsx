'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PublicLayout, usePublicLoading } from '@/components/layout/PublicLayout';
import { ChannelMarquee, ALL_CHANNELS } from '@/components/ChannelMarquee';
import { CountUp } from '@/components/CountUp';
import { publicApi } from '@/lib/api';
import { getIcon } from '@/lib/icon';
import { Sparkles, ArrowRight, Play, Users, Globe, Star, ChevronDown, Check } from 'lucide-react';
import { CardSkeleton, ShimmerTheme } from '@/components/Shimmer';
import { useDemoTrigger } from '@/components/public/DemoTrigger';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

interface ContentRow {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  body: string | null;
  icon: string | null;
  data: any;
}

// ── Pricing teaser (static marketing copy — full pricing lives on /pricing) ──
const PRICING_TEASER = [
  {
    name: 'Starter',
    tagline: 'For micro-businesses launching their first online channels.',
    yearly: 14990,
    popular: false,
    features: ['1 facility', '10,000 SKUs', '3 user roles', '500 orders / month'],
  },
  {
    name: 'Growth',
    tagline: 'For growing brands strengthening their multi-channel operations.',
    yearly: 49990,
    popular: true,
    features: ['2 facilities', '50,000 SKUs', '5 user roles', '2,500 orders / month'],
  },
  {
    name: 'Scale',
    tagline: 'For scaling brands that need full omnichannel coverage and warehouse ops.',
    yearly: 149990,
    popular: false,
    features: ['5 facilities', '200,000 SKUs', '10 user roles', '10,000 orders / month'],
  },
];
const inr = (n: number) => n.toLocaleString('en-IN');

export default function LandingPage() {
  const [stats, setStats] = useState<{
    channelsCount: number;
    logisticsCount: number;
    comingSoonCount: number;
    totalOrders: number;
    totalTenants: number;
  } | null>(null);
  const [challenges, setChallenges] = useState<ContentRow[]>([]);
  const [featureTools, setFeatureTools] = useState<ContentRow[]>([]);
  const [testimonials, setTestimonials] = useState<ContentRow[]>([]);
  const [faqs, setFaqs] = useState<ContentRow[]>([]);
  const [hero, setHero] = useState<ContentRow | null>(null);
  const [loading, setLoading] = useState(true);
  usePublicLoading('landing', loading);
  const { open: openDemo } = useDemoTrigger();

  useEffect(() => {
    Promise.all([
      publicApi.stats().then((r) => setStats(r.data)).catch(() => {}),
      publicApi.content('HERO').then((r) => setHero((r.data || [])[0] || null)).catch(() => {}),
      publicApi.content('LANDING_CHALLENGE').then((r) => setChallenges(r.data)).catch(() => {}),
      publicApi.content('LANDING_FEATURE_TOOL').then((r) => setFeatureTools(r.data)).catch(() => {}),
      publicApi.content('TESTIMONIAL').then((r) => setTestimonials(r.data)).catch(() => {}),
      publicApi.content('LANDING_FAQ').then((r) => setFaqs(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const ctaPrimary = hero?.data?.ctaPrimary || { label: 'Try for Free', href: '/onboarding' };
  const ctaSecondary = hero?.data?.ctaSecondary || { label: 'Schedule a Demo', href: '/contact' };
  const heroBadge = hero?.data?.badge || `Now connecting ${stats?.channelsCount ?? 56}+ channels`;

  return (
    <PublicLayout>
      {/* ═══ HERO ═══════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Soft background */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-50 via-green-50/50 to-white" />
          <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-emerald-200/40 blur-[120px] animate-pulse-soft" />
          <div className="absolute top-20 right-1/4 w-96 h-96 rounded-full bg-teal-200/40 blur-[120px] animate-pulse-soft" style={{ animationDelay: '1.5s' }} />
          {/* Cloud-like blobs */}
          <div className="absolute top-32 left-10 w-32 h-12 rounded-full bg-white/70 blur-xl animate-bob" />
          <div className="absolute top-16 right-32 w-40 h-14 rounded-full bg-white/70 blur-xl animate-bob" style={{ animationDelay: '2s' }} />
          <div className="absolute top-40 right-16 w-28 h-10 rounded-full bg-white/80 blur-xl animate-bob" style={{ animationDelay: '3s' }} />
        </div>

        <div className="max-w-7xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-emerald-200/50 shadow-sm text-xs font-bold text-emerald-700 uppercase tracking-wider animate-slide-up">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            {heroBadge}
          </div>

          <h1 className="mt-6 text-5xl md:text-7xl font-bold tracking-tight bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent leading-[1.1] max-w-4xl mx-auto animate-slide-up">
            {hero?.title || 'Data-Driven Commerce'}<br />
            <span className="gradient-text">{hero?.subtitle || 'Powered by AI'}</span>
          </h1>

          <p className="mt-6 max-w-xl mx-auto text-base md:text-lg text-slate-600 leading-relaxed animate-slide-up">
            {hero?.body || 'Effortlessly manage every channel, uncover trends, and make smarter decisions in minutes — not weeks.'}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 animate-slide-up">
            <Link
              href={ctaPrimary.href}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-full shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:-translate-y-0.5 transition-all group"
            >
              {ctaPrimary.label}
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <button
              type="button"
              onClick={() => openDemo({ source: 'demo', title: ctaSecondary.label || 'Schedule a Demo' })}
              className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-full transition-all group"
            >
              <Play size={12} fill="currentColor" className="group-hover:scale-125 transition-transform" /> {ctaSecondary.label}
            </button>
          </div>
        </div>

        {/* Dashboard preview mockup */}
        <div className="relative max-w-6xl mx-auto px-6 pb-20" data-reveal="zoom">
          <div className="relative rounded-3xl bg-white border border-slate-200/70 shadow-2xl shadow-emerald-500/10 overflow-hidden hover-tilt">
            <DashboardMockup />
          </div>
          {/* Floating mini mockup */}
          <div className="hidden lg:block absolute -left-8 top-20 w-64 h-[380px] rounded-2xl bg-white border border-slate-200/70 shadow-xl overflow-hidden animate-float">
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600" />
                <div>
                  <div className="text-[10px] font-bold text-slate-900">Good morning 👋</div>
                  <div className="text-[8px] text-slate-500">Sazirun</div>
                </div>
              </div>
              <div className="space-y-1.5 mt-3">
                {['Dashboard', 'Tracking', 'Analytics', 'Inventory', 'Orders'].map((l, i) => (
                  <div key={l} className={`px-2 py-1.5 rounded text-[9px] font-semibold ${i === 0 ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500'}`}>
                    {l}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ LIVE STATS COUNTERS ═════════════════════════════════════ */}
      <section className="py-12 bg-gradient-to-b from-white via-emerald-50/30 to-white border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6" data-stagger data-reveal="fade">
          {[
            { value: stats?.channelsCount  ?? 56, suffix: '+', label: 'Channels live' },
            { value: stats?.logisticsCount ?? 16,                  suffix: '+', label: 'Logistics partners' },
            {
              value: stats?.totalOrders ?? 0,
              suffix: '+',
              label: 'Orders processed',
              format: (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n)),
            },
            { value: stats?.totalTenants ?? 0, suffix: '+', label: 'Businesses onboarded' },
          ].map((s, i) => (
            <div key={i} className="text-center" data-reveal>
              <div className="text-4xl md:text-5xl font-bold gradient-text">
                <CountUp value={s.value} suffix={s.suffix} format={s.format} />
              </div>
              <div className="text-xs text-slate-500 font-semibold mt-2 uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ CHANNEL MARQUEE ═══════════════════════════════════════════ */}
      <section className="py-20 relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-6 text-center mb-10" data-reveal="rise">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-4">
            <Sparkles size={12} /> Integrations
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
            <CountUp value={stats?.channelsCount ?? 56} suffix="+" /> channels live.<br />
            <span className="gradient-text">Connected out of the box.</span>
          </h2>
          <p className="mt-4 text-slate-600 max-w-xl mx-auto">
            India to LATAM, Southeast Asia to Europe — hover to pause and explore every integration.
          </p>
          {stats?.comingSoonCount ? (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              <Sparkles size={11} /> +{stats.comingSoonCount} more on the roadmap
            </div>
          ) : null}
        </div>

        <div data-reveal="fade">
          <ChannelMarquee />
        </div>

        {/* ── Global reach by region ─────────────────────────────────── */}
        <div className="max-w-6xl mx-auto px-6 mt-14" data-reveal="rise">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3">
              <Globe size={12} /> Global Reach
            </div>
            <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
              Sell across every continent — from one dashboard.
            </h3>
            <p className="mt-2 text-slate-600 max-w-2xl mx-auto text-sm">
              One platform plugs into the dominant marketplaces in every region. Pick the markets you serve — the integrations are already built in.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { iso: 'in', twemoji: '1f1ee-1f1f3', region: 'India',           channels: ['Amazon.in', 'Flipkart', 'Myntra', 'Meesho', 'Nykaa', 'Ajio', 'Tata Cliq', 'JioMart', 'Blinkit', 'Zepto', 'Swiggy Instamart', 'BB Now'] },
              { iso: 'sg', twemoji: '1f1f8-1f1ec', region: 'Southeast Asia',  channels: ['Lazada', 'Shopee', 'TikTok Shop', 'Amazon SG', 'Amazon AU'] },
              { iso: 'us', twemoji: '1f1fa-1f1f8', region: 'North America',  channels: ['Amazon US', 'Walmart', 'eBay', 'Etsy', 'Shopify', 'BigCommerce'] },
              { iso: 'eu', twemoji: '1f1ea-1f1fa', region: 'Europe',          channels: ['Amazon UK', 'Amazon DE', 'Zalando', 'Allegro', 'Kaufland', 'OnBuy', 'ManoMano', 'Fruugo'] },
              { iso: 'br', twemoji: '1f1e7-1f1f7', region: 'Latin America',   channels: ['Mercado Libre (8 markets)', 'Shopee BR/MX/CO/CL'] },
              { iso: 'ae', twemoji: '1f1e6-1f1ea', region: 'Middle East',     channels: ['Amazon UAE', 'Amazon Saudi Arabia', 'Noon (UAE/KSA/Egypt)'] },
            ].map((r) => (
              <div key={r.region} className="group rounded-2xl bg-white border border-slate-200 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <span
                    aria-hidden
                    className="relative inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-white to-slate-50 ring-1 ring-slate-200 shadow-[0_4px_14px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] group-hover:scale-105 group-hover:ring-emerald-200 transition-all"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${r.twemoji}.svg`}
                      alt=""
                      width={28}
                      height={28}
                      loading="lazy"
                      className="drop-shadow-sm"
                      style={{ width: 28, height: 28 }}
                    />
                  </span>
                  <h4 className="font-bold text-slate-900">{r.region}</h4>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {r.channels.map((c) => (
                    <span key={c} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 text-center mt-10" data-reveal="zoom">
          <Link
            href="/integrations"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-full shadow-md shadow-emerald-500/20 hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            Browse All Integrations <ArrowRight size={13} />
          </Link>
        </div>
      </section>

      {/* ═══ WHY US ═══════════════════════════════════════════════════ */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-start mb-12">
            <div className="lg:col-span-3" data-reveal="left">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                Why Kartriq
              </div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
                The Commerce Challenge<br />
                Every Business Faces
              </h2>
            </div>
            <div className="lg:col-span-2 flex lg:items-end lg:justify-end" data-reveal="right">
              <p className="text-sm text-slate-600 leading-relaxed max-w-sm">
                Turning data into insights is a challenge for every business. Our platform simplifies data processes, enabling faster, smarter decisions.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5" data-stagger>
            {challenges.length === 0 && <CardSkeleton count={3} />}
            {challenges.map(c => {
              const Icon = getIcon(c.icon);
              const accent = !!c.data?.accent;
              return (
                <div
                  key={c.id}
                  data-reveal
                  className={`rounded-2xl p-6 border hover-lift transition-all ${
                    accent
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl shadow-emerald-500/30'
                      : 'bg-white border-slate-200 text-slate-900 shadow-sm hover:shadow-xl'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform hover:rotate-6 ${
                      accent ? 'bg-white/15' : 'bg-emerald-50'
                    }`}>
                      <Icon size={18} className={accent ? 'text-white' : 'text-emerald-600'} />
                    </div>
                    <ArrowRight size={16} className={accent ? 'text-white/70' : 'text-slate-400'} />
                  </div>
                  <h3 className={`font-bold text-lg ${accent ? 'text-white' : 'text-slate-900'}`}>
                    {c.title}
                  </h3>
                  <p className={`text-sm mt-2 leading-relaxed ${accent ? 'text-white/80' : 'text-slate-600'}`}>
                    {c.subtitle}
                  </p>
                  {/* Animated mini chart */}
                  <div className="mt-6 flex items-end gap-1 h-16">
                    {[30, 45, 35, 60, 40, 75, 55, 85, 65].map((h, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-t origin-bottom transition-transform duration-500 ${
                          accent ? 'bg-white/40' : 'bg-gradient-to-t from-emerald-200 to-emerald-400'
                        }`}
                        style={{ height: `${h}%`, transitionDelay: `${i * 50}ms` }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ TOOLS ═══════════════════════════════════════════════════ */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14" data-reveal="rise">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
              All the Tools You Need for<br />
              Powerful <span className="gradient-text">Commerce.</span>
            </h2>
            <p className="mt-5 text-base text-slate-600 max-w-xl mx-auto">
              Get the best value for your money with our tailored pricing options. Whether you need basic features or a fully customized solution, we've got you covered.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5" data-stagger>
            {featureTools.length === 0 && <CardSkeleton count={3} />}
            {featureTools.map((t) => {
              const highlight = !!t.data?.highlight;
              const visual = t.data?.visual || 'chart';
              return (
                <div
                  key={t.id}
                  data-reveal
                  className={`rounded-2xl p-6 border hover-lift ${
                    highlight
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl shadow-emerald-500/25'
                      : 'bg-white border-slate-200 shadow-sm'
                  }`}
                >
                  {/* Animated visual */}
                  <div className={`h-36 rounded-xl mb-5 p-4 ${
                    highlight ? 'bg-white/10' : 'bg-slate-50'
                  } flex items-end justify-around gap-2 group/bars`}>
                    {(visual === 'chart' ? [30, 55, 45, 70, 60, 85, 50] :
                      visual === 'bar'   ? [60, 80, 45, 90, 70, 50, 85] :
                                            [50, 40, 65, 55, 75, 60, 45]).map((h, j) => (
                      <div
                        key={j}
                        className={`flex-1 rounded-t-md origin-bottom transition-all duration-500 group-hover/bars:scale-y-110 ${
                          highlight ? 'bg-white/80' : 'bg-gradient-to-t from-emerald-300 to-emerald-500'
                        }`}
                        style={{ height: `${h}%`, transitionDelay: `${j * 40}ms` }}
                      />
                    ))}
                  </div>
                  <h3 className={`font-bold text-lg ${highlight ? 'text-white' : 'text-slate-900'}`}>
                    {t.title}
                  </h3>
                  <p className={`text-sm mt-2 leading-relaxed ${highlight ? 'text-white/80' : 'text-slate-600'}`}>
                    {t.subtitle}
                  </p>
                  <Link
                    href="/dashboard"
                    className={`mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all hover:-translate-y-0.5 ${
                      highlight
                        ? 'bg-white text-emerald-700 hover:bg-emerald-50'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    Get Started <ArrowRight size={12} />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ TESTIMONIALS STRIP ══════════════════════════════════════ */}
      <section className="py-24 bg-gradient-to-b from-white to-emerald-50/30">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-12" data-reveal="rise">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-4">
              <Star size={12} /> Loved by founders
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
              Brands are switching<br />
              <span className="gradient-text">every day.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5" data-stagger>
            {testimonials.length === 0 && <CardSkeleton count={3} />}
            {testimonials.map((t) => {
              const rating = Number(t.data?.rating ?? 5);
              const avatar = t.data?.avatar || t.title.split(' ').map((s: string) => s[0]).slice(0, 2).join('');
              return (
                <div key={t.id} data-reveal className="bg-white rounded-2xl border border-slate-200 p-6 hover-lift hover:shadow-xl transition-all flex flex-col h-full">
                  <div className="flex gap-0.5 mb-4">
                    {Array.from({ length: rating }).map((_, i) => (
                      <Star key={i} size={14} className="text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-slate-700 text-sm leading-relaxed font-medium flex-1">"{t.body}"</p>
                  <div className="flex items-center gap-3 mt-5 pt-5 border-t border-slate-100">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                      {avatar}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900">{t.title}</div>
                      <div className="text-xs text-slate-500">{t.subtitle}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══════════════════════════════════════════════════ */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-5 gap-10">
          <div className="lg:col-span-2" data-reveal="left">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
              Frequently Asked<br />
              Questions
            </h2>
            <p className="mt-5 text-base text-slate-600 leading-relaxed">
              Can't find what you're looking for? Our team is ready to help — reach out anytime.
            </p>
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Users size={14} className="text-emerald-600" />
                </div>
                Rajkot, Gujarat, India
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Globe size={14} className="text-emerald-600" />
                </div>
                info@kartriq.com
              </div>
            </div>
            <Link
              href="/contact"
              className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-full shadow-md transition-all hover:-translate-y-0.5"
            >
              Contact Us <ArrowRight size={13} />
            </Link>
          </div>

          <div className="lg:col-span-3 space-y-2" data-reveal="right">
            {faqs.length === 0 && (
              <ShimmerTheme>
                <div className="space-y-2">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="bg-white border border-slate-200 rounded-xl px-5 py-4">
                      <Skeleton height={14} borderRadius={6} width="80%" />
                    </div>
                  ))}
                </div>
              </ShimmerTheme>
            )}
            {faqs.map((item) => (
              <details key={item.id} className="group bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-emerald-200 hover:shadow-md transition-all duration-300">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none select-none">
                  <span className="text-sm font-bold text-slate-900 group-open:text-emerald-700 pr-4 transition-colors">{item.title}</span>
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 group-open:bg-emerald-600 flex items-center justify-center transition-all duration-300">
                    <ChevronDown size={16} className="text-slate-500 group-open:text-white group-open:rotate-180 transition-transform duration-300" />
                  </span>
                </summary>
                <div className="px-5 pb-5 text-sm text-slate-600 leading-relaxed animate-fade-in">
                  {item.body}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRICING TEASER ═══════════════════════════════════════ */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-12" data-reveal="rise">
            <div className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-3">
              Pricing
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
              Simple plans that <span className="gradient-text">scale with you.</span>
            </h2>
            <p className="mt-5 text-base text-slate-600 max-w-xl mx-auto">
              Start with a 14-day trial. Pay-as-you-go beyond your plan — never a hard wall.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch" data-stagger>
            {PRICING_TEASER.map((p) => (
              <div
                key={p.name}
                data-reveal
                className={`relative rounded-2xl p-6 flex flex-col hover-lift transition-all ${
                  p.popular
                    ? 'bg-white border-2 border-emerald-500 shadow-xl shadow-emerald-500/20'
                    : 'bg-white border border-slate-200 shadow-sm hover:shadow-lg'
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider shadow-md">
                    <Star size={10} className="fill-white" /> Most popular
                  </span>
                )}
                <div className="font-bold text-lg text-slate-900">{p.name}</div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed min-h-[2.5rem]">{p.tagline}</p>
                <div className="mt-4 text-3xl font-bold text-slate-900">
                  ₹{inr(p.yearly)}
                  <span className="text-sm font-semibold text-slate-500"> /yr</span>
                </div>
                <ul className="mt-5 mb-6 space-y-2.5 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check size={15} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/pricing"
                  className={`text-center px-4 py-2.5 rounded-full text-sm font-semibold transition-all hover:-translate-y-0.5 ${
                    p.popular
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  See plan
                </Link>
              </div>
            ))}
          </div>

          <div className="text-center mt-10" data-reveal="zoom">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-full shadow-md shadow-emerald-500/20 hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              See full pricing <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ CTA BAND ═════════════════════════════════════════════ */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6" data-reveal="zoom">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-10 md:p-16 text-center shadow-2xl shadow-emerald-500/30">
            <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-white/15 blur-3xl -translate-y-1/2 translate-x-1/4 animate-pulse-soft" />
            <div className="absolute bottom-0 left-1/4 w-80 h-80 rounded-full bg-emerald-300/20 blur-3xl translate-y-1/2 animate-pulse-soft" style={{ animationDelay: '1.5s' }} />

            <div className="relative">
              <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight">
                Sell everywhere. Ship anything.
              </h2>
              <p className="mt-4 text-sm md:text-base text-white/85 leading-relaxed max-w-xl mx-auto">
                Join fast-growing sellers running their whole operation on Kartriq. Connect your first channel in under 5 minutes.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href={ctaPrimary.href}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white text-emerald-700 text-sm font-bold rounded-full hover:bg-emerald-50 hover:-translate-y-0.5 transition-all group"
                >
                  Create your free account
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </Link>
                <button
                  type="button"
                  onClick={() => openDemo({ source: 'demo', title: ctaSecondary.label || 'Schedule a Demo' })}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 backdrop-blur border border-white/25 text-white text-sm font-semibold rounded-full hover:bg-white/20 transition-all group"
                >
                  <Play size={12} fill="currentColor" className="group-hover:scale-125 transition-transform" /> Schedule a demo
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

// ─── Dashboard mockup visual for hero ──────────────────────────────────────
function DashboardMockup() {
  return (
    <div className="p-4 md:p-6 bg-slate-50">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-bold text-slate-500">Hi Sazirun 👋</div>
          <div className="text-lg font-bold text-slate-900">Good morning!</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 w-24 bg-slate-200 rounded-md" />
          <div className="h-6 w-20 bg-emerald-500 rounded-md" />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 md:col-span-4 bg-white rounded-xl border border-slate-200 p-3">
          <div className="text-[10px] font-bold text-slate-500 uppercase">Shipment Analytics</div>
          <div className="text-xl font-bold text-slate-900 mt-1">202,760</div>
          <div className="text-[10px] text-emerald-600 font-bold">+0.86% vs last month</div>
          <div className="mt-2 flex items-end gap-0.5 h-16">
            {[40, 55, 45, 70, 60, 85, 50, 75, 65, 90, 55, 80].map((h, i) => (
              <div
                key={i}
                className={`flex-1 rounded-sm ${i === 5 ? 'bg-emerald-500' : 'bg-emerald-200'}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        <div className="col-span-6 md:col-span-4 bg-white rounded-xl border border-slate-200 p-3">
          <div className="text-[10px] font-bold text-slate-500 uppercase">Avg Working Time</div>
          <div className="text-xl font-bold text-slate-900 mt-1">48.64%</div>
          <div className="text-[10px] text-emerald-600 font-bold">+0.86% vs last month</div>
          <div className="mt-2 flex items-end gap-0.5 h-16">
            {[35, 50, 40, 65, 55, 80, 45, 70, 60, 85, 50, 75].map((h, i) => (
              <div
                key={i}
                className={`flex-1 rounded-sm ${i === 5 ? 'bg-emerald-500' : 'bg-emerald-200'}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        <div className="col-span-6 md:col-span-4 bg-white rounded-xl border border-slate-200 p-3">
          <div className="text-[10px] font-bold text-slate-500 uppercase">Channels</div>
          <div className="flex items-center justify-center h-20 mt-2">
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" stroke="#D8F8EC" strokeWidth="4" />
                <circle cx="18" cy="18" r="16" fill="none" stroke="#06D4B8" strokeWidth="4" strokeDasharray="68 100" strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-900">
                68%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
