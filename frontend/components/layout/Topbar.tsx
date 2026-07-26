'use client';

import { useEffect, useState } from 'react';
import { Search, Menu, Sparkles, X } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { useSearchStore } from '@/store/search.store';
import { Tooltip } from '@/components/ui/Tooltip';
import { ChangelogTrigger } from '@/components/ChangelogDrawer';
import { HelpTrigger } from '@/components/HelpDrawer';
import { InboxTrigger } from '@/components/InboxDrawer';
import { UserMenu } from '@/components/UserMenu';
import { WalletPill } from '@/components/wallet/WalletPill';

export function Topbar() {
  const { user, hasPermission } = useAuthStore();
  const { setMobileSidebar } = useUIStore();
  const { query, setQuery, clear } = useSearchStore();
  const isPlatformAdmin = !!user?.isPlatformAdmin;

  // Topbar visibility, per audience:
  //   • Ask AI — tenant-only product surface; founders work in /admin
  //     where the AI assistant doesn't apply yet.
  //   • Wallet pill — only the roles that actually own the wallet
  //     numbers (billing.read|manage). STAFF / MANAGER without billing
  //     don't get a meaningless balance widget; founders never have a
  //     per-tenant wallet to show.
  // Theme, search, what's-new, help, inbox, user-menu remain universal.
  const showAskAi  = !isPlatformAdmin;
  const showWallet = !isPlatformAdmin && hasPermission('billing.read', 'billing.manage');

  // Platform-correct shortcut label, decided client-side after mount.
  // Server renders nothing for the chip (mounted=false) so we never
  // hydrate "Ctrl+K" only to swap it to "⌘K" a frame later on a Mac.
  // After mount we know the user's platform and render the right glyph
  // exactly once.
  const [mounted, setMounted] = useState(false);
  const [shortcutLabel, setShortcutLabel] = useState('Ctrl+K');
  useEffect(() => {
    const isMac = /Mac|iPod|iPhone|iPad/i.test(
      navigator.platform || navigator.userAgent || ''
    );
    setShortcutLabel(isMac ? '⌘K' : 'Ctrl+K');
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-[#0B1220]/95 backdrop-blur-xl border-b border-white/10 px-4 md:px-6 h-16 flex items-center gap-3">
      {/* Mobile menu toggle */}
      <button
        onClick={() => setMobileSidebar(true)}
        className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-white/70 transition-colors"
      >
        <Menu size={18} />
      </button>

      {/* Search — single visible control. Type into it to filter the
          current page (per-page useSearchStore). Press ⌘K / Ctrl+K (or
          click the kbd chip on the right) to open the global command
          palette instead. */}
      <div className="relative flex-1 min-w-0 max-w-xl group">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 group-focus-within:text-emerald-300 transition-colors" />
        <input
          // Short placeholder so it doesn't truncate on a 375px phone
          // where the input shrinks to ~210px. The visible ⌘K chip on
          // the right still communicates the command-palette shortcut
          // for desktop users.
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-11 pr-12 sm:pr-20 py-2.5 text-sm text-white bg-white/[0.06] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 rounded-xl focus:outline-none focus:ring-4 focus:ring-emerald-500/15 focus:border-emerald-400/60 placeholder:text-white/45 transition-all"
        />
        {query ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 rounded-md transition-colors"
          >
            <X size={14} />
          </button>
        ) : mounted ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
            aria-label={`Open command palette (${shortcutLabel})`}
            title="Open command palette"
            // Hidden below `sm:` so the input doesn't have to share its
            // already-tight width with a non-essential keyboard hint on
            // phones — the same shortcut still works regardless.
            className="hidden sm:inline-flex absolute right-2 top-1/2 -translate-y-1/2 items-center px-2 py-1 text-[11px] font-bold tracking-tight text-white/70 hover:text-white bg-white/10 hover:bg-white/20 border border-white/15 rounded-md shadow-inner transition-colors whitespace-nowrap"
          >
            {shortcutLabel}
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {/* AI — tenant-only, already md+ only */}
        {showAskAi && (
          <Tooltip content="Ask AI" side="bottom">
            <button className="hidden md:flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-xl transition-colors">
              <Sparkles size={12} /> Ask AI
            </button>
          </Tooltip>
        )}

        {/* Tablet+ utilities — What's new / Help. Both are also reachable
            from the user-menu Quick Links, so hiding them on phones (< sm)
            is safe and stops the topbar from squashing the search input on
            375px screens. */}
        <div className="hidden sm:flex items-center gap-1">
          <Tooltip content="What's new" side="bottom">
            <ChangelogTrigger />
          </Tooltip>
          <Tooltip content="Help & Support" side="bottom">
            <HelpTrigger />
          </Tooltip>
        </div>

        {/* Wallet — md+ only on phones, since the balance label widens
            the row past the inbox/avatar pair. ADMIN/ACCOUNTANT can
            still get to it from the menu's Billing & wallet link. */}
        {showWallet && (
          <div className="hidden md:flex">
            <WalletPill />
          </div>
        )}

        {/* Inbox — kept on every breakpoint because the unread badge is
            the primary signal that something needs attention. */}
        <Tooltip content="Inbox" side="bottom">
          <InboxTrigger />
        </Tooltip>

        {/* Avatar + dropdown — also always visible. */}
        <UserMenu />
      </div>
    </header>
  );
}
