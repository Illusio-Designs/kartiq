'use client';

/**
 * Topbar avatar dropdown.
 *
 * Replaces the static avatar button. Shows the signed-in user's profile
 * snapshot at the top, then quick links to the most-used account pages
 * and a sign-out at the bottom.
 *
 * Founder-only items (Platform admin link, Stop impersonating) appear
 * conditionally so a normal tenant user doesn't see them.
 *
 * The menu closes on:
 *   - clicking any item
 *   - clicking outside the popover
 *   - pressing Escape
 *   - route change (handled by useRouter callback)
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  ChevronDown, User, CreditCard, Users, BarChart3, Settings, LogOut,
  ShieldCheck, ArrowLeft, Megaphone, LifeBuoy, Sparkles,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { Avatar } from '@/components/ui/Avatar';
import { Tooltip } from '@/components/ui/Tooltip';

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const {
    user, tenant, logout,
    impersonatingTenant, stopImpersonation, isPlatformAdmin, hasPermission,
  } = useAuthStore();

  const displayUser = user || { name: 'Dev User', role: 'SUPER_ADMIN', email: 'dev@kartriq.in', isPlatformAdmin: false };
  const isFounder = !!isPlatformAdmin?.();
  const isOnAdmin = pathname?.startsWith('/admin') ?? false;

  // Permission flags drive which tenant-side menu items appear. We only
  // evaluate them for non-founders since founders skip the whole tenant
  // section anyway. hasPermission resolves the user's role-derived
  // permission set against the requested code(s); platform admins get a
  // blanket *yes* but we never reach here for them (every gate below is
  // wrapped in `!isFounder`).
  //
  // Expected matrix against the default seed in backend/src/scripts/seed.js:
  //   ROLE        billing.* users.invite users.update
  //   ADMIN       ✓         ✓            ✓
  //   MANAGER     ✗         ✓            ✓
  //   ACCOUNTANT  billing.read only — invite/update ✗
  //   STAFF       *.read only (incl. billing.read) — write perms ✗
  //
  // Billing & Usage — billing.read OR billing.manage. Resolves to
  //   { ADMIN, ACCOUNTANT, STAFF } per the matrix. STAFF inclusion is
  //   intentional: they get read-only insight into the wallet/usage
  //   page (no upgrade button server-side gates them out of writes).
  const canSeeBilling = !isFounder && hasPermission('billing.read', 'billing.manage');
  const canSeeUsage   = !isFounder && hasPermission('billing.read', 'billing.manage');
  // Team — gated on a WRITE permission so we don't surface a "manage
  // teammates" link to roles that land on the page and find every
  // action disabled. Resolves to { ADMIN, MANAGER } per the matrix.
  const canSeeTeam    = !isFounder && hasPermission('users.invite', 'users.update');

  // Close on outside click + Esc
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Close on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  async function handleSignOut() {
    setOpen(false);
    logout();
    router.push('/login');
  }

  function handleStopImpersonation() {
    stopImpersonation();
    setOpen(false);
    // Reload so all tenant-scoped queries re-fire on the founder's own context.
    window.location.href = '/admin';
  }

  return (
    <div ref={ref} className="relative">
      <Tooltip content={displayUser.name} side="bottom">
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          aria-label={`Account menu for ${displayUser.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`ml-2 flex items-center gap-2 pl-1 pr-3 py-1 rounded-full transition-colors ${
            open ? 'bg-slate-100' : 'hover:bg-slate-100'
          }`}
        >
          <Avatar name={displayUser.name} size="sm" shape="circle" />
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`text-slate-400 hidden sm:block transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </Tooltip>

      {open && (
        <div
          role="menu"
          // w-72 ≈ 288px is the desktop width; on a 375px viewport with
          // surrounding 4px padding the calc cap keeps the menu fully
          // on-screen if a future ancestor adds wider padding.
          className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1rem)] bg-white rounded-2xl shadow-2xl shadow-slate-900/30 border border-slate-200 z-[100] overflow-hidden animate-slide-up"
        >
          {/* Header — profile snapshot */}
          <div className="px-4 py-3 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100 flex items-start gap-3">
            <Avatar name={displayUser.name} size="md" shape="circle" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-slate-900 text-sm truncate">{displayUser.name}</div>
              <div className="text-xs text-slate-500 truncate">{displayUser.email}</div>
              <div className="flex items-center gap-1.5 mt-1">
                {isFounder ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">
                    <ShieldCheck size={9} /> Platform admin
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {displayUser.role || 'Member'}
                  </span>
                )}
                {tenant?.businessName && (
                  <span className="text-[10px] text-slate-400 truncate">· {tenant.businessName}</span>
                )}
              </div>
            </div>
          </div>

          {/* Impersonation banner */}
          {impersonatingTenant && (
            <button
              type="button"
              onClick={handleStopImpersonation}
              className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border-b border-amber-200 transition-colors"
            >
              <ArrowLeft size={13} />
              Stop impersonating <span className="font-bold">{impersonatingTenant.businessName || impersonatingTenant.slug}</span>
            </button>
          )}

          {/* Account — items reflect the user's role-derived permissions:
                ADMIN sees everything (billing, team, usage)
                MANAGER sees team + usage; billing only if their custom
                  role grants billing.read
                ACCOUNTANT sees billing + usage but not team
                STAFF sees only profile + settings + quick links
                Founders see only profile + settings (tenant-shaped links
                  are gated by !isFounder so the menu can't bridge into
                  the tenant shell). */}
          <div className="py-1">
            <SectionLabel>Account</SectionLabel>
            <MenuItem icon={User}     label="My profile" onClick={() => go('/settings?tab=profile')} />
            <MenuItem icon={Settings} label="Settings"   onClick={() => go('/settings')} />
            {canSeeBilling && (
              <MenuItem icon={CreditCard} label="Billing & wallet" onClick={() => go('/dashboard/billing')} />
            )}
            {canSeeTeam && (
              <MenuItem icon={Users} label="Team" onClick={() => go('/dashboard/team')} />
            )}
            {canSeeUsage && (
              <MenuItem icon={BarChart3} label="Usage" onClick={() => go('/usage')} />
            )}
          </div>

          <div className="border-t border-slate-100 py-1">
            <SectionLabel>Quick links</SectionLabel>
            <MenuItem
              icon={Megaphone}
              label="What's new"
              onClick={() => { setOpen(false); window.dispatchEvent(new Event('open-changelog')); }}
            />
            <MenuItem
              icon={LifeBuoy}
              label="Help & support"
              onClick={() => { setOpen(false); window.dispatchEvent(new Event('open-help')); }}
            />
            {!isFounder && (
              <MenuItem
                icon={Sparkles}
                label="Refer a friend"
                onClick={() => go('/referrals')}
              />
            )}
          </div>

          {/* Founder-only — only show "Back to admin" when they have
              somehow ended up off the admin shell (e.g. mid-impersonation
              or a stray deep link). On /admin/* itself we don't surface
              a self-referencing link. */}
          {isFounder && !isOnAdmin && (
            <div className="border-t border-slate-100 py-1">
              <SectionLabel>Platform</SectionLabel>
              <MenuItem
                icon={ShieldCheck}
                label="Back to admin"
                onClick={() => go('/admin')}
              />
            </div>
          )}

          {/* Sign out */}
          <div className="border-t border-slate-100 py-1">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
      {children}
    </div>
  );
}

function MenuItem({
  icon: Icon, label, onClick,
}: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
    >
      <Icon size={15} className="text-slate-400" />
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}
