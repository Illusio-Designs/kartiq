'use client';

/**
 * Help & Support drawer — slides in from the right when the user clicks
 * the (?) icon in the Topbar (or fires the `open-help` window event).
 *
 * Three sections:
 *   1. Quick links — docs, command palette, keyboard shortcuts
 *   2. FAQ — common questions, expandable inline
 *   3. Contact support — short form that creates a ticket via ticketApi
 *
 * Mount once from DashboardLayout so it's available on every page.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { HelpCircle, X, LifeBuoy, Send, Check, Keyboard, BookOpen, MessageSquare, ChevronDown, Mail } from 'lucide-react';
import { ticketApi, helpApi, type HelpFaq } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Select } from '@/components/ui/Select';

interface FaqItem {
  q: string;
  a: string;
}

// Fallback shown only if the /help/faqs API fails — the live FAQ is now
// CMS-managed by platform admins via /admin/help.
const FAQ_FALLBACK: FaqItem[] = [
  {
    q: 'How do I add a new product?',
    a: 'Go to Products → click "New product" in the top-right. You can set the SKU, price, stock per warehouse, and channel mappings from the same form.',
  },
  {
    q: 'Where do I see what changed in a release?',
    a: 'Click the megaphone icon in the topbar to open "What\'s new". A red dot appears whenever there is an unread entry.',
  },
];

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'K'], label: 'Open command palette' },
  { keys: ['/'], label: 'Focus the page search' },
  { keys: ['Esc'], label: 'Close any dialog or drawer' },
  { keys: ['G', 'D'], label: 'Go to Dashboard' },
  { keys: ['G', 'O'], label: 'Go to Orders' },
  { keys: ['G', 'P'], label: 'Go to Products' },
];

export function HelpDrawer() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'help' | 'contact'>('help');
  const [faqs, setFaqs] = useState<FaqItem[] | null>(null);
  const [loadingFaqs, setLoadingFaqs] = useState(false);
  const { isPlatformAdmin } = useAuthStore();
  const audience: 'tenant' | 'founder' = isPlatformAdmin?.() ? 'founder' : 'tenant';

  useEffect(() => {
    const onOpen = () => { setOpen(true); setTab('help'); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) setOpen(false); };
    window.addEventListener('open-help', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('open-help', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Fetch FAQs the first time the drawer opens. Falls back to the static
  // FAQ_FALLBACK array if the request fails so dev/offline still has
  // something to show.
  useEffect(() => {
    if (!open || faqs) return;
    setLoadingFaqs(true);
    helpApi.faqs(audience)
      .then((r) => {
        const list: HelpFaq[] = r.data || [];
        const mapped: FaqItem[] = list.map((f) => ({ q: f.question, a: f.answer }));
        setFaqs(mapped.length ? mapped : FAQ_FALLBACK);
      })
      .catch(() => setFaqs(FAQ_FALLBACK))
      .finally(() => setLoadingFaqs(false));
  }, [open, faqs, audience]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Help & Support"
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center">
            <LifeBuoy size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-900">Help &amp; Support</h2>
            <p className="text-xs text-slate-500">Find answers fast or reach the team.</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="p-2 -m-2 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-5">
          <button
            type="button"
            onClick={() => setTab('help')}
            className={`relative py-3 mr-6 text-sm font-medium transition-colors ${
              tab === 'help' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Browse help
            {tab === 'help' && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />}
          </button>
          <button
            type="button"
            onClick={() => setTab('contact')}
            className={`relative py-3 text-sm font-medium transition-colors ${
              tab === 'contact' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Contact support
            {tab === 'contact' && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {tab === 'help' ? (
            <>
              <QuickLinks onClose={() => setOpen(false)} onContact={() => setTab('contact')} />
              <Faq items={faqs} loading={loadingFaqs} />
              <Shortcuts />
            </>
          ) : (
            <ContactForm onSent={() => setTab('help')} />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-500 bg-slate-50">
          Reach us at{' '}
          <a className="font-medium text-emerald-700 hover:underline" href="mailto:support@kartriq.com">
            support@kartriq.com
          </a>{' '}
          — typical reply within one business day.
        </div>
      </div>
    </div>,
    document.body
  );
}

function QuickLinks({ onClose, onContact }: { onClose: () => void; onContact: () => void }) {
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Quick links</h3>
      {/* Single column on phones — at 375px the drawer is full-width and
          two columns squeeze the labels to 130-ish px each, truncating
          "Command palette" and "Contact support". One column gives every
          row room and still fits four tiles in a tap-friendly height. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { onClose(); window.dispatchEvent(new Event('open-command-palette')); }}
          className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-left transition-colors"
        >
          <Keyboard size={16} className="text-emerald-600 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900">Command palette</div>
            <div className="text-[11px] text-slate-500">Press ⌘K from anywhere</div>
          </div>
        </button>

        <Link
          href="/tickets"
          onClick={onClose}
          className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-left transition-colors"
        >
          <MessageSquare size={16} className="text-emerald-600 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900">My tickets</div>
            <div className="text-[11px] text-slate-500">Track your requests</div>
          </div>
        </Link>

        <a
          href="https://docs.kartriq.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-left transition-colors"
        >
          <BookOpen size={16} className="text-emerald-600 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900">Documentation</div>
            <div className="text-[11px] text-slate-500">Guides &amp; references</div>
          </div>
        </a>

        <button
          type="button"
          onClick={onContact}
          className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-left transition-colors"
        >
          <Mail size={16} className="text-emerald-600 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900">Contact support</div>
            <div className="text-[11px] text-slate-500">Open a new ticket</div>
          </div>
        </button>
      </div>
    </section>
  );
}

function Faq({ items, loading }: { items: FaqItem[] | null; loading: boolean }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const list = items || [];
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Frequently asked</h3>
      {loading && !items ? (
        <div className="border border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-400 bg-white">
          Loading…
        </div>
      ) : list.length === 0 ? (
        <div className="border border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-400 bg-white">
          No FAQs yet.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
          {list.map((item, i) => {
            const isOpen = openIdx === i;
            return (
              <div key={i}>
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                  aria-expanded={isOpen}
                >
                  <span className="flex-1 text-sm font-medium text-slate-900">{item.q}</span>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{item.a}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Shortcuts() {
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Keyboard shortcuts</h3>
      <div className="border border-slate-200 rounded-2xl bg-white divide-y divide-slate-100">
        {SHORTCUTS.map((s, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-slate-700">{s.label}</span>
            <span className="flex items-center gap-1">
              {s.keys.map((k, j) => (
                <kbd
                  key={j}
                  className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded"
                >
                  {k}
                </kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ContactForm({ onSent }: { onSent: () => void }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('billing');
  const [priority, setPriority] = useState('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      setError('Add a subject and a short description before sending.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ticketApi.create({ subject: subject.trim(), body: body.trim(), priority, category });
      setDone(true);
      setSubject('');
      setBody('');
      setTimeout(() => { setDone(false); onSent(); }, 1800);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Could not send. Try again or email support@kartriq.com.';
      setError(String(msg));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="text-center py-10">
        <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
          <Check size={22} />
        </div>
        <h3 className="font-bold text-slate-900">Ticket created</h3>
        <p className="text-xs text-slate-500 mt-1">We&apos;ll reply on the email tied to your account.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Short summary of the issue"
          maxLength={140}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-4 focus:ring-emerald-500/15 focus:border-emerald-400"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select
          fullWidth
          size="sm"
          label="Category"
          value={category}
          onChange={setCategory}
          options={[
            { value: 'billing', label: 'Billing' },
            { value: 'technical', label: 'Technical issue' },
            { value: 'account', label: 'Account' },
            { value: 'feature', label: 'Feature request' },
            { value: 'other', label: 'Other' },
          ]}
        />
        <Select
          fullWidth
          size="sm"
          label="Priority"
          value={priority}
          onChange={setPriority}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'High' },
            { value: 'urgent', label: 'Urgent' },
          ]}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="What happened? Include any error messages or steps to reproduce."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-4 focus:ring-emerald-500/15 focus:border-emerald-400 resize-none"
          required
        />
      </div>

      {error && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-semibold shadow-sm hover:shadow disabled:opacity-60 disabled:cursor-not-allowed transition-all"
      >
        <Send size={14} />
        {busy ? 'Sending…' : 'Create ticket'}
      </button>

      <p className="text-[11px] text-slate-500 text-center">
        Or email{' '}
        <a className="font-medium text-emerald-700 hover:underline" href="mailto:support@kartriq.com">
          support@kartriq.com
        </a>{' '}
        directly.
      </p>
    </form>
  );
}

/**
 * Topbar trigger — render `<HelpTrigger />` in the Topbar's button row.
 * Click dispatches `open-help` which the drawer (mounted in
 * DashboardLayout) listens for.
 */
export function HelpTrigger({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event('open-help'))}
      aria-label="Help and support"
      className={`w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors ${className}`}
    >
      <HelpCircle size={17} aria-hidden="true" />
    </button>
  );
}
