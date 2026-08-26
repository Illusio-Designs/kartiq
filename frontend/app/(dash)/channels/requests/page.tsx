'use client';

import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { channelApi } from '@/lib/api';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import { ArrowLeft, Inbox, Clock, CheckCircle2, XCircle, Loader2, X, Search } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { TableRowsSkeleton } from '@/components/Shimmer';
import { Tooltip } from '@/components/ui/Tooltip';
import { Badge, Card, EmptyState, useConfirm, Pagination } from '@/components/ui';
import { StatRow } from '@/components/StatCards';

const STATUS_FILTERS = [
  { value: '', label: 'All Statuses' },
  { value: 'PENDING', label: 'PENDING' },
  { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
  { value: 'COMPLETED', label: 'COMPLETED' },
  { value: 'REJECTED', label: 'REJECTED' },
];

// Status → Badge variant + icon. pending=amber · under-review=blue(info) ·
// approved=emerald · rejected=rose (mirrors the approved prototype).
const STATUS_META: Record<string, { variant: 'amber' | 'blue' | 'emerald' | 'rose'; icon: any }> = {
  PENDING:     { variant: 'amber',   icon: Clock },
  IN_PROGRESS: { variant: 'blue',    icon: Loader2 },
  COMPLETED:   { variant: 'emerald', icon: CheckCircle2 },
  REJECTED:    { variant: 'rose',    icon: XCircle },
};

export default function ChannelRequestsPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const qc = useQueryClient();
  const [confirmUi, askConfirm] = useConfirm();

  const { data: rawRequests, isLoading } = useQuery({
    queryKey: ['channel-requests', status],
    queryFn: () => channelApi.listRequests({ status: status || undefined }).then(r => r.data),
  });

  // Topbar global search filters by channel type, name, notes and status.
  const globalFiltered = useFilteredBySearch(rawRequests, (r: any) =>
    `${r.type || ''} ${r.name || ''} ${r.notes || ''} ${r.status || ''} ${r.catalogEntry?.name || ''}`
  );

  // In-card search (local) — filters channel type/name, notes and status on top
  // of the global topbar search.
  const requests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return globalFiltered;
    return globalFiltered.filter((r: any) =>
      `${r.type || ''} ${r.name || ''} ${r.notes || ''} ${r.status || ''} ${r.catalogEntry?.name || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [globalFiltered, search]);

  const cancelMutation = useMutation({
    mutationFn: (id: string) => channelApi.deleteRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel-requests'] }),
  });

  // Client-side pagination over the filtered set.
  const [reqPage, setReqPage] = useState(1);
  const pageSize = 15;
  useEffect(() => { setReqPage(1); }, [search, status]);
  const pagedRequests = useMemo(
    () => (requests || []).slice((reqPage - 1) * pageSize, reqPage * pageSize),
    [requests, reqPage],
  );

  // Status breakdown for the stat row (from the loaded set).
  const rc = (s: string) => (rawRequests || []).filter((r: any) => String(r.status).toUpperCase() === s).length;

  const isEmpty = !requests || requests.length === 0;

  return (
    <>
      {confirmUi}
      <div className="space-y-5 animate-slide-up">
        <PageHeader title="Channel Requests" />

        <StatRow items={[
          { label: 'Pending', value: rc('PENDING'), tone: 'amber', icon: <Clock size={16} /> },
          { label: 'Approved', value: rc('APPROVED'), tone: 'emerald', icon: <CheckCircle2 size={16} /> },
          { label: 'Rejected', value: rc('REJECTED'), tone: 'rose', icon: <XCircle size={16} /> },
          { label: 'Total', value: (rawRequests || []).length, tone: 'slate', icon: <Inbox size={16} /> },
        ]} cols={4} />

        <Link
          href="/channels"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={15} /> Back to Channels
        </Link>

        <Card className="p-0 overflow-hidden">
          {/* Header: search + status filter */}
          <div className="p-3 sm:p-4 flex items-center gap-3 flex-wrap border-b border-slate-100">
            <div className="flex items-center gap-2 flex-1 min-w-[180px] max-w-sm px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
              <Search size={16} className="text-slate-400 flex-shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search requests…"
                className="flex-1 bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
            <div className="hidden sm:block flex-1" />
            <Select
              value={status}
              onChange={setStatus}
              options={STATUS_FILTERS}
              className="w-full sm:w-48"
              fullWidth
            />
          </div>

          {/* Body: loader · empty state · table */}
          {isLoading ? (
            <table className="w-full text-sm"><tbody><TableRowsSkeleton rows={5} cols={6} cellClassName="px-5 py-3.5" /></tbody></table>
          ) : isEmpty ? (
            <EmptyState
              icon={<Inbox size={28} />}
              iconBg="bg-slate-100 text-slate-500"
              title="No requests yet"
              description="Browse the channel catalog and request the integrations you need."
              action={
                <Link href="/channels">
                  <Button>Browse Catalog</Button>
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                    <th className="px-5 py-2.5 font-bold">Channel</th>
                    <th className="px-5 py-2.5 font-bold">Category</th>
                    <th className="px-5 py-2.5 font-bold">Status</th>
                    <th className="px-5 py-2.5 font-bold">Notes</th>
                    <th className="px-5 py-2.5 font-bold whitespace-nowrap">Requested</th>
                    <th className="px-5 py-2.5 font-bold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRequests.map((r: any) => {
                    const meta = STATUS_META[r.status] || STATUS_META.PENDING;
                    const StatusIcon = meta.icon;
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3 max-w-[240px]">
                          <div className="font-semibold text-slate-900 truncate" title={r.name || r.type || undefined}>{r.name || r.type}</div>
                          {r.name && r.type && <div className="text-xs text-slate-400 truncate" title={r.type}>{r.type}</div>}
                        </td>
                        <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{r.category || '—'}</td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <Badge variant={meta.variant}>
                            <StatusIcon size={11} /> {r.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-slate-500 max-w-xs">
                          <div className="truncate" title={r.notes || undefined}>{r.notes || '—'}</div>
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">
                          {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {r.status === 'PENDING' && (
                            <Tooltip content="Cancel request">
                              <Button
                                variant="danger"
                                size="icon"
                                onClick={async () => {
                                  const ok = await askConfirm({
                                    title: 'Cancel this request?',
                                    description: 'The integration request will be withdrawn.',
                                    confirmLabel: 'Cancel request',
                                    variant: 'danger',
                                  });
                                  if (ok) cancelMutation.mutate(r.id);
                                }}
                              >
                                <X size={13} />
                              </Button>
                            </Tooltip>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {requests.length > pageSize && (
          <Pagination page={reqPage} total={requests.length} pageSize={pageSize} onPageChange={setReqPage} />
        )}
      </div>
    </>
  );
}
