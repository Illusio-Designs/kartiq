'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, Input, Textarea, Select, Badge, Modal } from '@/components/ui';
import { publicApi, ticketApi } from '@/lib/api';
import { getIcon } from '@/lib/icon';
import {
  HelpCircle, MessageCircle, Mail, BookOpen, Video, Send, Plus,
  ArrowRight, ExternalLink, Inbox, Loader2, Search, FileText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export default function HelpPage() {
  const [ticket, setTicket] = useState({ subject: '', priority: 'NORMAL', message: '' });
  const [ticketErr, setTicketErr] = useState('');
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [popular, setPopular] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [query, setQuery] = useState('');

  const loadTickets = () => ticketApi.list().then((r) => setTickets(r.data || [])).catch(() => {});

  useEffect(() => {
    publicApi.content('HELP_CATEGORY').then((r) => setCategories(r.data || []));
    publicApi.content('HELP_FAQ').then((r) => setPopular(r.data || []));
    loadTickets();
  }, []);

  const openTicket = () => { setTicketErr(''); setTicketOpen(true); };

  // Lightweight client-side filter over the loaded help content.
  const q = query.trim().toLowerCase();
  const filteredCategories = useMemo(
    () => (q ? categories.filter((c: any) => `${c.title || ''} ${c.subtitle || ''}`.toLowerCase().includes(q)) : categories),
    [categories, q]
  );
  const filteredPopular = useMemo(
    () => (q ? popular.filter((p: any) => `${p.title || ''}`.toLowerCase().includes(q)) : popular),
    [popular, q]
  );

  const submitTicket = async () => {
    setTicketErr('');
    if (!ticket.subject || !ticket.message) return;
    setTicketBusy(true);
    try {
      await ticketApi.create({
        subject: ticket.subject,
        priority: ticket.priority,
        body: ticket.message,
      });
      setTicket({ subject: '', priority: 'NORMAL', message: '' });
      setTicketOpen(false);
      loadTickets();
    } catch (err: any) {
      setTicketErr(err?.response?.data?.error || 'Failed to create ticket');
    } finally {
      setTicketBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-5 animate-slide-up">
        <PageHeader
          title="Help Center"
          actions={
            <Button leftIcon={<Plus size={15} />} onClick={openTicket}>
              New Ticket
            </Button>
          }
        />

        {/* Compact search hero — subtle accent-tint that also reads in dark */}
        <Card className="relative overflow-hidden bg-gradient-to-br from-emerald-50 to-white p-7 md:p-9 text-center">
          <div className="pointer-events-none absolute -top-16 right-0 w-56 h-56 rounded-full bg-emerald-200/25 blur-3xl" />
          <div className="relative max-w-xl mx-auto">
            <div className="inline-flex w-12 h-12 rounded-2xl bg-white shadow-sm items-center justify-center mb-3">
              <HelpCircle size={20} className="text-emerald-600" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900">How can we help?</h2>
            <div className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <Search size={18} className="text-slate-400 flex-shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search guides, articles, API docs…"
                className="w-full bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>
        </Card>

        {/* Quick links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ActionCard icon={BookOpen}      title="Documentation"  description="Guides & API docs"          href="/resources/help" />
          <ActionCard icon={Video}         title="Video Tutorials" description="Product walkthroughs"        href="/resources/videos" />
          <ActionCard icon={MessageCircle} title="Live Chat"       description="Chat with support 9am-9pm" />
        </div>

        {/* Two-column: categories + popular articles */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Browse by category */}
          <Card className="p-5">
            <h2 className="font-bold text-lg text-slate-900 mb-3">Browse by category</h2>
            {filteredCategories.length === 0 ? (
              <p className="text-sm text-slate-500 px-1 py-4">
                {categories.length === 0 ? 'No help categories configured yet.' : 'No categories match your search.'}
              </p>
            ) : (
              <div className="space-y-1">
                {filteredCategories.map((c: any) => {
                  const Icon = getIcon(c.icon);
                  return (
                    <Link
                      key={c.id}
                      href={c.href || '#'}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                    >
                      <span className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 group-hover:border-emerald-200 group-hover:bg-emerald-50/50 transition-colors">
                        <Icon size={16} className="text-emerald-600" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-900 truncate">{c.title}</div>
                        {c.subtitle && <div className="text-xs text-slate-500 truncate">{c.subtitle}</div>}
                      </div>
                      <ArrowRight size={14} className="text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Popular articles */}
          <Card className="p-5">
            <h2 className="font-bold text-lg text-slate-900 mb-3">Popular articles</h2>
            {filteredPopular.length === 0 ? (
              <p className="text-sm text-slate-500 px-1 py-4">
                {popular.length === 0 ? 'No help articles yet.' : 'No articles match your search.'}
              </p>
            ) : (
              <div className="space-y-1">
                {filteredPopular.map((p: any) => (
                  <Link
                    key={p.id}
                    href={`/resources/help?topic=${p.category || ''}`}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                  >
                    <FileText size={15} className="text-slate-400 group-hover:text-emerald-600 transition-colors flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-700 group-hover:text-emerald-700 flex-1 min-w-0 truncate">{p.title}</span>
                    <ArrowRight size={13} className="text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Your tickets — live from /api/v1/tickets */}
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-bold text-lg text-slate-900">Your tickets</h2>
            <Link href="/tickets" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors">
              Open Help Desk <ArrowRight size={13} />
            </Link>
          </div>

          {tickets.length === 0 ? (
            <div className="text-center py-8">
              <div className="inline-flex w-12 h-12 rounded-2xl bg-slate-100 items-center justify-center mb-3">
                <Inbox size={18} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-500">No support tickets yet.</p>
              <p className="text-xs text-slate-400 mt-1">Open a new ticket and our team will get back to you.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((t: any) => (
                <Link
                  key={t.id}
                  href={`/help/${t.id}`}
                  className="flex items-center justify-between p-4 rounded-xl bg-slate-50/50 border border-slate-100 hover:bg-slate-100/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-slate-500">#{t.id.slice(0, 8)}</span>
                      <Badge variant={t.status === 'OPEN' ? 'rose' : t.status === 'PENDING' ? 'amber' : 'emerald'}>
                        {t.status}
                      </Badge>
                      <Badge variant="default">{t.priority}</Badge>
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-1 truncate">{t.subject}</div>
                    {t.messages?.[0]?.body && (
                      <div className="text-xs text-slate-500 mt-0.5 truncate">{t.messages[0].body}</div>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 whitespace-nowrap ml-3">
                    {new Date(t.updatedAt).toLocaleDateString()}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Contact strip — reach support directly or open a ticket */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-x-5 gap-y-2.5 text-xs text-slate-500">
            <a href="mailto:info@kartriq.com" className="inline-flex items-center gap-1.5 hover:text-emerald-700 transition-colors">
              <Mail size={13} className="text-emerald-600" /> info@kartriq.com
            </a>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle size={13} className="text-emerald-600" /> 9 AM – 9 PM IST
            </span>
            <Button variant="secondary" size="sm" leftIcon={<Send size={13} />} onClick={openTicket} className="ml-auto">
              Open a ticket
            </Button>
          </div>
        </Card>
      </div>

      {/* New Ticket Modal */}
      <Modal
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        title="Contact Support"
        description="We usually reply within 2 hours"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTicketOpen(false)}>Cancel</Button>
            <Button
              leftIcon={ticketBusy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              onClick={submitTicket}
              disabled={!ticket.subject || !ticket.message || ticketBusy}
            >
              {ticketBusy ? 'Sending…' : 'Send Message'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Subject"
            value={ticket.subject}
            onChange={(e) => setTicket({ ...ticket, subject: e.target.value })}
            placeholder="Brief summary of your issue"
          />
          <Select
            label="Priority"
            value={ticket.priority}
            onChange={(v) => setTicket({ ...ticket, priority: v })}
            options={[
              { value: 'LOW',    label: '🟢 Low' },
              { value: 'NORMAL', label: '🟡 Normal' },
              { value: 'HIGH',   label: '🟠 High' },
              { value: 'URGENT', label: '🔴 Urgent' },
            ]}
            fullWidth
          />
          <Textarea
            label="Message"
            value={ticket.message}
            onChange={(e) => setTicket({ ...ticket, message: e.target.value })}
            placeholder="Describe the issue in detail…"
            rows={5}
          />
          {ticketErr && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{ticketErr}</div>
          )}
        </div>
      </Modal>
    </>
  );
}

function ActionCard({ icon: Icon, title, description, href }: {
  icon: LucideIcon;
  title: string;
  description: string;
  href?: string;
}) {
  const content = (
    <Card className="p-4 flex items-center gap-3 hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer group">
      <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors">
        <Icon size={18} className="text-emerald-600" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-slate-900 text-sm">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5 truncate">{description}</div>
      </div>
      {href && <ExternalLink size={14} className="text-slate-400 group-hover:text-emerald-600 transition-colors flex-shrink-0" />}
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : <button className="text-left w-full">{content}</button>;
}
