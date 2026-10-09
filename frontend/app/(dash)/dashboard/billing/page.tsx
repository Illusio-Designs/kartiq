'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { billingApi, planApi, paymentApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { track, upgradeSession } from '@/lib/analytics';
import { CheckCircle2, AlertCircle, Crown, Sparkles, CreditCard } from 'lucide-react';
import { planFeatureLines } from '@/lib/planFeatures';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { StatsSkeleton, CardSkeletonItem, CardSkeletonGrid } from '@/components/Shimmer';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Tooltip } from '@/components/ui/Tooltip';
import { toast } from '@/store/toast.store';

export default function BillingPage() {
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('billing.manage');

  const [sub, setSub] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [confirmUi, confirm] = useConfirm();

  const load = async () => {
    const [s, p, i, m] = await Promise.all([
      billingApi.subscription(),
      planApi.list(),
      billingApi.invoices().catch(() => ({ data: [] })),
      paymentApi.methods().catch(() => ({ data: [] })),
    ]);
    setSub(s.data); setPlans(p.data);
    const invData = i.data;
    setInvoices(Array.isArray(invData) ? invData : (invData?.invoices || []));
    setPaymentMethods(Array.isArray(m.data) ? m.data : []);
  };

  const setDefaultMethod = async (id: string) => {
    try {
      await paymentApi.setDefaultMethod(id);
      toast.success('Default method updated');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed');
    }
  };
  const removeMethod = async (id: string) => {
    const ok = await confirm({
      title: 'Remove saved card?',
      description: 'This card will be removed and can no longer be used for subscription auto-renewal.',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await paymentApi.deleteMethod(id);
      toast.success('Method removed');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed');
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Razorpay checkout helper — lazy-loads the script the first time
  const loadRazorpay = () =>
    new Promise<boolean>((resolve) => {
      if (window.Razorpay) return resolve(true);
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });

  const change = async (planCode: string) => {
    if (!canManage) return;
    setLoading(true);
    try {
      // Default to enabling auto-renew + save-card. The user can flip both
      // off later from this page.
      const enableAutoRenew = true;
      const { data } = await paymentApi.checkout({
        planCode,
        billingCycle: 'MONTHLY',
        savePaymentMethod: enableAutoRenew,
      });

      // Meta InitiateCheckout — fired the moment the order is created
      // server-side, regardless of whether the user completes payment.
      // value comes from the Razorpay order in paise; divide by 100.
      const checkoutValue = data.order?.amount ? Number(data.order.amount) / 100 : 0;
      const checkoutCurrency = data.order?.currency || 'INR';
      track('checkout_started', {
        plan: planCode,
        value: checkoutValue,
        currency: checkoutCurrency,
      });

      if (data.order?.stub) {
        // Stub mode — no real payment gateway configured
        await paymentApi.verify({
          razorpay_order_id: data.order.id,
          razorpay_payment_id: `pay_stub_${Date.now()}`,
          razorpay_signature: 'stub',
          planCode,
          billingCycle: 'MONTHLY',
          autoRenew: enableAutoRenew,
        });
        track('plan_purchased', {
          plan: planCode,
          value: checkoutValue,
          currency: checkoutCurrency,
          stub: true,
        });
        upgradeSession('plan_purchased');
        toast.success(`Switched to ${planCode} (stub)`);
        await load();
        return;
      }
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Failed to load Razorpay');
      const rzp = new window.Razorpay!({
        key: data.keyId,
        amount: data.order.amount,
        currency: data.order.currency,
        order_id: data.order.id,
        name: 'Kartriq',
        description: `${data.plan.name} plan`,
        customer_id: data.customerId || undefined,
        prefill: data.prefill,
        theme: { color: '#06D4B8' },
        handler: async (resp: any) => {
          await paymentApi.verify({
            ...resp, planCode, billingCycle: 'MONTHLY', autoRenew: enableAutoRenew,
          });
          // SaaS-grade conversion: fires Meta Subscribe + Purchase via
          // the FB map. Same call also reports to GA4 + Clarity and
          // upgrade()s the Clarity recording for ad-attribution review.
          track('plan_purchased', {
            plan: planCode,
            value: checkoutValue,
            currency: checkoutCurrency,
          });
          upgradeSession('plan_purchased');
          toast.success(`Switched to ${planCode}`);
          await load();
        },
      });
      rzp.open();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e.message || 'Failed');
    } finally { setLoading(false); }
  };

  const scrollToPlans = () => {
    document.getElementById('switch-plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!sub) {
    return (
      <div className="space-y-6 animate-slide-up">
        <PageHeader
          title="Billing"
          subtitle="Manage your plan, payment methods and invoices — all in one place."
        />
        <StatsSkeleton count={3} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2"><CardSkeletonItem /></div>
          <CardSkeletonItem />
        </div>
        <CardSkeletonGrid count={3} />
      </div>
    );
  }

  const plan = sub.plan;
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : '—';

  return (
    <>
      <div className="space-y-6 animate-slide-up">
        <PageHeader
          title="Billing"
          subtitle="Manage your plan, payment methods and invoices — all in one place."
          actions={
            canManage ? (
              <Button leftIcon={<Sparkles size={15} />} onClick={scrollToPlans}>
                Upgrade plan
              </Button>
            ) : undefined
          }
        />

        {/* ── 1. Current plan hero ─────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden">
          <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-emerald-100/90 font-bold">Current plan</div>
              <div className="text-3xl font-bold mt-1 flex items-center gap-2">
                {plan.name} <Crown size={20} className="text-amber-300" />
              </div>
              <div className="text-sm text-white/75 mt-1.5">
                Status: <b>{sub.status}</b> · {sub.autoRenew ? 'Auto-renews' : 'Renews'} {periodEnd}
              </div>
              {sub.lastRenewalError ? (
                <div className="text-xs text-amber-200 mt-1.5 font-bold flex items-center gap-1">
                  <AlertCircle size={12} /> Last renewal failed: {sub.lastRenewalError}
                </div>
              ) : null}
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">₹{Number(plan.monthlyPrice).toLocaleString()}<span className="text-sm font-normal text-white/60">/mo</span></div>
              <div className="flex flex-col items-end gap-1.5 mt-3">
                {(() => {
                  const autoRenewBtn = (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!canManage) return;
                        try {
                          await billingApi.toggleAutoRenew(!sub.autoRenew);
                          toast.success(`Auto-renew ${!sub.autoRenew ? 'enabled' : 'disabled'}`);
                          await load();
                        } catch (e: any) {
                          toast.error(e?.response?.data?.error || 'Failed');
                        }
                      }}
                      disabled={!canManage}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${
                        sub.autoRenew ? 'bg-emerald-300 text-emerald-950' : 'bg-white/10 text-white'
                      } disabled:opacity-50`}
                    >
                      <Sparkles size={12} /> Auto-renew {sub.autoRenew ? 'ON' : 'OFF'}
                    </button>
                  );
                  const needsCard = !sub.autoRenew && paymentMethods.filter((m: any) => m.isDefault).length === 0;
                  return needsCard
                    ? <Tooltip content="Save a card when you next purchase a plan">{autoRenewBtn}</Tooltip>
                    : autoRenewBtn;
                })()}
              </div>
              {sub.autoRenew && paymentMethods.filter((m: any) => m.isDefault).length === 0 && (
                <div className="text-[10px] text-amber-200 mt-1.5 max-w-[200px]">
                  ⚠ No default card — auto-renew will fail until you save one
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 2. Payment methods ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6">
          {/* Payment methods */}
          <Card className="p-0">
            <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
              <div>
                <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <CreditCard size={16} className="text-slate-400" /> Payment methods
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Used to auto-renew your subscription</p>
              </div>
            </div>
            {paymentMethods.length === 0 ? (
              <div className="px-5 pb-5">
                <div className="text-xs text-slate-500 bg-slate-50 rounded-2xl p-3 border border-slate-200">
                  No saved cards yet. Tick <b>Save card for auto-renewal</b> the next time you purchase or switch a plan to add one.
                </div>
              </div>
            ) : (
              <div className="border-t border-slate-100">
                {paymentMethods.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 last:border-b-0">
                    <div className="w-10 h-7 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-600">
                      {(m.brand || m.method || 'CARD').slice(0, 4).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-slate-900 truncate">{m.label || `${m.brand || 'Card'} •••• ${m.last4 || ''}`}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {m.expiryMonth ? `Expires ${String(m.expiryMonth).padStart(2, '0')}/${m.expiryYear}` : (m.upiVpa || 'Saved at checkout')}
                        {m.failureCount ? ` · last failed (${m.failureCount}x)` : ''}
                      </div>
                    </div>
                    {m.isDefault ? (
                      <Badge variant="emerald" dot>Default</Badge>
                    ) : canManage ? (
                      <Button variant="ghost" size="sm" onClick={() => setDefaultMethod(m.id)}>Make default</Button>
                    ) : null}
                    {canManage && (
                      <Button variant="ghost" size="sm" onClick={() => removeMethod(m.id)}>Remove</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ── 3. Billing history ───────────────────────────────────────── */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
            <div>
              <h2 className="font-bold text-slate-900 text-base">Billing history</h2>
              <p className="text-xs text-slate-500 mt-0.5">Subscription invoices</p>
            </div>
          </div>
          {invoices.length === 0 ? (
            <div className="px-5 pb-6 text-sm text-slate-500 text-center py-8">
              No invoices yet.
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                    <th className="px-5 py-2.5 font-bold whitespace-nowrap">Date</th>
                    <th className="px-3 py-2.5 font-bold w-full">Invoice</th>
                    <th className="px-3 py-2.5 font-bold text-right whitespace-nowrap">Amount</th>
                    <th className="px-5 py-2.5 font-bold text-right whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3 text-slate-500 whitespace-nowrap tabular-nums">
                        {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-3 py-3 text-slate-700 font-medium">{inv.invoiceNumber || inv.id}</td>
                      <td className="px-3 py-3 text-right font-bold whitespace-nowrap tabular-nums text-slate-900">
                        ₹{Number(inv.totalAmount || 0).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <Badge variant={inv.status === 'PAID' ? 'emerald' : 'slate'} dot>{inv.status || '—'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Switch plan ──────────────────────────────────────────────── */}
        <div id="switch-plan" className="scroll-mt-6">
          <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Sparkles size={18} className="text-emerald-600" /> Switch plan
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((p: any) => {
              const current = p.code === plan.code;
              const isEnterprise = p.code === 'ENTERPRISE';
              const featureLines = planFeatureLines(p);
              const included = featureLines.filter((f) => f.included);
              return (
                <Card key={p.code} className={`p-5 flex flex-col ${current ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/60' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-lg text-slate-900">{p.name}</div>
                    {current && <Badge variant="emerald">Current</Badge>}
                  </div>
                  {p.tagline && <p className="text-xs text-slate-500 mt-1 leading-snug">{p.tagline}</p>}
                  <div className="text-2xl font-bold mt-2.5 text-slate-900">
                    {isEnterprise ? 'Custom' : <>₹{Number(p.monthlyPrice).toLocaleString()}<span className="text-xs font-normal text-slate-500">/mo</span></>}
                  </div>

                  {/* Included features — friendly labels, tier tags, no raw keys */}
                  <ul className="text-xs mt-4 space-y-1.5 flex-1">
                    {included.map((f) => (
                      <li key={f.key} className="flex items-start gap-1.5">
                        <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                        <span className="text-slate-700">
                          {f.label}
                          {f.tag && <span className="ml-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{f.tag}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant="primary"
                    fullWidth
                    className="mt-4"
                    disabled={current || !canManage || loading}
                    onClick={() => change(p.code)}
                  >
                    {current ? 'Active' : isEnterprise ? 'Contact sales' : 'Switch'}
                  </Button>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {confirmUi}
    </>
  );
}
