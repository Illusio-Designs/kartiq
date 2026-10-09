'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { ArrowLeft, Send, ShieldCheck, User } from 'lucide-react';
import { Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Loader } from '@/components/ui/Loader';

const NEXT_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Mark PENDING after reply' },
  { value: 'RESOLVED', label: 'Mark RESOLVED after reply' },
  { value: 'OPEN', label: 'Keep OPEN' },
];

export default function AdminTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [nextStatus, setNextStatus] = useState<string>('PENDING');
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () =>
    adminApi.ticket(id).then((r) => setTicket(r.data)).finally(() => setLoading(false));

  useEffect(() => { if (id) load(); }, [id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [ticket?.messages?.length]);

  const submit = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await adminApi.replyTicket(id, reply, nextStatus);
      setReply('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (s: string) => {
    await adminApi.setTicketStatus(id, s);
    await load();
  };

  if (loading) return <div className="p-8"><Loader /></div>;
  if (!ticket) return <div className="p-8">Ticket not found</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link href="/admin/tickets" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-emerald-600 mb-4">
        <ArrowLeft size={14} /> All tickets
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent">{ticket.subject}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-2 text-xs">
            <span className="font-mono text-slate-500">#{ticket.id.slice(0, 8)}</span>
            <span className="font-bold text-slate-700">{ticket.tenant?.businessName}</span>
            <span className="font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{ticket.priority}</span>
            <span className="font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{ticket.status}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'].map((s) => (
            <Button
              key={s}
              variant="secondary"
              size="sm"
              onClick={() => setStatus(s)}
              disabled={s === ticket.status}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        <div className="space-y-4">
          {ticket.messages.map((m: any) => (
            <div key={m.id} className={`flex gap-3 ${m.isStaff ? 'flex-row-reverse' : ''}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                m.isStaff ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {m.isStaff ? <ShieldCheck size={16} /> : <User size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-bold text-slate-700">{m.authorName}</span>
                  {!!m.isStaff && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Staff</span>}
                  <span>{new Date(m.createdAt).toLocaleString()}</span>
                </div>
                <div className={`mt-1.5 p-3 rounded-xl text-sm leading-relaxed whitespace-pre-wrap inline-block ${
                  m.isStaff ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100'
                }`}>
                  {m.body}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {ticket.status !== 'CLOSED' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="font-bold text-sm text-slate-900 mb-3">Staff reply</h3>
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={5}
            placeholder="Write your response…"
          />
          <div className="flex items-center justify-between mt-3">
            <Select
              value={nextStatus}
              onChange={setNextStatus}
              options={NEXT_STATUS_OPTIONS}
            />
            <Button
              variant="primary"
              leftIcon={<Send size={14} />}
              loading={busy}
              onClick={submit}
              disabled={!reply.trim()}
            >
              {busy ? 'Sending…' : 'Send reply'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
