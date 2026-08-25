'use client';

import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { Tooltip } from '@/components/ui/Tooltip';
import { InboxTrigger } from '@/components/InboxDrawer';
import { UserMenu } from '@/components/UserMenu';
import { WalletPill } from '@/components/wallet/WalletPill';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { pageTitleFor } from './routeLabels';

export function Topbar() {
  const { user, hasPermission } = useAuthStore();
  const { setMobileSidebar } = useUIStore();
  const pathname = usePathname() || '/';
  const pageTitle = pageTitleFor(pathname);
  const isPlatformAdmin = !!user?.isPlatformAdmin;

  // Wallet pill — only roles that own the wallet numbers (billing.read|manage);
  // founders have no per-tenant wallet to show.
  const showWallet = !isPlatformAdmin && hasPermission('billing.read', 'billing.manage');

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#0d1424]/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 h-16 flex items-center gap-3">
      {/* Mobile menu toggle */}
      <button
        onClick={() => setMobileSidebar(true)}
        aria-label="Open menu"
        className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
      >
        <Menu size={18} />
      </button>

      {/* Page title — left-aligned, derived from the current route. Lives here
          (not in the page body) so every dashboard page gains the vertical
          space the big in-page heading used to take. */}
      <h1 className="text-base sm:text-lg font-bold leading-none tracking-tight text-slate-900 dark:text-slate-100 truncate">
        {pageTitle}
      </h1>

      {/* Right cluster — Wallet · Theme · Notifications · Account */}
      <div className="flex items-center gap-1.5 ml-auto">
        {showWallet && (
          <div className="hidden md:flex">
            <WalletPill />
          </div>
        )}

        <ThemeToggle />

        <Tooltip content="Notifications" side="bottom">
          <InboxTrigger />
        </Tooltip>

        <UserMenu />
      </div>
    </header>
  );
}
