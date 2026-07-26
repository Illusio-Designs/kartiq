'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { PublicLayout, usePublicLoading } from '@/components/layout/PublicLayout';
import { CheckCircle2, Sparkles, ArrowRight, X } from 'lucide-react';
import { planApi } from '@/lib/api';
import { useDemoTrigger } from '@/components/public/DemoTrigger';

// ── Feature label catalog (mirrors backend Plan.features keys) ──────
const FEATURE_LABELS: Record<string, string> = {
  returns: 'Returns management',
  vms: 'VMS – Video Management Solution',
  paymentReconciliation: 'Payment Reconciliation',
  mobileApp: 'Mobile App',
  purchaseManagement: 'Purchase Management',
  barcoding: 'Barcoding',
  inwardLogistics: 'Inward Logistics',
  customReports: 'Customized reports',
  apiIntegration: 'Custom / API Integration',
  advancedWarehouseOps: 'Advanced warehouse ops (FIFO, Cycle count, Handheld)',
  vendorManagement: 'Vendor Management',
  omniChannel: 'Omni Channel',
  erpIntegration: 'ERP Integration',
};

function planToView(p: any) {
  const features: string[] = [];
  const excluded: string[] = [];
  const fm = p.features || {};
  for (const [k, label] of Object.entries(FEATURE_LABELS)) {
    const v = fm[k];
    if (v && v !== false) {
      const tag = typeof v === 'string' ? ` ( ${v} )` : '';
      features.push(`${label}${tag}`);
    } else {
      excluded.push(label);
    }
  }
  // Limits
  features.unshift(
    `${p.maxFacilities ?? 'Unlimited'} Facility/Facilities`,
    `${p.maxSkus ? p.maxSkus.toLocaleString() : 'Unlimited'} SKUs`,
    `${p.maxUserRoles ?? 'Unlimited'} User Roles`,
  );
  return {
    code: p.code,
    name: p.name,
    tagline: p.tagline,
    price: { monthly: Number(p.monthlyPrice), yearly: Number(p.yearlyPrice) },
    cta: p.code === 'ENTERPRISE' ? 'Talk to Sales' : 'Start 14-day Trial',
    highlight: p.code === 'PROFESSIONAL',
    features,
    excluded,
  };
}

const FALLBACK_PLANS = [
  {
    name: 'Starter',
    tagline: 'For indie brands getting started',
    price: { monthly: 0, yearly: 0 },
    cta: 'Start Free',
    highlight: false,
    features: [
      '3 channels',
      '500 orders/month',
      '1 warehouse',
      '1 user',
      'Order & inventory sync',
      'Community support',
    ],
    excluded: ['AI insights', 'Auto review requests', 'Webhooks API'],
  },
  {
    name: 'Growth',
    tagline: 'For scaling D2C brands',
    price: { monthly: 2499, yearly: 24990 },
    cta: 'Start 14-day Trial',
    highlight: true,
    features: [
      'Unlimited channels',
      '10,000 orders/month',
      '5 warehouses',
      '10 users',
      'Everything in Starter',
      'Auto review requests',
      'Shipping aggregators',
      'Webhooks & API',
      'Priority email support',
    ],
    excluded: ['AI demand forecasting'],
  },
  {
    name: 'Scale',
    tagline: 'For multi-brand enterprises',
    price: { monthly: 7999, yearly: 79990 },
    cta: 'Talk to Sales',
    highlight: false,
    features: [
      'Unlimited channels',
      'Unlimited orders',
      'Unlimited warehouses',
      'Unlimited users',
      'Everything in Growth',
      'AI demand forecasting',
      'Custom integrations',
      'Dedicated account manager',
      'SLA & 24/7 support',
    ],
    excluded: [],
  },
];

const FAQ = [
  {
    q: 'Do I need to migrate my existing data?',
    a: 'No — you can connect your channels and start syncing orders & inventory instantly. Historical data can be imported later via CSV or API.',
  },
  {
    q: 'Which channels are supported?',
    a: 'Over 50 channels across e-commerce (Amazon, Flipkart, Myntra, Meesho, Nykaa…), quick commerce (Blinkit, Zepto, Swiggy Instamart, BB Now), logistics (Shiprocket, Delhivery, iThink, Pickrr, NimbusPost, ClickPost, Xpressbees, Shadowfax + 8 more), own-store platforms (Shopify, WooCommerce, Magento, BigCommerce, OpenCart, Amazon Smart Biz) and social commerce.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. You can cancel or downgrade anytime from your dashboard — no lock-in, no hidden fees.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes — every paid plan comes with a 14-day free trial. No credit card required.',
  },
];

export default function PricingPage() {
  const [yearly, setYearly] = useState(true);
  interface PlanView {
    code?: string;
    name: string;
    tagline?: string;
    price: { monthly: number; yearly: number };
    cta: string;
    highlight: boolean;
    features: string[];
    excluded: string[];
  }
  const [plans, setPlans] = useState<PlanView[]>(FALLBACK_PLANS as PlanView[]);
  const [loading, setLoading] = useState(true);
  usePublicLoading('pricing', loading);
  const { open: openDemo } = useDemoTrigger();

  useEffect(() => {
    planApi.list()
      .then(r => {
        if (Array.isArray(r.data) && r.data.length) setPlans(r.data.map(planToView));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const PLANS = plans;

  return (
    <PublicLayout>
      <section className="relative overflow-hidden pt-20 pb-16">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/4 w-96 h-96 rounded-full bg-emerald-400/20 blur-[120px]" />
          <div className="absolute top-40 right-1/4 w-96 h-96 rounded-full bg-teal-400/20 blur-[120px]" />
        </div>

        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-4">
            <Sparkles size={12} /> Simple Pricing
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent leading-tight">
            Pick a plan. <span className="gradient-text">Scale fearlessly.</span>
          </h1>
          <p className="mt-5 text-lg text-slate-600 max-w-2xl mx-auto">
            Transparent monthly pricing. No per-order fees. No surprises. Cancel anytime.
          </p>

          {/* Billing toggle */}
          <div className="mt-10 inline-flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl shadow-sm">
            {[
              { key: false, label: 'Monthly' },
              { key: true,  label: 'Yearly', savings: 'Save 17%' },
            ].map(opt => (
              <button
                key={opt.label}
                onClick={() => setYearly(opt.key)}
                className={`flex items-center gap-2 px-5 py-2 text-sm font-bold rounded-lg transition-all ${
                  yearly === opt.key
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
                {opt.savings && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                    yearly === opt.key ? 'bg-white/20' : 'bg-emerald-100 text-emerald-700'
                  }`}>{opt.savings}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <section className="pb-24">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map(plan => (
            <div
              key={plan.name}
              className={`relative rounded-3xl p-8 ${
                plan.highlight
                  ? 'bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 text-white shadow-2xl shadow-emerald-500/30 scale-[1.02] border border-white/10'
                  : 'bg-white border border-slate-200 shadow-[0_2px_20px_rgba(15,15,30,0.04)]'
              }`}
            >
              {plan.highlight && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg">
                    <Sparkles size={10} /> Most Popular
                  </span>
                </div>
              )}

              <div>
                <h3 className={`text-2xl font-bold ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm mt-1 ${plan.highlight ? 'text-white/70' : 'text-slate-500'}`}>
                  {plan.tagline}
                </p>
              </div>

              <div className="mt-8">
                <div className="flex items-baseline gap-1">
                  <span className={`text-5xl font-bold tracking-tight ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
                    ₹{yearly ? plan.price.yearly.toLocaleString() : plan.price.monthly.toLocaleString()}
                  </span>
                  <span className={`text-sm font-semibold ${plan.highlight ? 'text-white/60' : 'text-slate-500'}`}>
                    /{yearly ? 'year' : 'month'}
                  </span>
                </div>
                {plan.price.monthly === 0 && (
                  <p className={`text-xs mt-1 font-semibold ${plan.highlight ? 'text-white/70' : 'text-slate-500'}`}>
                    Free forever
                  </p>
                )}
              </div>

              {plan.cta === 'Talk to Sales' ? (
                <button
                  type="button"
                  onClick={() => openDemo({
                    source: 'pricing',
                    subject: `${plan.name} plan inquiry`,
                    title: 'Talk to Sales',
                    description: `Tell us about your business and we'll show you how Kartriq's ${plan.name} plan fits.`,
                  })}
                  className={`mt-6 flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                    plan.highlight
                      ? 'bg-white text-emerald-700 hover:bg-emerald-50 shadow-lg'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {plan.cta} <ArrowRight size={14} />
                </button>
              ) : (
                <Link
                  href={`/onboarding${plan.code ? `?plan=${plan.code}` : ''}`}
                  className={`mt-6 flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                    plan.highlight
                      ? 'bg-white text-emerald-700 hover:bg-emerald-50 shadow-lg'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {plan.cta} <ArrowRight size={14} />
                </Link>
              )}

              <div className="mt-8 pt-8 border-t border-slate-200/50 space-y-3">
                {plan.features.map(f => (
                  <div key={f} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2
                      size={16}
                      className={`mt-0.5 flex-shrink-0 ${plan.highlight ? 'text-emerald-400' : 'text-emerald-500'}`}
                    />
                    <span className={plan.highlight ? 'text-white/90' : 'text-slate-700'}>{f}</span>
                  </div>
                ))}
                {plan.excluded.map(f => (
                  <div key={f} className="flex items-start gap-2.5 text-sm opacity-40">
                    <X size={16} className={`mt-0.5 flex-shrink-0 ${plan.highlight ? 'text-white/50' : 'text-slate-400'}`} />
                    <span className={plan.highlight ? 'text-white/60' : 'text-slate-500'}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-24">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              Frequently asked questions
            </h2>
          </div>
          <div className="space-y-3">
            {FAQ.map(item => (
              <details key={item.q} className="card-premium p-5 group">
                <summary className="font-bold text-slate-900 cursor-pointer list-none flex items-center justify-between">
                  {item.q}
                  <span className="text-emerald-500 group-open:rotate-45 transition-transform text-2xl leading-none">+</span>
                </summary>
                <p className="text-sm text-slate-600 mt-3 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
