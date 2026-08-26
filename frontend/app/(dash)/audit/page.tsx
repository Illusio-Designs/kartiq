'use client';

/**
 * Tenant-visible audit log.
 *
 * Backed by GET /billing/audit (filtered to req.tenant.id server-side, gated
 * by the `settings.read` permission). Shows every authenticated mutation
 * inside the tenant: who did it, when, what changed, from where.
 *
 * Uses the same visual language as /admin/audit but drops cross-tenant
 * fields and tenant filter.
 */

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { billingApi } from '@/lib/api';
import { TableRowsSkeleton } from '@/components/Shimmer';
import { Activity, RefreshCw, ChevronDown, ListFilter, Layers, Clock } from 'lucide-react';
import { Button, Badge, Card, Select, SearchField, EmptyState, Pagination } from '@/components/ui';
import { StatRow } from '@/components/StatCards';

interface AuditRow {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  ip: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  metadata: unknown;
  createdAt: string;
}

// Action verb → Badge variant. The verb is the last dotted segment of the
// action (e.g. `order.create` → `create`).
type BadgeTint = 'emerald' | 'blue' | 'rose' | 'amber' | 'violet' | 'slate';
const VERB_VARIANT: Record<string, BadgeTint> = {
  create:   'emerald',
  activate: 'emerald',
  connect:  'emerald',
  pay:      'emerald',
  enable:   'emerald',
  topup:    'emerald',
  update:   'blue',
  reply:    'blue',
  reset:    'blue',
  delete:   'rose',
  cancel:   'rose',
  disable:  'rose',
  suspend:  'amber',
  sync:     'violet',
  export:   'violet',
  close:    'slate',
};

// HTTP method chip — semantic tints with explicit dark variants.
const METHOD_CLASS: Record<string, string> = {
  POST:   'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  PUT:    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30',
  PATCH:  'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30',
  DELETE: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
  GET:    'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/30',
};

function verbFor(action: string): string {
  const parts = action.split('.');
  return parts[parts.length - 1] || action;
}

function statusColor(code: number): string {
  if (code >= 500) return 'text-rose-600 dark:text-rose-400';
  if (code >= 400) return 'text-amber-600 dark:text-amber-400';
  if (code >= 300) return 'text-blue-600 dark:text-blue-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  const sec = Math.floor((Date.now() - d) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function TenantAuditPage() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [actions, setActions] = useState<Array<{ action: string; count: number }>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async (filter = actionFilter, p = page) => {
    setLoading(true);
    try {
      const r = await billingApi.audit({ page: p, limit: pageSize, action: filter || undefined });
      setLogs(r.data?.logs || []);
      setActions(r.data?.actions || []);
      setTotal(Number(r.data?.total || 0));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load('', 1); /* eslint-disable-next-line */ }, []);
  // Refetch whenever the page changes (server-side pagination).
  useEffect(() => { load(actionFilter, page); /* eslint-disable-next-line */ }, [page]);

  const filtered = useMemo(() => {
    if (!search) return logs;
    const q = search.toLowerCase();
    return logs.filter((l) =>
      l.action.toLowerCase().includes(q) ||
      (l.userEmail || '').toLowerCase().includes(q) ||
      (l.path || '').toLowerCase().includes(q) ||
      (l.resourceId || '').toLowerCase().includes(q)
    );
  }, [logs, search]);

  return (
    <div className="space-y-4 animate-slide-up">
        <PageHeader
          title="Activity Log"
          subtitle="Every change made inside your workspace — useful for security reviews and compliance. Limited to your tenant."
          actions={
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
              onClick={() => load()}
            >
              Refresh
            </Button>
          }
        />

        {/* Stat strip — shared stat cards (real values only) */}
        <StatRow items={[
          { label: 'Total events', value: total.toLocaleString(), tone: 'emerald', icon: <Activity size={16} /> },
          { label: 'On this page', value: filtered.length, tone: 'blue', icon: <ListFilter size={16} />, hint: actionFilter ? `Filter: ${actionFilter}` : 'Most recent' },
          { label: 'Action types', value: actions.length, tone: 'violet', icon: <Layers size={16} /> },
          { label: 'Latest', value: logs[0] ? relTime(logs[0].createdAt) : '—', tone: 'slate', icon: <Clock size={16} />, hint: logs[0]?.action || 'No activity yet' },
        ]} cols={4} />

        {/* One card — toolbar header (border-b) · events table */}
        <Card className="p-0 overflow-hidden">
          {/* Header: search + action filter */}
          <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 flex-wrap">
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Search action, user, path, resource id…"
                className="flex-1 min-w-[200px] max-w-sm"
              />
              <div className="hidden sm:block flex-1" />
              <Select
                value={actionFilter}
                onChange={(v) => { setActionFilter(v); setPage(1); load(v, 1); }}
                options={[
                  { value: '', label: 'All actions' },
                  ...actions.map((a) => ({ value: a.action, label: `${a.action} (${a.count})` })),
                ]}
              />
            </div>
          </div>

          {/* Events table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-2.5 font-bold w-32">When</th>
                  <th className="px-4 py-2.5 font-bold">Action</th>
                  <th className="px-4 py-2.5 font-bold">User</th>
                  <th className="px-4 py-2.5 font-bold w-full">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <TableRowsSkeleton rows={8} cols={4} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-0">
                      <EmptyState
                        icon={<Activity size={28} />}
                        iconBg="bg-emerald-50 text-emerald-600"
                        title="No activity to show"
                        description="No audit entries match your current search or filter. Actions across your workspace will appear here as they happen."
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map((l) => {
                    const verb = verbFor(l.action);
                    const isOpen = expanded === l.id;
                    const meta = l.metadata && typeof l.metadata === 'object'
                      ? l.metadata
                      : (typeof l.metadata === 'string' ? safeParse(l.metadata) : null);
                    return (
                      <>
                        <tr
                          key={l.id}
                          onClick={() => setExpanded(isOpen ? null : l.id)}
                          className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 whitespace-nowrap align-top">
                            <div className="font-semibold text-slate-700 text-xs">{relTime(l.createdAt)}</div>
                            <div className="text-[10px] text-slate-400">{new Date(l.createdAt).toLocaleString()}</div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center gap-2">
                              <Badge variant={VERB_VARIANT[verb] || 'slate'} className="font-mono">{l.action}</Badge>
                              <ChevronDown
                                size={12}
                                className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                              />
                            </div>
                            {l.resourceId && (
                              <div className="text-[10px] font-mono text-slate-400 mt-1">#{l.resourceId.slice(0, 8)}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top text-xs text-slate-700 max-w-[200px]">
                            <div className="truncate" title={l.userEmail || undefined}>{l.userEmail || '—'}</div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center gap-2 flex-wrap">
                              {l.method && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${METHOD_CLASS[l.method] || METHOD_CLASS.GET}`}>
                                  {l.method}
                                </span>
                              )}
                              <span className="text-xs font-mono text-slate-600 truncate max-w-xs" title={l.path || undefined}>{l.path || '—'}</span>
                              {l.statusCode != null && (
                                <span className={`text-xs font-bold ${statusColor(l.statusCode)}`}>{l.statusCode}</span>
                              )}
                            </div>
                            {l.ip && (
                              <div className="text-[10px] font-mono text-slate-400 mt-1">{l.ip}</div>
                            )}
                          </td>
                        </tr>
                        {isOpen && meta && (
                          <tr key={`${l.id}-meta`} className="bg-slate-50/60">
                            <td colSpan={4} className="px-4 py-3">
                              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Metadata</div>
                              <pre className="text-[11px] font-mono text-slate-600 bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto">
{JSON.stringify(meta, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {total > pageSize && (
          <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
        )}

        <p className="text-[11px] text-slate-400">
          {total.toLocaleString()} event{total === 1 ? '' : 's'} logged for your tenant. Click any row to expand its metadata.
          For longer-range investigations, contact support.
        </p>
    </div>
  );
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
