'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { channelApi } from '@/lib/api';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import { ArrowLeft, Inbox, Clock, CheckCircle2, XCircle, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Loader } from '@/components/ui/Loader';
import { Tooltip } from '@/components/ui/Tooltip';
import { EmptyState, useConfirm } from '@/components/ui';

const STATUS_FILTERS = [
  { value: '', label: 'All Statuses' },
  { value: 'PENDING', label: 'PENDING' },
  { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
  { value: 'COMPLETED', label: 'COMPLETED' },
  { value: 'REJECTED', label: 'REJECTED' },
];

const STATUS_STYLES: Record<string, { bg: string; icon: any }> = {
  PENDING:     { bg: 'bg-amber-100 text-amber-700',   icon: Clock },
  IN_PROGRESS: { bg: 'bg-sky-100 text-sky-700',     icon: Loader2 },
  COMPLETED:   { bg: 'bg-green-100 text-green-700',   icon: CheckCircle2 },
  REJECTED:    { bg: 'bg-red-100 text-red-700',       icon: XCircle },
};

export default function ChannelRequestsPage() {
  const [status, setStatus] = useState('');
  const qc = useQueryClient();
  const [confirmUi, askConfirm] = useConfirm();

  const { data: rawRequests, isLoading } = useQuery({
    queryKey: ['channel-requests', status],
    queryFn: () => channelApi.listRequests({ status: status || undefined }).then(r => r.data),
  });

  // Topbar global search filters by channel type, name, notes and status
  const requests = useFilteredBySearch(rawRequests, (r: any) =>
    `${r.type || ''} ${r.name || ''} ${r.notes || ''} ${r.status || ''} ${r.catalogEntry?.name || ''}`
  );

  const cancelMutation = useMutation({
    mutationFn: (id: string) => channelApi.deleteRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel-requests'] }),
  });

  return (
    <DashboardLayout>
      {confirmUi}
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/channels" className="p-1.5 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent">Channel Requests</h1>
            <p className="text-sm text-gray-500 mt-1">{requests?.length || 0} total requests</p>
          </div>
        </div>

        <Select
          value={status}
          onChange={setStatus}
          options={STATUS_FILTERS}
        />

        {isLoading ? (
          <Loader />
        ) : !requests || requests.length === 0 ? (
          <div className="bg-white rounded-xl border">
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
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-gray-50 border-b text-left text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-medium">#</th>
                  <th className="px-5 py-3 font-medium">Channel</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Notes</th>
                  <th className="px-5 py-3 font-medium">Requested</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {requests.map((r: any, idx: number) => {
                  const style = STATUS_STYLES[r.status] || STATUS_STYLES.PENDING;
                  const StatusIcon = style.icon;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-500 font-semibold">{idx + 1}</td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-900">{r.name || r.type}</div>
                        <div className="text-xs text-gray-400">{r.type}</div>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{r.category}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg}`}>
                          <StatusIcon size={11} /> {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 max-w-xs truncate">{r.notes || '—'}</td>
                      <td className="px-5 py-3 text-xs text-gray-400">
                        {new Date(r.createdAt).toLocaleDateString()}
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
      </div>
    </DashboardLayout>
  );
}
