'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { billingApi, planApi, paymentApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { track, upgradeSession } from '@/lib/analytics';
import { CheckCircle2, AlertCircle, Zap, Crown, Sparkles, X, Wallet, Plus, Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Loader } from '@/components/ui/Loader';
import { Modal } from '@/components/ui/Modal';
import { TopupModal, WALLET_CHANGED_EVENT } from '@/components/wallet/TopupModal';
import { toast } from '@/store/toast.store';

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
    if (!confirm('Remove this saved card?')) return;
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

  if (!sub || !usage) return <DashboardLayout><Loader fullScreen size="lg" /></DashboardLayout>;

  const plan = sub.plan;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent">Billing & Subscription</h1>
          <p className="text-slate-500 mt-1">Manage your plan, usage and pay-as-you-go.</p>
        </div>

        {/* Current plan */}
        <div className="bg-gradient-to-br from-[#0B1220] to-emerald-600 text-white p-6 rounded-3xl shadow-xl">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-emerald-300 font-bold">Current plan</div>
              <div className="text-3xl font-bold mt-1 flex items-center gap-2">
                {plan.name} <Crown size={20} className="text-amber-400" />
              </div>
              <div className="text-sm text-white/70 mt-1">
                Status: <b>{sub.status}</b> · {sub.autoRenew ? 'Auto-renews' : 'Renews'} {new Date(sub.currentPeriodEnd).toLocaleDateString()}
              </div>
              {sub.lastRenewalError ? (
                <div className="text-xs text-amber-300 mt-1 font-bold flex items-center gap-1">
                  <AlertCircle size={12} /> Last renewal failed: {sub.lastRenewalError}
                </div>
              ) : null}
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">₹{Number(plan.monthlyPrice).toLocaleString()}<span className="text-sm font-normal text-white/60">/mo</span></div>
              <div className="flex flex-col items-end gap-1.5 mt-2">
                <button
                  onClick={togglePayg}
                  disabled={!canManage}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${
                    sub.payAsYouGo ? 'bg-emerald-400 text-slate-900' : 'bg-white/10 text-white'
                  } disabled:opacity-50`}
                >
                  <Zap size={12} /> Pay-as-you-go {sub.payAsYouGo ? 'ON' : 'OFF'}
                </button>
                <button
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
                    sub.autoRenew ? 'bg-emerald-400 text-slate-900' : 'bg-white/10 text-white'
                  } disabled:opacity-50`}
                  title={!sub.autoRenew && paymentMethods.filter((m: any) => m.isDefault).length === 0 ? 'Save a card on your next top-up first' : undefined}
                >
                  <Sparkles size={12} /> Auto-renew {sub.autoRenew ? 'ON' : 'OFF'}
                </button>
              </div>
              {sub.autoRenew && paymentMethods.filter((m: any) => m.isDefault).length === 0 && (
                <div className="text-[10px] text-amber-300 mt-1 max-w-[200px]">
                  ⚠ No default card — auto-renew will fail until you save one
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Wallet */}
        {wallet && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                  <Wallet size={20} className="text-emerald-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">Wallet balance</div>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowWalletSettings(true)}
                        title="Wallet settings"
                        className="h-7 w-7"
                      >
                        <Settings2 size={13} />
                      </Button>
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

            {txns.length > 0 && (
              <div className="mt-5 pt-5 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Recent transactions</div>
                <div className="space-y-1">
                  {txns.slice(0, 5).map((t: any) => {
                    const isCredit = ['TOPUP', 'REFUND'].includes(t.type);
                    const amt = Number(t.amount);
                    return (
                      <div key={t.id} className="flex items-center justify-between py-1.5 text-sm">
                        <div>
                          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${isCredit ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          <span className="font-medium text-slate-700">{t.description || t.type}</span>
                          <span className="text-xs text-slate-400 ml-2">
                            {new Date(t.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <span className={`font-bold ${isCredit ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isCredit ? '+' : ''}₹{Math.abs(amt).toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}

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

        {/* Usage */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <UsageCard label="Facilities"  used={usage.used.facilities}      limit={plan.maxFacilities} />
          <UsageCard label="SKUs"        used={usage.used.skus}            limit={plan.maxSkus} />
          <UsageCard label="Users"       used={usage.used.users}           limit={plan.maxUsers} />
          <UsageCard label="Roles"       used={usage.used.roles}           limit={plan.maxUserRoles} />
          <UsageCard label="Orders (mo)" used={usage.used.ordersThisPeriod} limit={plan.maxOrdersPerMonth} />
        </div>

        {/* Plans */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Sparkles size={18} className="text-emerald-600" /> Switch plan
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((p: any) => {
              const current = p.code === plan.code;
              const features = Object.entries(p.features || {});
              return (
                <div key={p.code} className={`p-5 rounded-2xl border-2 ${current ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-lg">{p.name}</div>
                    {current && <span className="text-xs font-bold text-emerald-700">CURRENT</span>}
                  </div>
                  <div className="text-2xl font-bold mt-2">₹{Number(p.monthlyPrice).toLocaleString()}<span className="text-xs text-slate-500">/mo</span></div>
                  <div className="text-xs text-slate-500 mt-2 space-y-1">
                    <div>{p.maxFacilities ?? '∞'} facilities · {p.maxSkus ? p.maxSkus.toLocaleString() : '∞'} SKUs</div>
                    <div>{p.maxUserRoles ?? '∞'} roles · {p.maxUsers ?? '∞'} users</div>
                  </div>
                  <ul className="text-xs mt-3 space-y-1.5">
                    {features.slice(0, 6).map(([k, v]) => (
                      <li key={k} className="flex items-center gap-1.5">
                        {v ? <CheckCircle2 size={12} className="text-emerald-600" /> : <X size={12} className="text-slate-300" />}
                        <span className={v ? 'text-slate-700' : 'text-slate-400'}>{k}</span>
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
                    {current ? 'Active' : 'Switch'}
                  </Button>
                </div>
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
    </DashboardLayout>
  );
}

function UsageCard({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const danger = limit && pct >= 90;
  return (
    <div className="p-4 rounded-2xl bg-white border border-slate-200">
      <div className="text-xs font-semibold text-slate-500 uppercase">{label}</div>
      <div className="text-2xl font-bold mt-1">
        {used}<span className="text-sm text-slate-400"> / {limit ?? '∞'}</span>
      </div>
      {limit && (
        <div className="h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
          <div className={`h-full ${danger ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {danger && <div className="text-[10px] text-red-600 mt-1 flex items-center gap-1"><AlertCircle size={10} /> Near limit</div>}
    </div>
  );
}
