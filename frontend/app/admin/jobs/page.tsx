'use client';

/**
 * Founder admin: background job queue.
 *
 * Surfaces the four buckets (pending / running / done / dead) backed by
 * `services/jobs.service.js` on the server. Lets ops:
 *   - browse rows in any bucket, filter by type
 *   - retry a dead-letter row (resets attempts, moves back to pending)
 *   - discard a row (hard delete)
 *   - purge old done/dead rows on demand
 */

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { useConfirm } from '@/components/ui';
import { Select } from '@/components/ui/Select';
import {
  Activity, RefreshCw, Trash2, RotateCcw, AlertCircle, CheckCircle2, Clock, PlayCircle,
  ChevronDown, Search,
} from 'lucide-react';

type Stats = { pending: number; running: number; done: number; dead: number };
type JobRow = {
  id: string;
  type: string;
  payload: any;
  priority: number;
  runAt: string;
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'running' | 'done' | 'dead';
  lockedAt: string | null;
  lockedBy: string | null;
  lastError: string | null;
  createdAt: string;
  finishedAt: string | null;
};

const STATUS_META: Record<string, { label: string; icon: any; color: string; bg: string; border: string }> = {
  pending: { label: 'Pending', icon: Clock,        color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  running: { label: 'Running', icon: PlayCircle,   color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200' },
  done:    { label: 'Done',    icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  dead:    { label: 'Dead',    icon: AlertCircle,  color: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-200' },
};

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  const sec = Math.floor((Date.now() - d) / 1000);
  if (sec < 0) return `in ${Math.abs(sec)}s`;
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminJobsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [types, setTypes] = useState<Array<{ type: string; count: number }>>([]);
  const [status, setStatus] = useState<keyof Stats>('pending');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmUi, askConfirm] = useConfirm();

  const load = async () => {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([
        adminApi.jobsStats(),
        adminApi.jobsList({ status, type: typeFilter || undefined, limit: 200 }),
      ]);
      setStats(s.data);
      setJobs(l.data.jobs || []);
      setTypes(l.data.types || []);
    } finally { setLoading(false); }
  };

  // Refresh whenever the bucket or type filter changes.
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, typeFilter]);

  // Auto-refresh every 5s while showing the live buckets.
  useEffect(() => {
    if (status === 'done' || status === 'dead') return; // no auto-refresh for archive views
    const t = setInterval(() => load(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [status, typeFilter]);

  const filtered = search
    ? jobs.filter((j) => {
        const q = search.toLowerCase();
        return j.id.toLowerCase().includes(q) ||
          j.type.toLowerCase().includes(q) ||
          (j.lastError || '').toLowerCase().includes(q) ||
          JSON.stringify(j.payload || {}).toLowerCase().includes(q);
      })
    : jobs;

  const retry = async (id: string) => {
    try { await adminApi.jobsRetry(id); load(); } catch {}
  };
  const discard = async (job: JobRow) => {
    const ok = await askConfirm({
      title: 'Discard this job?',
      description: `Type ${job.type}. Payload preview: ${JSON.stringify(job.payload || {}).slice(0, 80)}…`,
      confirmLabel: 'Discard',
      variant: 'danger',
    });
    if (!ok) return;
    await adminApi.jobsDiscard(job.id);
    load();
  };
  const purge = async () => {
    const ok = await askConfirm({
      title: 'Purge old job rows?',
      description: 'Removes done rows older than 7 days and dead rows older than 90 days.',
      confirmLabel: 'Purge',
      variant: 'danger',
    });
    if (!ok) return;
    await adminApi.jobsPurge();
    load();
  };

  return (
    <div className="p-8">
      {confirmUi}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent flex items-center gap-2">
            <Activity size={24} className="text-emerald-600" /> Background jobs
          </h1>
          <p className="text-slate-500 mt-1">
            Email sends, outbound webhook deliveries, channel syncs and other
            async work. Failures retry with exponential back-off; permanent
            failures land in <span className="font-bold text-rose-700">Dead</span> for review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" leftIcon={<Trash2 size={14} />} onClick={purge}>
            Purge old rows
          </Button>
          <Button variant="primary" leftIcon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />} onClick={load}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Stat tiles double as bucket switchers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map((k) => {
          const meta = STATUS_META[k];
          const Icon = meta.icon;
          const isActive = status === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setStatus(k as keyof Stats)}
              className={`p-4 rounded-2xl border text-left transition-all ${
                isActive
                  ? `${meta.bg} ${meta.border} shadow-md`
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className={meta.color} />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.color}`}>
                  {meta.label}
                </span>
              </div>
              <div className={`text-3xl font-bold ${isActive ? meta.color : 'text-slate-900'}`}>
                {stats ? (stats[k as keyof Stats] ?? 0).toLocaleString() : '—'}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search id / type / payload / error…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
          />
        </div>
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: '', label: 'All types' },
            ...types.map((t) => ({ value: t.type, label: `${t.type} (${t.count})` })),
          ]}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading && jobs.length === 0 ? (
          <Loader />
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">
            <Activity size={28} className="mx-auto mb-3 text-slate-300" />
            Nothing in this bucket{search ? ` matching "${search}"` : ''}.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3 w-28">Created</th>
                <th className="text-left p-3 w-28">Run at</th>
                <th className="text-center p-3 w-20">Attempts</th>
                <th className="text-left p-3">Last error</th>
                <th className="p-3 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => {
                const isOpen = expanded === j.id;
                const meta = STATUS_META[j.status];
                return (
                  <>
                    <tr
                      key={j.id}
                      className={`border-t border-slate-100 hover:bg-slate-50/40 ${isOpen ? 'bg-slate-50/60' : ''}`}
                    >
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : j.id)}
                          className="flex items-center gap-2 text-left"
                        >
                          <span className={`w-2 h-2 rounded-full ${meta.bg.replace('bg-', 'bg-').replace('-50', '-500')}`} />
                          <span className="font-mono text-xs font-semibold text-slate-700">{j.type}</span>
                          <ChevronDown size={11} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">#{j.id.slice(0, 8)}</div>
                      </td>
                      <td className="p-3 text-xs text-slate-500">{relTime(j.createdAt)}</td>
                      <td className="p-3 text-xs text-slate-500">{relTime(j.runAt)}</td>
                      <td className="p-3 text-center text-xs font-bold text-slate-700">
                        {j.attempts}
                        <span className="text-slate-400 font-normal"> / {j.maxAttempts}</span>
                      </td>
                      <td className="p-3 text-xs text-rose-700 truncate max-w-xs">{j.lastError || '—'}</td>
                      <td className="p-3 flex gap-1 justify-end">
                        {j.status === 'dead' && (
                          <Button variant="ghost" size="icon" onClick={() => retry(j.id)} title="Retry">
                            <RotateCcw size={13} />
                          </Button>
                        )}
                        {(j.status === 'dead' || j.status === 'done') && (
                          <Button variant="danger" size="icon" onClick={() => discard(j)} title="Discard">
                            <Trash2 size={13} />
                          </Button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${j.id}-details`} className="border-t border-slate-100 bg-slate-50/60">
                        <td colSpan={6} className="p-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Payload</div>
                              <pre className="text-[11px] font-mono text-slate-600 bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-60">
{JSON.stringify(j.payload, null, 2)}
                              </pre>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Locked by</div>
                                <div className="text-xs font-mono text-slate-600">{j.lockedBy || '—'}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Finished at</div>
                                <div className="text-xs text-slate-600">{j.finishedAt ? new Date(j.finishedAt).toLocaleString() : '—'}</div>
                              </div>
                              {j.lastError && (
                                <div>
                                  <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mb-1">Last error</div>
                                  <div className="text-xs text-rose-700 font-mono bg-rose-50 border border-rose-200 rounded p-2">{j.lastError}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-slate-400 mt-4">
        Showing up to 200 most recent rows in {STATUS_META[status].label}.
        Pending and Running auto-refresh every 5 seconds.
      </p>
    </div>
  );
}
