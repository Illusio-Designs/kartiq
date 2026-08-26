'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { billingApi, planApi, paymentApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { track, upgradeSession } from '@/lib/analytics';
import {
  CheckCircle2, AlertCircle, Zap, Crown, Sparkles, Wallet, Plus, Settings2,
  Package, Users, Building2, ShoppingBag, Plug, Activity, CreditCard,
} from 'lucide-react';
import { planLimits, planFeatureLines } from '@/lib/planFeatures';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { StatsSkeleton, CardSkeletonItem, CardSkeletonGrid } from '@/components/Shimmer';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Tooltip } from '@/components/ui/Tooltip';
import { TopupModal, WALLET_CHANGED_EVENT } from '@/components/wallet/TopupModal';
import { toast } from '@/store/toast.store';

// Usage meters merged in from the old standalone Usage page. Both pages read the
// same `/billing/usage` payload (billingApi.usage), which already carries the
// used counts, per-metric limits, PAYG overage rates and the total overage cost.
const USAGE_METRICS: Array<{
  key: string;
  limitKey: string;
  planKey: string;
  rateKey: string;
  overageKey: string;
  label: string;
  icon: any;
}> = [
  { key: 'skus',             limitKey: 'skus',           planKey: 'maxSkus',           rateKey: 'extraSkus',       overageKey: 'skus',       label: 'Products (SKUs)',    icon: Package },
  { key: 'ordersThisPeriod', limitKey: 'ordersPerMonth', planKey: 'maxOrdersPerMonth', rateKey: 'extraOrders',     overageKey: 'orders',     label: 'Orders this month',  icon: ShoppingBag },
  { key: 'users',            limitKey: 'users',          planKey: 'maxUsers',          rateKey: 'extraUsers',      overageKey: 'users',      label: 'Team members',       icon: Users },
  { key: 'channels',         limitKey: 'channels',       planKey: 'maxChannels',       rateKey: 'extraChannels',   overageKey: 'channels',   label: 'Connected channels', icon: Plug },
  { key: 'facilities',       limitKey: 'facilities',     planKey: 'maxFacilities',     rateKey: 'extraFacilities', overageKey: 'facilities', label: 'Warehouses',         icon: Building2 },
];

export default function BillingPage() {
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('billing.manage');

  const [sub, setSub] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [wallet, setWallet] = useState<any>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [showWalletSettings, setShowWalletSettings] = useState(false);
  // Wallet is for manual PAYG overage funding only — no autopay.
  const [walletSettings, setWalletSettings] = useState({
    lowBalanceThreshold: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [confirmUi, confirm] = useConfirm();

  const load = async () => {
    const [s, u, p, w, t, m] = await Promise.all([
      billingApi.subscription(),
      billingApi.usage(),
      planApi.list(),
      billingApi.wallet().catch(() => ({ data: null })),
      billingApi.walletTransactions(20).catch(() => ({ data: [] })),
      paymentApi.methods().catch(() => ({ data: [] })),
    ]);
    setSub(s.data); setUsage(u.data); setPlans(p.data);
    const walletData = w.data;
    setWallet(walletData);
    setTxns(t.data?.transactions || (Array.isArray(t.data) ? t.data : []));
    setPaymentMethods(Array.isArray(m.data) ? m.data : []);
    if (walletData) {
      setWalletSettings({
        lowBalanceThreshold: walletData.lowBalanceThreshold ?? '',
      });
    }
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

  const saveWalletSettings = async () => {
    setSavingSettings(true);
    try {
      await billingApi.walletSettings({
        lowBalanceThreshold: walletSettings.lowBalanceThreshold ? Number(walletSettings.lowBalanceThreshold) : undefined,
      });
      toast.success('Wallet settings saved');
      setShowWalletSettings(false);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener(WALLET_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, onChange);
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
      // off later via the wallet settings modal.
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

  const togglePayg = async () => {
    if (!canManage) return;
    await billingApi.togglePayg(!sub?.payAsYouGo);
    await load();
  };

  const scrollToPlans = () => {
    document.getElementById('switch-plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!sub || !usage) {
    return (
      <div className="space-y-6 animate-slide-up">
        <PageHeader
          title="Billing"
          subtitle="Manage your plan, wallet, usage and pay-as-you-go — all in one place."
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
  const totalOverage = Number(usage.totalOverageCost || 0);

  return (
    <>
      <div className="space-y-6 animate-slide-up">
        <PageHeader
          title="Billing"
          subtitle="Manage your plan, wallet, usage and pay-as-you-go — all in one place."
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
                <button
                  onClick={togglePayg}
                  disabled={!canManage}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${
                    sub.payAsYouGo ? 'bg-emerald-300 text-emerald-950' : 'bg-white/10 text-white'
                  } disabled:opacity-50`}
                >
                  <Zap size={12} /> Pay-as-you-go {sub.payAsYouGo ? 'ON' : 'OFF'}
                </button>
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
                    ? <Tooltip content="Save a card on your next top-up first">{autoRenewBtn}</Tooltip>
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

        {/* ── 2. Wallet + Payment methods ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Wallet */}
          {wallet && (
            <Card className="lg:col-span-3 p-6">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                    <Wallet size={20} className="text-emerald-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">Wallet balance</div>
                      {canManage && (
                        <Tooltip content="Wallet settings">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowWalletSettings(true)}
                            aria-label="Wallet settings"
                            className="h-7 w-7"
                          >
                            <Settings2 size={13} />
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                    <div className={`text-3xl font-bold mt-1 ${wallet.lowBalance ? 'text-rose-600' : 'text-slate-900'}`}>
                      ₹{Number(wallet.balance).toLocaleString()}
                    </div>
                    {wallet.lowBalance ? (
                      <div className="text-xs text-rose-600 font-bold mt-1">Low balance — top up soon</div>
                    ) : (
                      <div className="text-xs text-slate-500 mt-1">Used for overage charges when plan limits are exceeded</div>
                    )}
                  </div>
                </div>
                {canManage && (
                  <Button
                    variant="primary"
                    leftIcon={<Plus size={14} />}
                    onClick={() => setTopupOpen(true)}
                  >
                    Top up
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Payment methods */}
          <Card className={`p-0 ${wallet ? 'lg:col-span-2' : 'lg:col-span-5'}`}>
            <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
              <div>
                <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <CreditCard size={16} className="text-slate-400" /> Payment methods
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Used to auto-renew your subscription</p>
              </div>
              {canManage && (
                <Button variant="ghost" size="sm" onClick={() => setTopupOpen(true)}>Add card</Button>
              )}
            </div>
            {paymentMethods.length === 0 ? (
              <div className="px-5 pb-5">
                <div className="text-xs text-slate-500 bg-slate-50 rounded-2xl p-3 border border-slate-200">
                  No saved cards yet. Tick <b>Save card for subscription auto-renewal</b> the next time you top up your wallet to add one.
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

        {/* Wallet settings modal */}
        <Modal
          open={showWalletSettings && canManage}
          onClose={() => setShowWalletSettings(false)}
          title="Wallet settings"
          description="Wallet covers usage above your plan limit. Top up manually whenever you want."
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowWalletSettings(false)}>Cancel</Button>
              <Button variant="primary" onClick={saveWalletSettings} loading={savingSettings}>
                Save settings
              </Button>
            </>
          }
        >
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 mb-4">
            <strong className="font-bold text-slate-900">How the wallet works:</strong>{' '}
            it&apos;s a prepaid balance for usage above your plan ceiling (extra orders, extra SKUs, etc.).
            Top up manually whenever it gets low — there&apos;s no auto-charge.
            Your subscription renewal is handled separately via your saved card under Subscription settings.
          </div>

          <Input
            label="Low balance alert below (₹)"
            hint="We'll email you when the wallet drops under this threshold so you can top up before it runs out."
            type="number"
            value={walletSettings.lowBalanceThreshold}
            onChange={(e) => setWalletSettings(s => ({ ...s, lowBalanceThreshold: e.target.value }))}
            placeholder="e.g. 500"
          />

          {/* Saved cards live here for visibility + management. They are
              used by SUBSCRIPTION renewal — never the wallet. */}
          <div className="mt-5 pt-5 border-t border-slate-100">
            <div className="text-sm font-bold text-slate-900">Saved cards</div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Used to auto-renew your subscription. Wallet top-ups are always one-shot manual charges and never use these.
            </p>
            {paymentMethods.length === 0 ? (
              <div className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-2xl p-3 border border-slate-200">
                No saved cards yet. Tick <b>Save card for subscription auto-renewal</b> the next time you top up your wallet to add one.
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {paymentMethods.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200">
                    <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-xs font-bold text-slate-700">
                      {(m.brand || m.method || 'CARD').slice(0, 4).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-slate-900">{m.label || `${m.brand || 'Card'} •••• ${m.last4 || ''}`}</div>
                      <div className="text-[11px] text-slate-500">
                        {m.expiryMonth ? `Expires ${String(m.expiryMonth).padStart(2,'0')}/${m.expiryYear}` : (m.upiVpa || 'Saved at checkout')}
                        {m.failureCount ? ` · last failed (${m.failureCount}x)` : ''}
                      </div>
                    </div>
                    {m.isDefault ? (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">DEFAULT</span>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setDefaultMethod(m.id)}>Set default</Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => removeMethod(m.id)}>Remove</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>

        {/* ── 3. Usage this period (merged from the old Usage page) ─────── */}
        <Card className="p-0">
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-1 flex-wrap">
            <div>
              <h2 className="font-bold text-slate-900 text-base">Usage this period</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {usage.period ? `${usage.period} · ` : ''}Resets {periodEnd} ·{' '}
                {sub.payAsYouGo ? 'overage draws from your wallet (PAYG on)' : 'PAYG off — usage is capped at plan limits'}
              </p>
            </div>
          </div>
          <div className="p-5 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
            {USAGE_METRICS.map((m) => {
              const used = Number(usage.used?.[m.key] || 0);
              const limitRaw = usage.limits?.[m.limitKey];
              const limit = (limitRaw ?? plan?.[m.planKey]) ?? null;
              const rate = Number(usage.rates?.[m.rateKey] || 0);
              const overageUnits = Number(usage.overage?.[m.overageKey] || 0);
              return (
                <UsageMeter
                  key={m.key}
                  label={m.label}
                  icon={m.icon}
                  used={used}
                  limit={limit}
                  rate={rate}
                  overageUnits={overageUnits}
                  payAsYouGo={!!sub.payAsYouGo}
                  onTopUp={() => setTopupOpen(true)}
                  onUpgrade={canManage ? scrollToPlans : undefined}
                />
              );
            })}
          </div>

          {/* Overage summary */}
          {totalOverage > 0 && (
            <div className="mx-5 mb-5 rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
              <Activity className="text-amber-700 flex-shrink-0 mt-0.5" size={18} />
              <div className="flex-1">
                <h3 className="font-bold text-amber-900 text-sm">Overage this period</h3>
                <p className="text-sm text-amber-800 mt-1">
                  You&apos;ve used more than your plan limit on one or more metrics. Total overage charges so far:{' '}
                  <strong>₹{totalOverage.toFixed(2)}</strong>.
                  {sub.payAsYouGo
                    ? ' These will be deducted from your wallet.'
                    : ' Enable Pay-As-You-Go above to keep working past your limits.'}
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* ── 4. Billing history / wallet transactions ─────────────────── */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
            <div>
              <h2 className="font-bold text-slate-900 text-base">Billing history</h2>
              <p className="text-xs text-slate-500 mt-0.5">Plan charges, wallet top-ups and PAYG overage draws</p>
            </div>
          </div>
          {txns.length === 0 ? (
            <div className="px-5 pb-6 text-sm text-slate-500 text-center py-8">
              No transactions yet.
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                    <th className="px-5 py-2.5 font-bold whitespace-nowrap">Date</th>
                    <th className="px-3 py-2.5 font-bold w-full">Description</th>
                    <th className="px-3 py-2.5 font-bold text-right whitespace-nowrap">Amount</th>
                    <th className="px-5 py-2.5 font-bold text-right whitespace-nowrap">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {txns.map((t: any) => {
                    const isCredit = ['TOPUP', 'REFUND'].includes(t.type);
                    const amt = Number(t.amount);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3 text-slate-500 whitespace-nowrap tabular-nums">
                          {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-3 py-3 text-slate-700 font-medium">{t.description || t.type}</td>
                        <td className={`px-3 py-3 text-right font-bold whitespace-nowrap tabular-nums ${isCredit ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isCredit ? '+' : '−'}₹{Math.abs(amt).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <Badge variant={isCredit ? 'emerald' : 'slate'} dot>{t.type}</Badge>
                        </td>
                      </tr>
                    );
                  })}
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
              const limits = planLimits(p);
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

                  {/* Limits — a labelled grid, not a raw dump */}
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 mt-4 pt-4 border-t border-slate-100">
                    {limits.map((l) => (
                      <div key={l.label} className="min-w-0">
                        <dt className="text-[10px] uppercase tracking-wide text-slate-400 font-bold truncate">{l.label}</dt>
                        <dd className="text-sm font-bold text-slate-900 tabular-nums truncate">{l.value}</dd>
                      </div>
                    ))}
                  </dl>

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

      <TopupModal
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        currentBalance={wallet ? Number(wallet.balance) : undefined}
      />

      {confirmUi}
    </>
  );
}

// Single usage meter — progress bar turns amber near the limit (>=80%) and rose
// when over. Unlimited metrics (null limit) render without a bar.
function UsageMeter({
  label, icon: Icon, used, limit, rate, overageUnits, payAsYouGo, onTopUp, onUpgrade,
}: {
  label: string;
  icon: any;
  used: number;
  limit: number | null;
  rate: number;
  overageUnits: number;
  payAsYouGo: boolean;
  onTopUp?: () => void;
  onUpgrade?: () => void;
}) {
  const isUnlimited = limit === null || limit === undefined;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit as number)) * 100));
  const overLimit = !isUnlimited && used > (limit as number);
  const nearLimit = !isUnlimited && pct >= 80 && !overLimit;
  const barClass = overLimit ? 'bg-rose-500' : nearLimit ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className="text-slate-400 flex-shrink-0" />
        <span className="text-[13px] font-bold text-slate-800">{label}</span>
        {overLimit && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            Over limit
          </span>
        )}
        {nearLimit && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            Near limit
          </span>
        )}
        <span className={`text-xs text-slate-500 tabular-nums ${overLimit || nearLimit ? '' : 'ml-auto'}`}>
          {used.toLocaleString()} / {isUnlimited ? '∞' : (limit as number).toLocaleString()}
        </span>
      </div>
      {!isUnlimited ? (
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${overLimit ? 100 : pct}%` }} />
        </div>
      ) : (
        <div className="text-[11px] text-emerald-700 font-bold">Unlimited on this plan</div>
      )}
      {(overLimit || nearLimit) && (
        <div className="mt-1.5 flex items-start justify-between gap-3 text-[11px]">
          <span className="text-slate-600">
            {overLimit ? (
              payAsYouGo ? (
                <>
                  <strong>{(used - (limit as number)).toLocaleString()}</strong> over limit
                  {rate > 0 && (
                    <> · ₹{rate}/unit · <strong>₹{(overageUnits * rate).toFixed(2)}</strong> this period</>
                  )}
                </>
              ) : (
                <span className="text-rose-700 font-semibold">PAYG is OFF — new {label.toLowerCase()} are blocked.</span>
              )
            ) : (
              <span className="text-amber-700">{pct}% used — getting close to your limit.</span>
            )}
          </span>
          {/* Inline action: over-limit without PAYG → upgrade; otherwise top up. */}
          {overLimit && !payAsYouGo && onUpgrade ? (
            <button type="button" onClick={onUpgrade} className="shrink-0 font-bold text-emerald-600 hover:text-emerald-700 whitespace-nowrap">Upgrade →</button>
          ) : onTopUp ? (
            <button type="button" onClick={onTopUp} className="shrink-0 font-bold text-emerald-600 hover:text-emerald-700 whitespace-nowrap">Top up →</button>
          ) : null}
        </div>
      )}
    </div>
  );
}
