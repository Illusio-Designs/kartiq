'use client';

/**
 * Inbox / Notifications drawer.
 *
 * Trigger: Mail-icon button in the Topbar. The trigger polls
 *   GET /notifications/unread-count every 60s for the red-dot badge.
 *
 * Behaviour:
 *   - Tenant users see their personal/tenant feed (rows where userId is
 *     them OR null = broadcast).
 *   - Platform admins see a Platform/Tenant tab toggle so they can flip
 *     between cross-tenant signals (signups, leads, support, payment
 *     failures) and their own tenant notifications.
 *   - Filter chips by category (orders / inventory / tickets / leads /
 *     payments / signup / system).
 *   - Click a row → navigates to its `link` and marks it read.
 *   - "Mark all as read" + delete-one + clear-read.
 *
 * Listens for the `open-inbox` event so the bell button (or any other
 * trigger) can open this drawer without prop-drilling.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Mail, X, Inbox, Check, CheckCircle2, AlertTriangle, AlertCircle, Info,
  Trash2, Package, ShoppingCart, LifeBuoy, MessageSquare, CreditCard,
  UserPlus, Bell, Sparkles,
} from 'lucide-react';
import {
  notificationApi,
  type InboxNotification,
  type NotificationCategory,
  type NotificationSeverity,
} from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

// ─── Display helpers ───────────────────────────────────────────────
const CATEGORY_META: Record<NotificationCategory, { label: string; icon: any; color: string }> = {
  orders:    { label: 'Orders',    icon: ShoppingCart,  color: 'text-emerald-600' },
  inventory: { label: 'Inventory', icon: Package,       color: 'text-amber-600'   },
  tickets:   { label: 'Support',   icon: LifeBuoy,      color: 'text-blue-600'    },
  leads:     { label: 'Leads',     icon: MessageSquare, color: 'text-violet-600'  },
  payments:  { label: 'Payments',  icon: CreditCard,    color: 'text-emerald-600' },
  signup:    { label: 'Signups',   icon: UserPlus,      color: 'text-fuchsia-600' },
  plan:      { label: 'Plan',      icon: Sparkles,      color: 'text-emerald-600' },
  channel:   { label: 'Channels',  icon: Bell,          color: 'text-blue-600'    },
  team:      { label: 'Team',      icon: UserPlus,      color: 'text-blue-600'    },
  system:    { label: 'System',    icon: Bell,          color: 'text-slate-500'   },
};

const SEVERITY_ICON: Record<NotificationSeverity, any> = {
  info:    Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error:   AlertCircle,
};

const SEVERITY_TINT: Record<NotificationSeverity, string> = {
  info:    'bg-slate-50 text-slate-600',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  error:   'bg-rose-50 text-rose-700',
};

function relTime(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Drawer ────────────────────────────────────────────────────────
type Scope = 'tenant' | 'platform';

export function InboxDrawer() {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>('tenant');
  const [category, setCategory] = useState<NotificationCategory | ''>('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { isPlatformAdmin } = useAuthStore();
  const isFounder = !!isPlatformAdmin?.();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = scope === 'platform'
        ? await notificationApi.platformList({ category: category || undefined, unreadOnly: unreadOnly || undefined })
        : await notificationApi.list({ category: category || undefined, unreadOnly: unreadOnly || undefined });
      setItems(res.data.notifications || []);
      setUnread(res.data.unread || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [scope, category, unreadOnly]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) setOpen(false); };
    window.addEventListener('open-inbox', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('open-inbox', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const counts = useMemo(() => {
    const out: Partial<Record<NotificationCategory, number>> = {};
    for (const it of items) out[it.category] = (out[it.category] || 0) + 1;
    return out;
  }, [items]);

  async function markRead(n: InboxNotification) {
    if (n.isRead) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      if (n.scope === 'platform') await notificationApi.platformMarkRead(n.id);
      else await notificationApi.markRead(n.id);
      window.dispatchEvent(new Event('inbox-updated'));
    } catch {/* swallow — the optimistic update is already applied */}
  }

  async function openItem(n: InboxNotification) {
    await markRead(n);
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  async function markAllRead() {
    setUnread(0);
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    try {
      if (scope === 'platform') await notificationApi.platformMarkAllRead();
      else await notificationApi.markAllRead();
      window.dispatchEvent(new Event('inbox-updated'));
    } catch {/* ignore */}
  }

  async function remove(n: InboxNotification) {
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    if (!n.isRead) setUnread((u) => Math.max(0, u - 1));
    try {
      if (n.scope === 'platform') await notificationApi.platformRemove(n.id);
      else await notificationApi.remove(n.id);
      window.dispatchEvent(new Event('inbox-updated'));
    } catch {/* ignore */}
  }

  if (!open || typeof document === 'undefined') return null;

  const filterCategories: NotificationCategory[] = scope === 'platform'
    ? ['signup', 'leads', 'tickets', 'payments', 'system']
    : ['orders', 'inventory', 'tickets', 'payments', 'plan', 'team', 'system'];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Inbox"
      className="fixed inset-0 z-[10000] flex justify-end bg-slate-900/40 backdrop-blur-sm animate-fade-in"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default"
        tabIndex={-1}
      />
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl shadow-slate-900/30 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center">
            <Inbox size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-900">Inbox</h2>
            <p className="text-xs text-slate-500">
              {unread > 0 ? `${unread} unread` : 'All caught up'}
            </p>
          </div>
          <button
            onClick={markAllRead}
            disabled={unread === 0}
            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 disabled:text-slate-300 disabled:cursor-not-allowed"
          >
            Mark all read
          </button>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="p-2 -m-2 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scope tabs (founders only) */}
        {isFounder && (
          <div className="flex border-b border-slate-100 px-5">
            <button
              type="button"
              onClick={() => { setScope('tenant'); setCategory(''); }}
              className={`relative py-3 mr-6 text-sm font-medium transition-colors ${
                scope === 'tenant' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              My tenant
              {scope === 'tenant' && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />}
            </button>
            <button
              type="button"
              onClick={() => { setScope('platform'); setCategory(''); }}
              className={`relative py-3 text-sm font-medium transition-colors ${
                scope === 'platform' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Platform
              {scope === 'platform' && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />}
            </button>
          </div>
        )}

        {/* Filter chips */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-100 flex flex-wrap gap-1.5 items-center">
          <FilterChip
            label="All"
            active={category === ''}
            count={items.length}
            onClick={() => setCategory('')}
          />
          {filterCategories.map((c) => (
            <FilterChip
              key={c}
              label={CATEGORY_META[c].label}
              count={counts[c] || 0}
              active={category === c}
              onClick={() => setCategory(c)}
            />
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
            />
            Unread only
          </label>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-400">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 px-6">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                <Inbox size={20} />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Nothing here</h3>
              <p className="text-xs text-slate-500 mt-1">
                Notifications about {scope === 'platform' ? 'tenant signups, leads, and support' : 'orders, payments, and inventory'} will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((n) => (
                <NotifRow key={n.id} n={n} onOpen={openItem} onRemove={remove} />
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-slate-100 text-[11px] text-slate-500 bg-slate-50 flex items-center justify-between">
          <span>{items.length} shown · refreshes every minute</span>
          <button onClick={load} className="font-medium text-slate-600 hover:text-slate-900">
            Refresh
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function FilterChip({
  label, count, active, onClick,
}: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
        active
          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
      }`}
    >
      {label}{count ? <span className="ml-1 text-slate-400">{count}</span> : null}
    </button>
  );
}

function NotifRow({
  n, onOpen, onRemove,
}: {
  n: InboxNotification;
  onOpen: (n: InboxNotification) => void;
  onRemove: (n: InboxNotification) => void;
}) {
  const Cat = CATEGORY_META[n.category] || CATEGORY_META.system;
  const SevIcon = SEVERITY_ICON[n.severity] || Info;
  return (
    <li className={`relative group ${n.isRead ? 'bg-white' : 'bg-emerald-50/40'}`}>
      <button
        type="button"
        onClick={() => onOpen(n)}
        className="w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${SEVERITY_TINT[n.severity]}`}>
          <SevIcon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h4 className={`text-sm flex-1 min-w-0 truncate ${n.isRead ? 'font-medium text-slate-700' : 'font-bold text-slate-900'}`}>
              {n.title}
            </h4>
            <span className="text-[10px] text-slate-400 flex-shrink-0">{relTime(n.createdAt)}</span>
          </div>
          {n.body && (
            <p className="text-xs text-slate-600 mt-1 line-clamp-2">{n.body}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1.5">
            <Cat.icon size={11} className={Cat.color} />
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
              {Cat.label}
            </span>
            {!n.isRead && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-500" aria-label="unread" />
            )}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(n); }}
        aria-label="Dismiss"
        className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

// ─── Topbar trigger (Mail icon + unread badge) ────────────────────
export function InboxTrigger({ className = '' }: { className?: string }) {
  const [count, setCount] = useState(0);
  const { user, isPlatformAdmin } = useAuthStore();
  const tenantPollRef = useRef<number | null>(null);

  const fetchCount = useCallback(async () => {
    try {
      // Tenant + platform counts are summed for the badge so a founder
      // sees one number across both scopes. Either request may 401/403
      // depending on context — we just zero those out.
      const tasks: Promise<number>[] = [];
      tasks.push(
        notificationApi.unreadCount()
          .then((r) => r.data?.count || 0).catch(() => 0)
      );
      if (isPlatformAdmin?.()) {
        tasks.push(
          notificationApi.platformUnreadCount()
            .then((r) => r.data?.count || 0).catch(() => 0)
        );
      }
      const [a, b = 0] = await Promise.all(tasks);
      setCount(a + b);
    } catch {
      setCount(0);
    }
  }, [isPlatformAdmin]);

  useEffect(() => {
    if (!user) return;
    fetchCount();
    // Background poll every 60s for the bell badge
    tenantPollRef.current = window.setInterval(fetchCount, 60_000);
    const onUpdate = () => fetchCount();
    window.addEventListener('inbox-updated', onUpdate);
    return () => {
      if (tenantPollRef.current) window.clearInterval(tenantPollRef.current);
      window.removeEventListener('inbox-updated', onUpdate);
    };
  }, [user, fetchCount]);

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('open-inbox'))}
      aria-label={count > 0 ? `Inbox — ${count} unread` : 'Inbox'}
      className={`relative w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors ${className}`}
    >
      <Mail size={17} aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
