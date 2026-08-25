'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, Button, Textarea, Badge, useConfirm } from '@/components/ui';
import { ticketApi } from '@/lib/api';
import { ArrowLeft, Send, Loader2, Lock, ShieldCheck, User } from 'lucide-react';
import { DetailPageSkeleton } from '@/components/Shimmer';

interface Message {
  id: string;
  authorName: string;
  isStaff: boolean;
  body: string;
  createdAt: string;
}

interface Ticket {
  id: string;
  subject: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmUi, askConfirm] = useConfirm();
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () =>
    ticketApi
      .get(id)
      .then((r) => setTicket(r.data))
      .catch(() => setTicket(null))
      .finally(() => setLoading(false));

  useEffect(() => {
    if (id) load();
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages.length]);

  const submit = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await ticketApi.reply(id, reply);
      setReply('');
      await load();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to send reply');
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    const ok = await askConfirm({
      title: 'Close this ticket?',
      description: 'You can reply later, but the ticket will be marked as resolved.',
      confirmLabel: 'Close ticket',
      variant: 'danger',
    });
    if (!ok) return;
    await ticketApi.close(id);
    await load();
  };

  if (loading) {
    return <DetailPageSkeleton />;
  }

  if (!ticket) {
    return (
      <div className="text-center py-24">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent">Ticket not found</h1>
          <Link href="/help" className="inline-flex items-center gap-1.5 mt-4 text-emerald-600 font-bold">
            <ArrowLeft size={14} /> Back to help
          </Link>
      </div>
    );
  }

  return (
    <>
      {confirmUi}
      <div className="max-w-4xl mx-auto space-y-5">
        <Link href="/help" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-emerald-600">
          <ArrowLeft size={14} /> All tickets
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent tracking-tight">{ticket.subject}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className="text-xs font-mono font-bold text-slate-500">#{ticket.id.slice(0, 8)}</span>
              <Badge variant={ticket.status === 'OPEN' ? 'rose' : ticket.status === 'PENDING' ? 'amber' : 'emerald'}>
                {ticket.status}
              </Badge>
              <Badge variant="default">{ticket.priority}</Badge>
              <span className="text-xs text-slate-400">· opened {new Date(ticket.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          {ticket.status !== 'CLOSED' && (
            <Button variant="secondary" leftIcon={<Lock size={13} />} onClick={close}>
              Close ticket
            </Button>
          )}
        </div>

        {/* Thread */}
        <Card className="p-5">
          <div className="space-y-4">
            {ticket.messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.isStaff ? 'flex-row-reverse text-right' : ''}`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    m.isStaff
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {m.isStaff ? <ShieldCheck size={16} /> : <User size={16} />}
                </div>
                <div className={`flex-1 min-w-0 ${m.isStaff ? 'items-end' : ''}`}>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-bold text-slate-700">{m.authorName}</span>
                    {m.isStaff && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Support</span>}
                    <span className="text-[11px]">{new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                  <div
                    className={`mt-1.5 p-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap inline-block text-left ${
                      m.isStaff
                        ? 'bg-emerald-50 border border-emerald-100 text-slate-800'
                        : 'bg-slate-50 border border-slate-100 text-slate-800'
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </Card>

        {/* Reply */}
        {ticket.status !== 'CLOSED' && (
          <Card className="p-5">
            <h3 className="font-bold text-sm text-slate-900 mb-3">Reply</h3>
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write your message…"
              rows={4}
            />
            {err && <div className="text-xs text-red-600 mt-2">{err}</div>}
            <div className="flex justify-end mt-3">
              <Button
                leftIcon={busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                onClick={submit}
                disabled={!reply.trim() || busy}
              >
                {busy ? 'Sending…' : 'Send reply'}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
