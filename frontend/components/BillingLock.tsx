'use client';

/**
 * Hard lock that overlays the dashboard children when the tenant can't
 * legitimately use the product anymore:
 *   • TRIALING but currentPeriodEnd has passed
 *   • PAST_DUE   (auto-renew failed or trial rolled past-due)
 *   • EXPIRED    (sub fully lapsed after grace period)
 *   • tenant.status === 'SUSPENDED' / 'CANCELLED'
 *
 * Pass-through allowed for two paths so the user can actually fix the
 * problem:
 *   • /dashboard/billing   — pick plan, top up wallet, save card
 *   • /settings            — update email / phone, change password, 2FA
 *
 * The component refreshes /billing/usage every 5 minutes so a long-open
 * tab still locks itself when the cron flips status overnight.
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock, ArrowRight, AlertTriangle, CreditCard } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { billingApi } from '@/lib/api';

const PASSTHROUGH_PREFIXES = ['/dashboard/billing', '/settings'];

interface SubLite {
  status?: string;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  pastDueSince?: string | null;
  gracePeriodEndsAt?: string | null;
  lastRenewalError?: string | null;
}

interface MethodLite {
  brand?: string | null;
  last4?: string | null;
  isActive?: boolean;
  failureCount?: number;
  lastFailureReason?: string | null;
}

interface UsageData {
  subscription?: SubLite;
  paymentMethod?: MethodLite | null;
}

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / 86_400_000));
}

export function BillingLock({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { subscription, tenant, user } = useAuthStore();
  const [fresh, setFresh] = useState<UsageData>({ subscription: subscription || undefined });

  // Platform admins are not tenants — never lock them.
  const isPlatformAdmin = !!user?.isPlatformAdmin;

  // Pull a live copy so an open tab catches the cron's TRIALING→PAST_DUE
  // flip without requiring a full reload.
  useEffect(() => {
    if (isPlatformAdmin) return;
    let cancelled = false;
    const refresh = () => billingApi.usage()
      .then((r) => {
        if (cancelled) return;
        const data = r.data || {};
        setFresh({
          subscription: data.subscription || undefined,
          paymentMethod: data.paymentMethod || null,
        });
      })
      .catch(() => { /* fail silent — fall back to whatever state we already have */ });
    refresh();
    const t = setInterval(refresh, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isPlatformAdmin]);

  if (isPlatformAdmin) return <>{children}</>;

  const sub: SubLite = fresh.subscription || subscription || {};
  const method: MethodLite | null = fresh.paymentMethod ?? null;
  const status = sub.status;
  const trialEnd = sub.trialEndsAt || sub.currentPeriodEnd;
  const trialExpired =
    status === 'TRIALING' && trialEnd && new Date(trialEnd).getTime() < Date.now();
  const pastDue = status === 'PAST_DUE';
  const expired = status === 'EXPIRED';
  const tenantStatus = tenant?.status;
  const suspended = tenantStatus === 'SUSPENDED' || tenantStatus === 'CANCELLED' || tenantStatus === 'DELETED';

  const locked = trialExpired || pastDue || expired || suspended;
  if (!locked) return <>{children}</>;

  // Allow the user to fix the problem on these paths.
  if (PASSTHROUGH_PREFIXES.some((p) => pathname?.startsWith(p))) return <>{children}</>;

  // ── Lockscreen ───────────────────────────────────────────────────────
  let title = 'Your account is locked';
  let body = 'Add a payment method to continue using your workspace.';
  let cta = 'Choose a plan';

  if (trialExpired) {
    title = 'Your free trial has ended';
    body = 'Pick a plan and add a payment method to keep using Kartriq. Your data is safe — adding a plan unlocks everything immediately.';
    cta = 'Choose a plan';
  } else if (pastDue) {
    title = 'Payment past due';
    body = "We couldn't charge your last invoice. Update your payment method to restore access — your data is intact.";
    cta = 'Update payment method';
  } else if (expired) {
    title = 'Subscription expired';
    body = 'Your subscription lapsed beyond the grace period. Reactivate to regain access.';
    cta = 'Reactivate subscription';
  } else if (suspended) {
    if (tenantStatus === 'DELETED') {
      title = 'Account deleted';
      body = 'You (or another owner) deleted this workspace. The data is retained for our records but is no longer accessible. Contact support if this was a mistake.';
      cta = 'Contact support';
    } else {
      title = tenantStatus === 'CANCELLED' ? 'Account cancelled' : 'Account suspended';
      body = 'Contact support if you believe this is an error, or reactivate to continue.';
      cta = 'Contact billing';
    }
  }

  // Surface the actual Razorpay error so users can act without guessing.
  // We prefer the most-recent payment-method failure reason because it's
  // refreshed on every retry attempt; fall back to subscription.lastRenewalError
  // for older databases that don't have the per-method row populated.
  const failureReason = method?.lastFailureReason || sub.lastRenewalError || null;
  const cardLabel = method?.last4
    ? `${method.brand ? method.brand + ' ' : ''}card ending ${method.last4}`
    : 'saved card';
  const cardDeactivated = method && method.isActive === false;

  // Grace-period countdown — only meaningful while PAST_DUE
  let graceCountdown: { days: number; endsAt: Date } | null = null;
  if (pastDue && sub.gracePeriodEndsAt) {
    const endsAt = new Date(sub.gracePeriodEndsAt);
    if (endsAt.getTime() > Date.now()) {
      graceCountdown = { days: daysBetween(new Date(), endsAt), endsAt };
    }
  }

  return (
    <div className="flex-1 px-6 py-12 flex items-start sm:items-center justify-center">
      <div className="max-w-lg w-full text-center bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-xl shadow-slate-900/5">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-5">
          <Lock size={26} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-600 mt-3 leading-relaxed">{body}</p>

        {/* Why the autopay failed — only shown for past-due / expired states */}
        {(pastDue || expired) && failureReason && (
          <div className="mt-5 text-left p-4 rounded-xl bg-rose-50 border border-rose-200">
            <div className="flex items-start gap-2.5">
              <CreditCard size={16} className="text-rose-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0 text-sm">
                <p className="font-bold text-rose-900 dark:text-rose-200">
                  Last attempt on your {cardLabel}
                </p>
                <p className="text-rose-800 mt-0.5 break-words">{failureReason}</p>
                {cardDeactivated && (
                  <p className="text-xs text-rose-700 mt-2 font-medium">
                    We&apos;ve stopped retrying this card. Add a fresh one to resume.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Grace-period countdown — urgent if ≤ 2 days, warning otherwise */}
        {graceCountdown && (
          <div className={`mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
            graceCountdown.days <= 2
              ? 'bg-rose-100 text-rose-700'
              : 'bg-amber-100 text-amber-800'
          }`}>
            <AlertTriangle size={12} />
            {graceCountdown.days === 0
              ? 'Account suspends today'
              : `${graceCountdown.days} day${graceCountdown.days === 1 ? '' : 's'} until suspension`}
          </div>
        )}

        <Link
          href="/dashboard/billing"
          className="mt-7 inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-full shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all"
        >
          {cta} <ArrowRight size={14} />
        </Link>

        <div className="mt-6 pt-6 border-t border-slate-100 text-xs text-slate-500 space-y-1">
          <p>Need help? <a href="mailto:support@kartriq.com" className="font-semibold text-emerald-700 hover:underline">support@kartriq.com</a></p>
          <p className="text-slate-400">Your data isn&apos;t deleted — paying re-opens the workspace exactly as you left it.</p>
        </div>
      </div>
    </div>
  );
}
