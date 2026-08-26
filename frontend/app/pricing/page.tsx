'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { PublicLayout, usePublicLoading } from '@/components/layout/PublicLayout';
import { CheckCircle2, Sparkles, ArrowRight, X } from 'lucide-react';
import { planApi } from '@/lib/api';
import { FEATURE_LABELS } from '@/lib/planFeatures';
import { useDemoTrigger } from '@/components/public/DemoTrigger';

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

// Fallback only renders if the plans API is unreachable — keep it in sync with
// backend/src/scripts/seed.js so a degraded page still shows the real ladder.
const FALLBACK_PLANS = [
  {
    name: 'Starter',
    tagline: 'For micro-businesses launching their first online channels.',
    price: { monthly: 999, yearly: 10789 },
    cta: 'Start 14-day Trial',
    highlight: false,
    features: [
      '3 sales channels',
      '500 self-fulfilled orders/month',
      '1 warehouse',
      '2 users · 3 roles',
      '10,000 SKUs',
      'Payment reconciliation · mobile app',
    ],
    excluded: ['Video management (VMS)', 'Purchase management', 'Custom reports'],
  },
  {
    name: 'Growth',
    tagline: 'For growing brands strengthening their multi-channel operations.',
    price: { monthly: 2999, yearly: 32389 },
    cta: 'Start 14-day Trial',
    highlight: true,
    features: [
      '8 channels · +Quick-commerce & Social',
      '2,500 self-fulfilled orders/month',
      '3 warehouses',
      '6 users · 6 roles',
      '50,000 SKUs',
      'Video management (VMS) · enhanced returns',
      'Purchase management · SKU barcoding',
    ],
    excluded: ['Custom reports', 'API / ERP integration'],
  },
  {
    name: 'Scale',
    tagline: 'For scaling brands that need full omnichannel coverage and warehouse ops.',
    price: { monthly: 7999, yearly: 86389 },
    cta: 'Start 14-day Trial',
    highlight: false,
    features: [
      '20 channels · +B2B',
      '10,000 self-fulfilled orders/month',
      '6 warehouses',
      '20 users · 12 roles',
      '250,000 SKUs',
      'Custom reports · advanced warehouse ops',
      'Vendor management · full omnichannel',
    ],
    excluded: ['API access', 'ERP integration'],
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

// ── Full plan comparison (real feature matrix across the 4 plans) ──────
const COMPARE_COLUMNS = ['Starter', 'Growth', 'Scale', 'Enterprise'];
type CompareCell = string | boolean;
const COMPARE_ROWS: Array<[string, CompareCell, CompareCell, CompareCell, CompareCell]> = [
  ['SKUs', '10,000', '50,000', '250,000', 'Unlimited'],
  ['Warehouses', '1', '3', '6', 'Unlimited'],
  ['User roles', '3', '6', '12', 'Unlimited'],
  ['Self-fulfilled orders / month', '500', '2,500', '10,000', 'Unlimited'],
  ['Sales channels', '3', '8', '20', 'All'],
  ['Pay-as-you-go', false, true, true, true],
  ['Payment reconciliation', true, true, true, true],
  ['Purchase management', false, true, true, true],
  ['Video management (VMS)', false, true, true, true],
  ['Advanced warehouse ops', false, false, true, true],
  ['Custom reports', false, false, true, true],
  ['Vendor management', false, false, true, true],
  ['Custom / API integration', false, false, false, true],
  ['ERP integration', false, false, false, true],
];

// Features that are marketing-only (not yet built) — flagged "Soon" in the table.
const COMING_SOON = [
  'purchase management',
  'advanced warehouse ops',
  'vendor management',
  'api integration',
  'erp integration',
];

export default function PricingPage() {
  const [yearly, setYearly] = useState(false); // show Monthly first
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
          <div className="absolute top-20 left-1/4 w-96 h-96 rounded-full bg-emerald-400/20 dark:bg-emerald-500/10 blur-[120px]" />
          <div className="absolute top-40 right-1/4 w-96 h-96 rounded-full bg-teal-400/20 dark:bg-teal-500/10 blur-[120px]" />
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
              { key: true,  label: 'Yearly', savings: 'Save 10%' },
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
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {PLANS.map(plan => (
            <div
              key={plan.name}
              className={`relative flex flex-col h-full rounded-2xl p-6 ${
                plan.highlight
                  ? 'bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 text-white shadow-2xl shadow-emerald-500/30 border border-white/10 lg:-my-2'
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
                <p className={`text-sm mt-1 min-h-[2.75rem] leading-snug ${plan.highlight ? 'text-white/70' : 'text-slate-500'}`}>
                  {plan.tagline}
                </p>
              </div>

              <div className="mt-8">
                {plan.cta === 'Talk to Sales' ? (
                  <div className={`text-5xl font-bold tracking-tight ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
                    Custom
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className={`text-5xl font-bold tracking-tight ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
                      ₹{yearly ? plan.price.yearly.toLocaleString() : plan.price.monthly.toLocaleString()}
                    </span>
                    <span className={`text-sm font-semibold ${plan.highlight ? 'text-white/60' : 'text-slate-500'}`}>
                      /{yearly ? 'year' : 'month'}
                    </span>
                  </div>
                )}
                {plan.cta !== 'Talk to Sales' && plan.price.monthly === 0 && (
                  <p className={`text-xs mt-1 font-semibold ${plan.highlight ? 'text-white/70' : 'text-slate-500'}`}>
                    Free forever
                  </p>
                )}
                {plan.cta !== 'Talk to Sales' && plan.price.monthly > 0 && yearly && (
                  <p className={`text-xs mt-1 font-semibold ${plan.highlight ? 'text-white/60' : 'text-slate-500'}`}>
                    ₹{plan.price.monthly.toLocaleString()}/mo billed monthly
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

              <div className={`mt-8 pt-8 border-t space-y-3 flex-1 ${plan.highlight ? 'border-white/20' : 'border-slate-200/70'}`}>
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

      {/* Comparison table */}
      <section className="pb-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              Compare every plan
            </h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_2px_20px_rgba(15,15,30,0.04)]">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-white/[0.04]">
                  <th className="text-left font-bold text-slate-900 px-4 py-4">What you get</th>
                  {COMPARE_COLUMNS.map(col => (
                    <th
                      key={col}
                      className={`text-center font-bold px-4 py-4 ${
                        col === 'Growth' ? 'text-emerald-600' : 'text-slate-900'
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row, i) => {
                  const [label, ...cells] = row;
                  return (
                    <tr
                      key={label}
                      className={`border-t border-slate-100 dark:border-white/[0.06] ${
                        i % 2 === 1 ? 'bg-slate-50/60 dark:bg-white/[0.02]' : ''
                      }`}
                    >
                      <td className="text-left font-semibold text-slate-700 px-4 py-3.5">
                        {label}
                        {COMING_SOON.some(k => label.toLowerCase().includes(k)) && (
                          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200 align-middle">
                            Soon
                          </span>
                        )}
                      </td>
                      {cells.map((cell, j) => (
                        <td key={j} className="text-center px-4 py-3.5">
                          {typeof cell === 'boolean' ? (
                            cell ? (
                              <CheckCircle2 size={18} className="inline text-emerald-500" />
                            ) : (
                              <span className="text-slate-300">—</span>
                            )
                          ) : (
                            <span className="text-slate-700 font-medium">{cell}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
