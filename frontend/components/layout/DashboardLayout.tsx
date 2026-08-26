'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SearchRouteReset } from './SearchRouteReset';
import { Breadcrumbs } from './Breadcrumbs';
import { useAuthStore, isTokenExpired } from '@/store/auth.store';
import { MaintenancePage } from '@/components/MaintenancePage';
import { setPlanLimitHandler, authApi, publicApi } from '@/lib/api';
import { Loader } from '@/components/ui/Loader';
import { TrialBanner } from '@/components/TrialBanner';
import { BillingLock } from '@/components/BillingLock';
import { CommandPalette } from '@/components/CommandPalette';
import { ChangelogDrawer } from '@/components/ChangelogDrawer';
import { HelpDrawer } from '@/components/HelpDrawer';
import { InboxDrawer } from '@/components/InboxDrawer';
import { Toaster } from '@/components/ui/Toaster';
import { Eye, X, ArrowLeft, Zap } from 'lucide-react';

// Each page renders its own <DashboardLayout>, so a client-side navigation
// remounts it. Without this module-level flag, `authChecked` would reset to
// false on every navigation and flash the full-screen Loader — the whole
// chrome (sidebar/topbar) would blink out and back on each page jump. Once the
// session has been validated once this session, later mounts render the layout
// immediately and re-validate /auth/me quietly in the background.
let _authValidatedOnce = false;
// Same idea for hydration: a plain module boolean (false during SSR and on the
// very first client render, so there's no hydration mismatch) that flips true
// once persist has hydrated. Later navigations then start with hydrated=true.
let _hydratedOnce = false;

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { impersonatingTenant, stopImpersonation, isPlatformAdmin, setContext, logout } = useAuthStore();
  const [maintenance, setMaintenance] = useState<{ enabled: boolean; message: string; eta: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(_authValidatedOnce);
  const [planLimit, setPlanLimit] = useState<any>(null);
  // zustand `persist` restores the token from localStorage on the client AFTER
  // the first render. Until that finishes, the store token is null — running
  // the auth guard against it would bounce a logged-in user to /login on every
  // refresh. Gate the guard on hydration completing. On later navigations
  // hasHydrated() is already true, so this starts true and never gates.
  const [hydrated, setHydrated] = useState(_hydratedOnce);
  useEffect(() => {
    const mark = () => { _hydratedOnce = true; setHydrated(true); };
    const unsub = useAuthStore.persist.onFinishHydration(mark);
    if (useAuthStore.persist.hasHydrated()) mark();
    return unsub;
  }, []);

  // ── Auth guard: redirect to /login when unauthenticated, expired, or token rejected
  useEffect(() => {
    if (!hydrated) return; // wait until the persisted session is restored
    // Read the live token (post-hydration), falling back to the standalone
    // `token` key that setAuth also writes — so a race on either store never
    // logs the user out spuriously.
    const activeToken =
      useAuthStore.getState().token ||
      (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
    if (!activeToken || isTokenExpired(activeToken)) {
      logout();
      router.replace('/login');
      return;
    }
    // Validate token against /auth/me and refresh context (incl. user phone, etc.)
    authApi.me()
      .then(({ data }) => {
        const { tenant, plan, subscription, permissions, ...userFields } = data;
        setContext({
          user: userFields,
          tenant: tenant ?? null,
          plan: plan ?? null,
          subscription: subscription ?? null,
          permissions: permissions ?? [],
        });
        // Mirror admin layout's behaviour: a platform admin who lands on
        // /dashboard/* without an active impersonation belongs in /admin.
        // We allow them through when impersonating so the orange "viewing
        // as <tenant>" banner has somewhere to be shown.
        if (userFields?.isPlatformAdmin && !impersonatingTenant) {
          router.replace('/admin');
          return;
        }
        _authValidatedOnce = true;
        setAuthChecked(true);
      })
      .catch((err: any) => {
        // Only a 401 means the token is genuinely invalid/expired — log out then.
        // For transient backend failures (5xx / network — common on constrained
        // shared MySQL), keep the already-persisted session and let the user in
        // rather than bouncing them to /login on every refresh.
        if (err?.response?.status === 401) {
          _authValidatedOnce = false;
          logout();
          router.replace('/login');
        } else {
          _authValidatedOnce = true;
          setAuthChecked(true);
        }
      });
  }, [hydrated]);

  // ── Global 402 plan-limit handler
  // Two flavours of 402:
  //   1. Real plan-limit hits (e.g. SKU cap) — show the dismissable banner
  //      so the user can review their usage / upgrade.
  //   2. Trial / past-due lockouts — the backend tags those with an
  //      `upgradeUrl`. Don't bother with the banner; the BillingLock
  //      component already overlays the children with a hard lockscreen,
  //      and a route push gets the user straight to the right page.
  useEffect(() => {
    setPlanLimitHandler((info) => {
      if (info?.upgradeUrl && typeof window !== 'undefined') {
        // Avoid a redirect loop if we're already there
        if (!window.location.pathname.startsWith(info.upgradeUrl)) {
          router.push(info.upgradeUrl);
        }
        return;
      }
      setPlanLimit(info);
    });
    return () => setPlanLimitHandler(null);
  }, [router]);

  useEffect(() => {
    publicApi.maintenance()
      .then(res => { if (res.data) setMaintenance(res.data); })
      .catch(() => {});
  }, []);

  if (!hydrated || !authChecked) {
    return <Loader fullScreen size="lg" />;
  }

  // Show maintenance page for non-admin users
  if (maintenance?.enabled && !isPlatformAdmin()) {
    return <MaintenancePage message={maintenance.message} eta={maintenance.eta} />;
  }

  const exitImpersonation = () => {
    stopImpersonation();
    router.push('/admin/tenants');
  };

  return (
    <div className="flex min-h-screen">
      <SearchRouteReset />
      <Toaster />
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 w-full">
        {impersonatingTenant && (
          <div className="bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 text-white px-4 py-2.5 flex items-center justify-between text-sm font-semibold shadow">
            <div className="flex items-center gap-2">
              <Eye size={14} />
              Viewing as tenant: <span className="font-bold">{impersonatingTenant.businessName}</span>
              <span className="text-white/70 text-xs">({impersonatingTenant.slug})</span>
            </div>
            <button
              onClick={exitImpersonation}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-bold"
            >
              <ArrowLeft size={12} /> Exit to Platform Admin
            </button>
          </div>
        )}
        {isPlatformAdmin() && !impersonatingTenant && (
          <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between text-xs">
            <span>Platform admin viewing global dashboard</span>
            <Link href="/admin" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 font-bold">
              Back to Admin
            </Link>
          </div>
        )}
        {maintenance?.enabled && isPlatformAdmin() && (
          <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-white dark:!bg-white animate-pulse" />
            Maintenance mode is ON — only admins can access the dashboard
          </div>
        )}
        <Topbar />
        {planLimit && (
          <div className="bg-rose-50 border-b border-rose-200 text-rose-800 px-4 py-2.5 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-rose-600" />
              <span className="font-bold">
                {planLimit.error || 'Plan limit reached'}
              </span>
              {planLimit.metric && (
                <span className="text-rose-600">— {planLimit.metric} {planLimit.used ?? ''}/{planLimit.limit ?? '∞'}</span>
              )}
              {planLimit.requiredPlan && (
                <span className="text-rose-600">— requires {planLimit.requiredPlan}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard/billing" className="px-3 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700">
                {planLimit.metric === 'orders' || planLimit.unitRate ? 'Top up wallet' : 'Upgrade'}
              </Link>
              <button
                onClick={() => setPlanLimit(null)}
                className="p-1 hover:bg-rose-100 rounded"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
        <TrialBanner />
        <div className="flex-1 p-4 sm:p-5 lg:p-6 xl:p-8 animate-fade-in flex flex-col">
          {/* One shared content width for EVERY dashboard page — centered and
              capped so pages line up instead of each choosing their own max-w. */}
          <div className="w-full max-w-screen-2xl mx-auto flex flex-1 flex-col">
            <Breadcrumbs />
            <BillingLock>{children}</BillingLock>
          </div>
        </div>
        <CommandPalette />
        <ChangelogDrawer />
        <HelpDrawer />
        <InboxDrawer />
      </main>
    </div>
  );
}
