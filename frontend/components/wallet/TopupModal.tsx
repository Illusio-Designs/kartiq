'use client';

import { useState } from 'react';
import { Plus, Wallet, Sparkles } from 'lucide-react';
import { billingApi, paymentApi } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const QUICK_AMOUNTS = [500, 1000, 2500, 5000];
export const WALLET_CHANGED_EVENT = 'wallet:changed';

interface TopupModalProps {
  open: boolean;
  onClose: () => void;
  currentBalance?: number;
}

// Lazy-loads checkout.js the first time we need it. Razorpay's SDK is a
// single global so we cache it on window.
function loadRazorpayCheckout(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function TopupModal({ open, onClose, currentBalance }: TopupModalProps) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveCard, setSaveCard] = useState(true);

  const submit = async (amt: number) => {
    if (!amt || amt <= 0) return;
    setBusy(true);
    setError('');

    try {
      // 1. Create a Razorpay order on the backend
      const { data } = await paymentApi.walletCheckout({ amount: amt, savePaymentMethod: saveCard });

      // Stub mode (no Razorpay creds) — credit directly via the legacy
      // /billing/wallet/topup. Useful for local/dev environments.
      if (data.order?.stub) {
        await billingApi.topupWallet(amt);
        window.dispatchEvent(new CustomEvent(WALLET_CHANGED_EVENT));
        setAmount('');
        onClose();
        return;
      }

      // 2. Open Razorpay Checkout for the user
      const ok = await loadRazorpayCheckout();
      if (!ok) throw new Error('Failed to load Razorpay');
      const rzp = new window.Razorpay!({
        key: data.keyId,
        amount: data.order.amount,
        currency: data.order.currency,
        order_id: data.order.id,
        name: 'Kartriq Wallet',
        description: `Top up ₹${amt.toLocaleString()}`,
        prefill: data.prefill,
        customer_id: data.customerId || undefined,
        theme: { color: '#06D4B8' },
        handler: async (resp: any) => {
          // 3. Verify the signature + credit the wallet on the backend
          await paymentApi.walletVerify({
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
            amount: amt,
          });
          window.dispatchEvent(new CustomEvent(WALLET_CHANGED_EVENT));
          setAmount('');
          onClose();
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      });
      rzp.on('payment.failed', (resp: any) => {
        setError(resp?.error?.description || 'Payment failed');
        setBusy(false);
      });
      rzp.open();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Top up failed');
      setBusy(false);
      return;
    }
    // (don't reset busy here — the Razorpay handler resolves async)
  };

  return (
    <Modal open={open} onClose={onClose} title="Top up wallet" size="md">
      <div className="space-y-5">
        {typeof currentBalance === 'number' && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
              <Wallet size={18} className="text-emerald-600" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">Current balance</div>
              <div className="text-2xl font-bold text-slate-900">₹{Number(currentBalance).toLocaleString()}</div>
            </div>
          </div>
        )}

        <div>
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Quick amounts</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {QUICK_AMOUNTS.map((amt) => (
              <Button
                key={amt}
                variant="secondary"
                size="sm"
                onClick={() => submit(amt)}
                disabled={busy}
              >
                + ₹{amt.toLocaleString()}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Input
            label="Custom amount (₹)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 1500"
            min={1}
          />
        </div>

        <label className="flex items-start gap-3 p-3 rounded-2xl border border-slate-200 cursor-pointer hover:border-emerald-300 transition-colors">
          <input
            type="checkbox"
            checked={saveCard}
            onChange={(e) => setSaveCard(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded text-emerald-600"
          />
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <Sparkles size={14} className="text-emerald-600" /> Save card for subscription auto-renewal
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              We&apos;ll save this card so your plan renews automatically when your billing period ends.
              Wallet top-ups are always one-shot — this card never gets charged for the wallet.
              Manage or remove it any time from Wallet Settings.
            </div>
          </div>
        </label>

        {error && (
          <div className="text-sm text-rose-600 font-medium">{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="primary"
            leftIcon={<Plus size={14} />}
            onClick={() => submit(Number(amount))}
            disabled={!amount || Number(amount) <= 0}
            loading={busy}
          >
            Top up
          </Button>
        </div>
      </div>
    </Modal>
  );
}
