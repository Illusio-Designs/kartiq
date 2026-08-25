'use client';

import { useEffect, useState, useCallback } from 'react';
import { Wallet } from 'lucide-react';
import { billingApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Tooltip } from '@/components/ui/Tooltip';
import { TopupModal, WALLET_CHANGED_EVENT } from './TopupModal';

export function WalletPill() {
  const { tenant, isPlatformAdmin } = useAuthStore();
  const [wallet, setWallet] = useState<{ balance: number; lowBalance: boolean } | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    billingApi.wallet()
      .then((r) => setWallet(r.data))
      .catch(() => setWallet(null));
  }, []);

  useEffect(() => {
    if (!tenant || isPlatformAdmin()) return;
    load();
    const onChange = () => load();
    window.addEventListener(WALLET_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(WALLET_CHANGED_EVENT, onChange);
  }, [tenant, isPlatformAdmin, load]);

  if (!tenant || isPlatformAdmin() || !wallet) return null;

  const balance = Number(wallet.balance);
  const isLow = wallet.lowBalance;

  return (
    <>
      <Tooltip content={isLow ? 'Low balance — click to top up' : 'Wallet balance'} side="bottom">
        <button
          onClick={() => setOpen(true)}
          className={`hidden sm:flex items-center gap-2 pl-2 pr-3 h-9 rounded-full border transition-colors ${
            isLow
              ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/15 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/25'
              : 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/25'
          }`}
        >
          <span className="w-6 h-6 rounded-full flex items-center justify-center bg-white/80 dark:bg-white/10">
            <Wallet size={13} />
          </span>
          <span className="text-sm font-bold">₹{balance.toLocaleString()}</span>
        </button>
      </Tooltip>

      <TopupModal open={open} onClose={() => setOpen(false)} currentBalance={balance} />
    </>
  );
}
