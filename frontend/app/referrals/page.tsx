'use client';

/**
 * Tenant referrals page.
 *
 * - Shows the tenant's unique share code + a copy-able share URL
 * - Stat strip: signups, pending, converted, total earned
 * - Table of every referred tenant with conversion status + reward
 *
 * Backend: GET /referrals/me — service-side scoped to req.tenant.id.
 * Reward triggers automatically when a referred tenant moves onto a
 * paid plan; manual void is admin-only (no UI here).
 */

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { referralApi } from '@/lib/api';
import { Gift, Copy, Share2, CheckCircle2, Clock, XCircle, Sparkles, ExternalLink } from 'lucide-react';
import { toast } from '@/store/toast.store';

type Referral = {
  id: string;
  code: string;
  status: 'pending' | 'converted' | 'voided';
  rewardAmount: number;
  rewardCurrency: string;
  signedUpAt: string;
  convertedAt: string | null;
  referredBusinessName: string | null;
};

type Summary = {
  code: string;
  shareUrl: string;
  rewardPerConversion: number;
  currency: string;
  totals: { signups: number; pending: number; converted: number; earned: number };
  referrals: Referral[];
};

const STATUS_META: Record<Referral['status'], { label: string; icon: any; color: string; bg: string; border: string }> = {
  pending:   { label: 'Pending',   icon: Clock,        color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  converted: { label: 'Converted', icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  voided:    { label: 'Voided',    icon: XCircle,      color: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-200' },
};

export default function ReferralsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    referralApi.me()
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, []);

  const copy = (key: string, text: string) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedField(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedField(null), 1500);
  };

  const share = async () => {
    if (!data?.shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Try Kartriq',
          text: `Manage your inventory and orders across every channel. Sign up with my link to give us both a perk.`,
          url: data.shareUrl,
        });
      } catch { /* user cancelled */ }
    } else {
      copy('share', data.shareUrl);
    }
  };

  const fmt = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 })
      .format(amount || 0);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-2">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent flex items-center gap-2">
              <Gift size={24} className="text-emerald-600" /> Refer &amp; earn
            </h1>
            <p className="text-slate-500 mt-1">
              Share your link. When a friend signs up and upgrades to a paid plan,
              {data ? <> you earn <strong>{fmt(data.rewardPerConversion, data.currency)}</strong> credited to your wallet.</> : ' you earn wallet credit.'}
            </p>
          </div>
        </div>

        {/* Share card */}
        <div className="mt-6 bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 text-white rounded-3xl p-6 md:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/10 blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-white/10 blur-3xl translate-y-1/2 -translate-x-1/4" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1.5 mb-4">
              <Sparkles size={12} />
              <span className="text-xs font-bold">Your referral code</span>
            </div>

            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-10 bg-white/20 rounded-xl w-48" />
                <div className="h-12 bg-white/20 rounded-xl" />
              </div>
            ) : data && (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <code className="font-mono text-3xl md:text-4xl font-bold tracking-[0.1em]">{data.code}</code>
                  <button
                    type="button"
                    onClick={() => copy('code', data.code)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-xs font-bold transition-colors"
                  >
                    <Copy size={11} />
                    {copiedField === 'code' ? 'Copied' : 'Copy code'}
                  </button>
                </div>

                <div className="mt-4 bg-white/10 backdrop-blur-sm rounded-xl p-1 flex items-center gap-1">
                  <input
                    readOnly
                    value={data.shareUrl}
                    className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none truncate"
                  />
                  <button
                    type="button"
                    onClick={() => copy('url', data.shareUrl)}
                    className="px-3 py-2 rounded-lg bg-white text-emerald-700 hover:bg-emerald-50 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Copy size={11} />
                    {copiedField === 'url' ? 'Copied' : 'Copy link'}
                  </button>
                  <button
                    type="button"
                    onClick={share}
                    className="px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Share2 size={11} /> Share
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Stat strip */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryStat label="Signups"   value={loading ? '—' : (data?.totals.signups ?? 0).toLocaleString()} />
          <SummaryStat label="Pending"   value={loading ? '—' : (data?.totals.pending ?? 0).toLocaleString()} accent="amber" />
          <SummaryStat label="Converted" value={loading ? '—' : (data?.totals.converted ?? 0).toLocaleString()} accent="emerald" />
          <SummaryStat label="Earned"    value={loading || !data ? '—' : fmt(data.totals.earned, data.currency)} accent="emerald" highlight />
        </div>

        {/* Referrals list */}
        <div className="mt-8">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Your referrals</h2>
          {loading ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-400">Loading…</div>
          ) : !data || data.referrals.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 mb-3">
                <Gift size={20} />
              </div>
              <h3 className="font-bold text-slate-900">No referrals yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Share your link with a friend running an online business. When they sign up
                and upgrade to a paid plan, the reward lands in your wallet automatically.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left p-3 whitespace-nowrap w-full">Business</th>
                    <th className="text-left p-3 whitespace-nowrap">Signed up</th>
                    <th className="text-left p-3 whitespace-nowrap">Status</th>
                    <th className="text-right p-3 whitespace-nowrap">Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referrals.map((r) => {
                    const meta = STATUS_META[r.status];
                    const Icon = meta.icon;
                    return (
                      <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/40">
                        <td className="p-3 font-semibold text-slate-900 truncate max-w-xs">
                          {r.referredBusinessName || <span className="text-slate-400 italic">Unknown</span>}
                        </td>
                        <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(r.signedUpAt).toLocaleDateString()}
                          {r.convertedAt && (
                            <div className="text-[10px] text-emerald-700 mt-0.5">
                              Converted {new Date(r.convertedAt).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 border ${meta.bg} ${meta.color} ${meta.border}`}>
                            <Icon size={10} /> {meta.label}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold text-slate-900">
                          {r.status === 'converted' ? (
                            <span className="text-emerald-700">+{fmt(Number(r.rewardAmount), r.rewardCurrency)}</span>
                          ) : (
                            <span className="text-slate-400">{fmt(Number(r.rewardAmount), r.rewardCurrency)}</span>
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

        {/* How it works */}
        <div className="mt-8 bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Sparkles size={14} className="text-emerald-600" /> How it works
          </h3>
          <ol className="text-sm text-slate-600 space-y-2 list-decimal pl-5">
            <li>Share your code or link with someone running an online store.</li>
            <li>They sign up using your link — referral status is <strong className="text-amber-700">Pending</strong>.</li>
            <li>When they upgrade to a paid plan, the reward lands in your wallet automatically and the row turns <strong className="text-emerald-700">Converted</strong>.</li>
            <li>Use the wallet balance for plan upgrades, overage charges, or anything else billable.</li>
          </ol>
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Self-referrals and obvious abuse are blocked. We may void rewards if a referred
            tenant turns out to be fraudulent or fails their first payment.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

function SummaryStat({
  label, value, accent, highlight,
}: {
  label: string;
  value: string;
  accent?: 'emerald' | 'amber';
  highlight?: boolean;
}) {
  const valueColor =
    accent === 'emerald' ? 'text-emerald-700' :
    accent === 'amber'   ? 'text-amber-700' :
                            'text-slate-900';
  return (
    <div className={`bg-white rounded-2xl border p-4 ${highlight ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'}`}>
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</div>
    </div>
  );
}
