'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { reconciliationApi } from '@/lib/api';
import { StatRow } from '@/components/StatCards';
import { TableRowsSkeleton } from '@/components/Shimmer';
import { Card, EmptyState, DateRangePicker, Badge } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { Scale, Wallet, ShoppingCart, Undo2, TrendingDown, TrendingUp } from 'lucide-react';

// A signed variance rendered with a sensible colour: money coming in above
// expectation is emerald, a shortfall (fees / short-payment) is rose.
function Variance({ value }: { value: number }) {
  const cls = value < 0 ? 'text-rose-600' : value > 0 ? 'text-emerald-600' : 'text-slate-500';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return <span className={`font-semibold tabular-nums ${cls}`}>{sign}{formatCurrency(Math.abs(value))}</span>;
}

export default function ReconciliationPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['reconciliation', from, to],
    queryFn: () => reconciliationApi.summary({ from: from || undefined, to: to || undefined }).then((r) => r.data),
  });

  const totals = data?.totals || { orders: 0, grossOrderValue: 0, settledPayout: 0, refunds: 0, netExpected: 0, variance: 0, variancePct: 0 };
  const byChannel: any[] = data?.byChannel || [];
  const settlements: any[] = data?.settlements || [];
  const shortfall = totals.variance < 0;

  return (
    <div className="space-y-5 animate-slide-up">
      <PageHeader
        title="Payment reconciliation"
        subtitle="Match what your channels sold against what they actually paid out — and see the fees and gaps in between."
        actions={<DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} placeholder="Last 90 days" />}
      />

      <StatRow items={[
        { label: 'Gross order value', value: formatCurrency(totals.grossOrderValue), tone: 'slate', icon: <ShoppingCart size={16} />, hint: `${totals.orders} channel orders in range` },
        { label: 'Marketplace payouts', value: formatCurrency(totals.settledPayout), tone: 'emerald', icon: <Wallet size={16} />, hint: 'Settlement funds transferred to you' },
        { label: 'Refunds', value: formatCurrency(totals.refunds), tone: 'amber', icon: <Undo2 size={16} /> },
        {
          label: shortfall ? 'Fees / shortfall' : 'Variance',
          value: formatCurrency(Math.abs(totals.variance)),
          tone: shortfall ? 'rose' : 'blue',
          icon: shortfall ? <TrendingDown size={16} /> : <TrendingUp size={16} />,
          hint: 'Payouts − (gross − refunds). Negative = fees or short-payment.',
        },
      ]} cols={4} />

      {/* Reconciliation explainer + headline gap */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className={`w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 ${shortfall ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
            <Scale size={19} />
          </span>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-900 text-sm">
              {isLoading ? 'Reconciling…' : shortfall
                ? `Channels kept ${formatCurrency(Math.abs(totals.variance))} in fees / withheld payouts`
                : totals.settledPayout === 0
                  ? 'No settlements synced for this range yet'
                  : 'Payouts are in line with expected revenue'}
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Expected net after refunds is <b>{formatCurrency(totals.netExpected)}</b>; marketplaces actually
              transferred <b>{formatCurrency(totals.settledPayout)}</b>
              {totals.netExpected ? <> — a <b>{Math.abs(totals.variancePct)}%</b> {shortfall ? 'shortfall' : 'difference'}</> : null}.
              Sync settlements per channel from the channel&apos;s Finances tab to keep this current.
            </p>
          </div>
        </div>
      </Card>

      {/* Per-channel reconciliation */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100">
          <h2 className="font-bold text-slate-900 text-sm">By channel</h2>
          <p className="text-xs text-slate-500 mt-0.5">Gross sold vs settled payout, net of refunds.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                <th className="px-5 py-2.5 font-bold w-full">Channel</th>
                <th className="px-3 py-2.5 font-bold text-right whitespace-nowrap">Orders</th>
                <th className="px-3 py-2.5 font-bold text-right whitespace-nowrap">Gross</th>
                <th className="px-3 py-2.5 font-bold text-right whitespace-nowrap">Refunds</th>
                <th className="px-3 py-2.5 font-bold text-right whitespace-nowrap">Net expected</th>
                <th className="px-3 py-2.5 font-bold text-right whitespace-nowrap">Settled</th>
                <th className="px-5 py-2.5 font-bold text-right whitespace-nowrap">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <TableRowsSkeleton rows={4} cols={7} cellClassName="px-3 py-3" />
              ) : byChannel.length ? byChannel.map((c: any) => (
                <tr key={c.channelId} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-3 max-w-[240px]">
                    <div className="font-semibold text-slate-900 truncate" title={c.channelName}>{c.channelName}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-600">{c.orders}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatCurrency(c.grossOrderValue)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-500">{c.refunds ? formatCurrency(c.refunds) : '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-slate-800">{formatCurrency(c.netExpected)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{formatCurrency(c.settledPayout)}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <Variance value={c.variance} />
                    {c.netExpected ? <div className="text-[10px] text-slate-400">{c.variancePct > 0 ? '+' : ''}{c.variancePct}%</div> : null}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      icon={<Scale size={26} />}
                      iconBg="bg-emerald-50 text-emerald-600"
                      title="Nothing to reconcile yet"
                      description="Once you have channel orders and sync settlements from a channel's Finances tab, this compares what was sold against what was paid out."
                      decorative
                      size="lg"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Settlement batches */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-slate-100">
          <h2 className="font-bold text-slate-900 text-sm">Settlement batches</h2>
          <p className="text-xs text-slate-500 mt-0.5">Individual payouts transferred by your channels in this range.</p>
        </div>
        {isLoading ? (
          <table className="w-full text-sm"><tbody><TableRowsSkeleton rows={5} cols={5} cellClassName="px-5 py-3" /></tbody></table>
        ) : settlements.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="px-5 py-2.5 font-bold whitespace-nowrap">Paid on</th>
                  <th className="px-3 py-2.5 font-bold w-full">Channel</th>
                  <th className="px-3 py-2.5 font-bold whitespace-nowrap">Batch</th>
                  <th className="px-3 py-2.5 font-bold whitespace-nowrap">Status</th>
                  <th className="px-5 py-2.5 font-bold text-right whitespace-nowrap">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlements.map((s: any) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap tabular-nums text-xs">
                      {s.fundTransferDate ? new Date(s.fundTransferDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-3 max-w-[200px]">
                      <div className="text-slate-700 truncate" title={s.channelName || undefined}>{s.channelName || '—'}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-slate-400 max-w-[160px]">
                      <div className="truncate" title={s.groupId || undefined}>{s.groupId || '—'}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <Badge variant={s.fundTransferStatus === 'Succeeded' ? 'emerald' : 'slate'} dot>
                        {s.fundTransferStatus || 'Unknown'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-emerald-700 whitespace-nowrap">
                      {formatCurrency(Number(s.total || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-8 text-sm text-slate-500 text-center">No settlement batches in this range.</div>
        )}
      </Card>
    </div>
  );
}
