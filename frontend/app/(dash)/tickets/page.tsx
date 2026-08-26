'use client';

/**
 * Tenant-side support tickets page — "Help Desk".
 *
 * Master–detail layout inside a single Card: the left rail lists the
 * caller's own tickets (server filters by tenantId on /tickets) and the
 * right pane shows the selected ticket's full message thread with an
 * inline reply form. New tickets are opened through the shared Help
 * drawer (the "New ticket" action fires the global `open-help` event),
 * which the UserMenu and HelpDrawer's "My tickets" link both point here.
 */

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ticketApi } from '@/lib/api';
import { useSearchStore } from '@/store/search.store';
import {
  LifeBuoy, Send, MessageSquare, X as XIcon, Check, Plus, Clock, CheckCircle2,
} from 'lucide-react';
import { StatRow } from '@/components/StatCards';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableRowsSkeleton } from '@/components/Shimmer';

interface TicketMessage {
  id: string;
  authorName: string;
  isStaff: boolean;
  body: string;
  createdAt: string;
}

interface Ticket {
  id: string;
  subject: string;
  status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
  priority?: string;
  category?: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: TicketMessage[];
  _count?: { messages?: number };
}

// Status → Badge variant. OPEN reads as informational (blue), PENDING amber,
// RESOLVED emerald, CLOSED slate. Both the list rail and the detail header
// use this single mapping so the badges stay consistent.
const STATUS_COLORS: Record<string, 'blue' | 'amber' | 'emerald' | 'slate'> = {
  OPEN:     'blue',
  PENDING:  'amber',
  RESOLVED: 'emerald',
  CLOSED:   'slate',
};
const statusVariant = (s: string) => STATUS_COLORS[s] || STATUS_COLORS.OPEN;

function fmtRel(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 14) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Open the shared Help drawer straight on its "Contact support" form — the
// same new-ticket flow the topbar (?) button uses. Mounted once in
// DashboardLayout, so we just fire the window event it listens for.
function openNewTicket() {
  window.dispatchEvent(new Event('open-help'));
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<Ticket | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const query = useSearchStore((s) => s.query);

  const load = async (take = limit) => {
    setLoading(true);
    try {
      const r = await ticketApi.list({ limit: take });
      // Tolerate both the paginated envelope and a legacy bare array.
      const list: Ticket[] = r.data?.tickets || r.data || [];
      setTickets(list);
      setTotal(Number(r.data?.total ?? list.length));
      if (!activeId && list[0]) setActiveId(list[0].id);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!activeId) { setActive(null); return; }
    ticketApi.get(activeId).then((r) => setActive(r.data));
  }, [activeId]);

  const filtered = useMemo(() => {
    if (!query) return tickets;
    const q = query.toLowerCase();
    return tickets.filter((t) =>
      t.subject.toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q),
    );
  }, [tickets, query]);

  const submitReply = async () => {
    if (!active || !reply.trim() || busy) return;
    setBusy(true);
    try {
      await ticketApi.reply(active.id, reply.trim());
      setReply('');
      const r = await ticketApi.get(active.id);
      setActive(r.data);
      load();
    } finally { setBusy(false); }
  };

  const closeTicket = async () => {
    if (!active || busy) return;
    setBusy(true);
    try {
      await ticketApi.close(active.id);
      const r = await ticketApi.get(active.id);
      setActive(r.data);
      load();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 animate-slide-up">
        <PageHeader
          title="Help Desk"
          subtitle="Your support conversations with the Kartriq team — replies arrive here and on your email."
          actions={
            <Button size="sm" leftIcon={<Plus size={15} />} onClick={openNewTicket}>
              New ticket
            </Button>
          }
        />

        <StatRow items={[
          { label: 'Total', value: total, tone: 'slate', icon: <LifeBuoy size={16} /> },
          { label: 'Open', value: tickets.filter((t) => t.status === 'OPEN').length, tone: 'blue', icon: <MessageSquare size={16} /> },
          { label: 'Pending', value: tickets.filter((t) => t.status === 'PENDING').length, tone: 'amber', icon: <Clock size={16} /> },
          { label: 'Resolved', value: tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length, tone: 'emerald', icon: <CheckCircle2 size={16} /> },
        ]} cols={4} />

        {loading ? (
          <Card className="p-0 overflow-hidden">
            <table className="w-full"><tbody><TableRowsSkeleton rows={6} cols={3} cellClassName="px-4 py-3.5" /></tbody></table>
          </Card>
        ) : tickets.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={<LifeBuoy size={28} />}
              iconBg="bg-emerald-50 text-emerald-600"
              title="No tickets yet"
              description="Open a ticket and your conversation with the Kartriq team shows up right here."
              action={
                <Button size="sm" leftIcon={<Plus size={14} />} onClick={openNewTicket}>
                  New ticket
                </Button>
              }
              decorative
            />
          </Card>
        ) : (
          <Card className="p-0 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr]">
              {/* ── LEFT: ticket list ── */}
              <div className="lg:border-r border-slate-100">
                <ul className="divide-y divide-slate-100 max-h-[72vh] overflow-y-auto">
                  {filtered.map((t) => {
                    const snippet = t.messages?.[0]?.body || t.category || 'No messages yet';
                    const isActive = activeId === t.id;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setActiveId(t.id)}
                          className={`w-full text-left px-4 py-3 transition-colors ${
                            isActive
                              ? 'bg-emerald-50 shadow-[inset_3px_0_0_theme(colors.emerald.500)]'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <h3 className="text-sm font-bold text-slate-900 truncate">{t.subject}</h3>
                          <p className="text-xs text-slate-500 truncate mt-0.5">{snippet}</p>
                          <div className="flex items-center justify-between gap-2 mt-2">
                            <Badge variant={statusVariant(t.status)} dot>{t.status}</Badge>
                            <span className="text-[11px] text-slate-400 flex-shrink-0">{fmtRel(t.updatedAt)}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {tickets.length < total && (
                  <div className="p-3 border-t border-slate-100 dark:border-slate-800 text-center">
                    <Button variant="ghost" size="sm" loading={loading} onClick={() => { const next = limit + 50; setLimit(next); load(next); }}>
                      Load more ({tickets.length} of {total})
                    </Button>
                  </div>
                )}
              </div>

              {/* ── RIGHT: conversation pane (collapses on narrow screens) ── */}
              <div className="hidden lg:flex flex-col min-h-[60vh]">
                {!active ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-slate-400">
                    <MessageSquare size={26} className="text-slate-300" />
                    Select a ticket to view the conversation
                  </div>
                ) : (
                  <>
                    {/* Detail header — subject + status + close */}
                    <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-base font-bold text-slate-900 truncate">{active.subject}</h2>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                          {active.category && <span>{active.category}</span>}
                          <span>Opened {fmtRel(active.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={statusVariant(active.status)} dot>{active.status}</Badge>
                        {active.status !== 'CLOSED' && (
                          <Button variant="ghost" size="sm" onClick={closeTicket} disabled={busy}>
                            <XIcon size={13} /> Close
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Message thread — staff on the left (them), you on the right (me) */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-slate-50/50">
                      {(active.messages || []).map((m) => (
                        <div
                          key={m.id}
                          className={`flex ${m.isStaff ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                              m.isStaff
                                ? 'bg-slate-100 text-slate-800 border border-slate-200 rounded-bl-sm'
                                : 'bg-emerald-500 text-white rounded-br-sm'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                m.isStaff ? 'text-slate-500' : 'text-white/80'
                              }`}>
                                {m.isStaff ? 'Support' : m.authorName}
                              </span>
                              <span className={`text-[10px] ${m.isStaff ? 'text-slate-400' : 'text-white/70'}`}>
                                {fmtRel(m.createdAt)}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap">{m.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Reply composer / closed notice */}
                    {active.status !== 'CLOSED' ? (
                      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <Input
                              value={reply}
                              onChange={(e) => setReply(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(); } }}
                              placeholder="Write a reply…"
                            />
                          </div>
                          <Button onClick={submitReply} disabled={!reply.trim() || busy} leftIcon={<Send size={14} />}>
                            {busy ? 'Sending…' : 'Send'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 text-center text-xs text-slate-500 flex items-center justify-center gap-1.5">
                        <Check size={12} /> This ticket is closed. Open a new one for follow-up issues.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </Card>
        )}
    </div>
  );
}
