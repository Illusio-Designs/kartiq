'use client';

/**
 * "What's new" / changelog drawer.
 *
 * - Slides in from the right when the user clicks the Megaphone in the
 *   Topbar (or fires the `open-changelog` window event).
 * - Reads entries from frontend/data/changelog.ts. Newest first.
 * - Tracks the last-seen entry id in localStorage so a small red dot
 *   appears on the trigger when there's something new.
 * - Esc closes; click outside closes; click any external link closes.
 *
 * No external dep — plain React + a portal. Mount once from
 * DashboardLayout so it's available on every authenticated page.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Megaphone, X, Sparkles } from 'lucide-react';
import { CHANGELOG as STATIC_CHANGELOG, type ChangelogEntry as StaticChangelogEntry, type ChangelogTag } from '@/data/changelog';
import { changelogApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

// Drawer-internal entry shape — same fields whether sourced from the API or
// the legacy data/changelog.ts fallback. The API returns `date` as the
// publishedAt timestamp.
type ChangelogEntry = StaticChangelogEntry;

const STORAGE_KEY = 'changelog-last-seen';

const TAG_STYLES: Record<ChangelogTag, { bg: string; text: string; label: string }> = {
  feature:  { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'NEW' },
  fix:      { bg: 'bg-blue-50 border-blue-200',       text: 'text-blue-700',    label: 'FIX' },
  security: { bg: 'bg-rose-50 border-rose-200',       text: 'text-rose-700',    label: 'SECURITY' },
  improve:  { bg: 'bg-violet-50 border-violet-200',   text: 'text-violet-700',  label: 'IMPROVED' },
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

/** Hook for the Topbar trigger — returns whether there's a new entry.
 *  Pulls the newest entry id from the API (falls back to the static data
 *  file if the request fails so the dot still works in offline / dev). */
export function useChangelogUnread() {
  const [unread, setUnread] = useState(false);
  const { isPlatformAdmin } = useAuthStore();
  const audience: 'tenant' | 'founder' = isPlatformAdmin?.() ? 'founder' : 'tenant';

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (typeof window === 'undefined') return;
      let newestId = '';
      try {
        const r = await changelogApi.list(audience);
        const list: ChangelogEntry[] = r.data || [];
        newestId = list[0]?.id || '';
      } catch {
        newestId = STATIC_CHANGELOG[0]?.id || '';
      }
      if (cancelled) return;
      const seen = window.localStorage.getItem(STORAGE_KEY);
      setUnread(!!newestId && seen !== newestId);
    };
    check();
    const onSeen = () => check();
    window.addEventListener('changelog-seen', onSeen);
    return () => {
      cancelled = true;
      window.removeEventListener('changelog-seen', onSeen);
    };
  }, [audience]);

  return unread;
}

export function ChangelogDrawer() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const { isPlatformAdmin } = useAuthStore();
  const audience: 'tenant' | 'founder' = isPlatformAdmin?.() ? 'founder' : 'tenant';

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) setOpen(false); };
    window.addEventListener('open-changelog', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('open-changelog', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Fetch entries when the drawer opens (cached for the lifetime of the
  // page; if you publish a new entry while the user has the app open,
  // a refresh picks it up). Falls back to the static file on failure.
  useEffect(() => {
    if (!open || entries) return;
    setLoading(true);
    changelogApi.list(audience)
      .then((r) => {
        const list: any[] = r.data || [];
        const normalised: ChangelogEntry[] = list.map((e) => ({
          id: e.id,
          title: e.title,
          tag: e.tag as ChangelogTag,
          highlights: Array.isArray(e.highlights) ? e.highlights : [],
          date: typeof e.date === 'string' ? e.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
        }));
        setEntries(normalised.length ? normalised : STATIC_CHANGELOG);
      })
      .catch(() => setEntries(STATIC_CHANGELOG))
      .finally(() => setLoading(false));
  }, [open, entries, audience]);

  // Mark the newest entry as seen the first time the drawer is opened.
  useEffect(() => {
    if (!open || !entries || entries.length === 0) return;
    const newest = entries[0]?.id;
    if (newest) {
      window.localStorage.setItem(STORAGE_KEY, newest);
      window.dispatchEvent(new Event('changelog-seen'));
    }
  }, [open, entries]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="What's new"
      className="fixed inset-0 z-[10000] flex justify-end bg-slate-900/40 backdrop-blur-sm animate-fade-in"
    >
      {/* Click-outside backdrop — a real <button> so it satisfies a11y rules
          and is keyboard-reachable. Sits behind the panel via z-order. */}
      <button
        type="button"
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default"
        tabIndex={-1}
      />
      <div
        className="relative w-full max-w-md h-full bg-white shadow-2xl shadow-slate-900/30 flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white flex items-center justify-center">
            <Sparkles size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-900">What&apos;s new</h2>
            <p className="text-xs text-slate-500">Recent releases and improvements.</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="p-2 -m-2 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading && !entries ? (
            <div className="text-center py-12 text-sm text-slate-400">Loading…</div>
          ) : !entries || entries.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-400">No releases yet.</div>
          ) : (
            entries.map((entry) => <ChangelogCard key={entry.id} entry={entry} />)
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-500 bg-slate-50">
          We ship every week. Keep an eye on this drawer for upcoming changes.
        </div>
      </div>
    </div>,
    document.body
  );
}

function ChangelogCard({ entry }: { entry: ChangelogEntry }) {
  const tag = TAG_STYLES[entry.tag];
  return (
    <article className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${tag.bg} ${tag.text}`}>
          {tag.label}
        </span>
        <span className="text-[11px] text-slate-400">{formatDate(entry.date)}</span>
      </div>
      <h3 className="font-bold text-slate-900 text-sm">{entry.title}</h3>
      <ul className="mt-3 space-y-1.5">
        {entry.highlights.map((h, i) => (
          <li key={i} className="text-xs text-slate-600 leading-relaxed flex gap-2">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-500 flex-shrink-0" />
            <span>{h}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

/**
 * Small Topbar trigger — render `<ChangelogTrigger />` somewhere in the
 * topbar. Shows a red dot when there's an unseen entry; clicking fires
 * `open-changelog` which the drawer (mounted in DashboardLayout) listens
 * for.
 */
export function ChangelogTrigger({ className = '' }: { className?: string }) {
  const unread = useChangelogUnread();
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('open-changelog'))}
      aria-label={unread ? "What's new — unread updates" : "What's new"}
      className={`relative w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors ${className}`}
    >
      <Megaphone size={16} />
      {unread && (
        <span
          aria-hidden
          className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"
        />
      )}
    </button>
  );
}
