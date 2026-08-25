'use client';

/**
 * Trial-expiry banner — surfaced inside DashboardLayout when the tenant is
 * on a trialing subscription with <= 7 days left. Polls /billing/usage on
 * mount and refreshes once an hour while the page is open. Tenants can
 * dismiss the banner for the current day via localStorage.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, X, AlertTriangle } from 'lucide-react';
import { billingApi } from '@/lib/api';

const DISMISS_KEY = 'trial-banner-dismissed';

function dismissedToday(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(DISMISS_KEY) === new Date().toISOString().slice(0, 10);
}

export function TrialBanner() {
  const [info, setInfo] = useState<{ daysLeft: number; status: string; trialEndsAt: Date } | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (dismissedToday()) { setHidden(true); return; }

    let cancelled = false;
    const load = async () => {
      try {
        const r = await billingApi.usage();
        const sub = r.data?.subscription;
        const trialEndsAt = sub?.trialEndsAt || sub?.currentPeriodEnd;
        if (!sub || sub.status !== 'TRIALING' || !trialEndsAt) {
          if (!cancelled) setInfo(null);
          return;
        }
        const ends = new Date(trialEndsAt);
        const days = Math.ceil((ends.getTime() - Date.now()) / 86_400_000);
        // Only surface within the final week — earlier than that is just noise.
        if (days > 7) { if (!cancelled) setInfo(null); return; }
        if (!cancelled) setInfo({ daysLeft: days, status: sub.status, trialEndsAt: ends });
      } catch {
        // Unauth / network / 503 — banner is purely advisory, fail silently.
      }
    };
    load();
    const t = setInterval(load, 60 * 60 * 1000); // hourly
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (hidden || !info) return null;

  const isUrgent = info.daysLeft <= 3;
  const isExpired = info.daysLeft <= 0;

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, new Date().toISOString().slice(0, 10));
    setHidden(true);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 px-4 py-2.5 border-b text-sm ${
        isExpired || isUrgent
          ? 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-900/50 dark:text-rose-200'
          : 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900/50 dark:text-amber-200'
      }`}
    >
      {isUrgent || isExpired ? (
        <AlertTriangle size={16} className="flex-shrink-0" />
      ) : (
        <Clock size={16} className="flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <strong className="font-bold">
          {isExpired
            ? 'Your trial has ended.'
            : info.daysLeft === 1
            ? '1 day left on your trial.'
            : `${info.daysLeft} days left on your trial.`}
        </strong>{' '}
        <span className="opacity-90">
          {isExpired
            ? 'Add a payment method to keep using your workspace.'
            : 'Upgrade now to avoid losing access to your data.'}
        </span>
      </div>
      <Link
        href="/dashboard/billing"
        className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${
          isExpired || isUrgent
            ? 'bg-rose-600 text-white hover:bg-rose-700'
            : 'bg-amber-600 text-white hover:bg-amber-700'
        }`}
      >
        {isExpired ? 'Add payment method' : 'Upgrade plan'}
      </Link>
      {!isExpired && (
        <button
          onClick={dismiss}
          aria-label="Dismiss for today"
          className="p-1 -m-1 opacity-60 hover:opacity-100 flex-shrink-0"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
