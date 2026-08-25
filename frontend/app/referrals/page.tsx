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
import { PageHeader } from '@/components/layout/PageHeader';
import { referralApi } from '@/lib/api';
import { Button, Badge, Card } from '@/components/ui';
import { Gift, Copy, Share2, CheckCircle2, Clock, XCircle, Sparkles } from 'lucide-react';
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

// Status → badge variant + icon/label. Voided kept even though converted rows
// are the common case; the reward column dims for anything but `converted`.
const STATUS_META: Record<Referral['status'], { label: string; icon: any; variant: 'amber' | 'emerald' | 'rose' }> = {
  pending:   { label: 'Pending',   icon: Clock,        variant: 'amber' },
  converted: { label: 'Converted', icon: CheckCircle2, variant: 'emerald' },
  voided:    { label: 'Voided',    icon: XCircle,      variant: 'rose' },
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
      <div className="max-w-5xl mx-auto space-y-4 animate-slide-up">
        <PageHeader
          title="Referrals"
          subtitle={
            <>
              Share your link. When a friend signs up and upgrades to a paid plan,
              {data ? <> you earn <strong className="text-slate-700">{fmt(data.rewardPerConversion, data.currency)}</strong> credited to your wallet.</> : ' you earn wallet credit.'}
            </>
          }
        />

        {/* Referral code / link card */}
        <Card className="p-5">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-10 w-56 rounded-xl bg-slate-100" />
              <div className="h-3 w-72 rounded bg-slate-100" />
            </div>
          ) : data && (
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <code className="font-mono text-[15px] font-extrabold tracking-wide px-3.5 py-2.5 rounded-xl bg-slate-100 border border-dashed border-slate-300 text-slate-900">
                    {data.code}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Copy size={14} />}
                    onClick={() => copy('code', data.code)}
                  >
                    {copiedField === 'code' ? 'Copied' : 'Copy code'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Share2 size={14} />}
                    onClick={share}
                  >
                    Share link
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => copy('url', data.shareUrl)}
                  className="group mt-2.5 flex items-center gap-1.5 font-mono text-xs text-slate-400 hover:text-slate-600 transition-colors truncate max-w-full"
                  title="Click to copy link"
                >
                  <span className="truncate">{data.shareUrl}</span>
                  <Copy size={11} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  {copiedField === 'url' && <span className="text-emerald-600 font-sans font-semibold flex-shrink-0">Copied</span>}
                </button>
              </div>

              <div className="text-right">
                <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">You earn</div>
                <div className="text-[22px] font-extrabold text-emerald-600 mt-0.5">
                  {fmt(data.rewardPerConversion, data.currency)}{' '}
                  <span className="text-xs font-semibold text-slate-400">per converted signup</span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="Signups"   value={loading ? '—' : (data?.totals.signups ?? 0).toLocaleString()} dotClass="bg-slate-400" />
          <StatTile label="Pending"   value={loading ? '—' : (data?.totals.pending ?? 0).toLocaleString()} dotClass="bg-amber-500" />
          <StatTile label="Converted" value={loading ? '—' : (data?.totals.converted ?? 0).toLocaleString()} dotClass="bg-emerald-500" />
          <StatTile label="Earned"    value={loading || !data ? '—' : fmt(data.totals.earned, data.currency)} dotClass="bg-emerald-500" highlight />
        </div>

        {/* Referrals table */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
            <h2 className="font-bold text-slate-900 text-sm">Your referrals</h2>
            {data && data.referrals.length > 0 && (
              <span className="text-xs font-semibold text-slate-400">{data.referrals.length} total</span>
            )}
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-400">Loading…</div>
          ) : !data || data.referrals.length === 0 ? (
            <div className="p-10 text-center">
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                    <th className="px-5 py-2.5 font-bold w-full">Business</th>
                    <th className="px-3 py-2.5 font-bold whitespace-nowrap">Signed up</th>
                    <th className="px-3 py-2.5 font-bold whitespace-nowrap">Status</th>
                    <th className="px-5 py-2.5 font-bold text-right whitespace-nowrap">Reward</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.referrals.map((r) => {
                    const meta = STATUS_META[r.status];
                    const Icon = meta.icon;
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3 font-semibold text-slate-900 truncate max-w-xs">
                          {r.referredBusinessName || <span className="text-slate-400 italic">Unknown</span>}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(r.signedUpAt).toLocaleDateString()}
                          {r.convertedAt && (
                            <div className="text-[10px] text-emerald-600 mt-0.5">
                              Converted {new Date(r.convertedAt).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant={meta.variant} dot>
                            <Icon size={11} /> {meta.label}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-right font-bold whitespace-nowrap tabular-nums">
                          {r.status === 'converted' ? (
                            <span className="text-emerald-600">+{fmt(Number(r.rewardAmount), r.rewardCurrency)}</span>
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
        </Card>

        {/* How it works */}
        <Card className="p-5 bg-slate-50/60">
          <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2 text-sm">
            <Sparkles size={14} className="text-emerald-600" /> How it works
          </h3>
          <ol className="text-sm text-slate-600 space-y-2 list-decimal pl-5">
            <li>Share your code or link with someone running an online store.</li>
            <li>They sign up using your link — referral status is <strong className="text-amber-600">Pending</strong>.</li>
            <li>When they upgrade to a paid plan, the reward lands in your wallet automatically and the row turns <strong className="text-emerald-600">Converted</strong>.</li>
            <li>Use the wallet balance for plan upgrades, overage charges, or anything else billable.</li>
          </ol>
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Self-referrals and obvious abuse are blocked. We may void rewards if a referred
            tenant turns out to be fraudulent or fails their first payment.
          </p>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function StatTile({
  label, value, dotClass, highlight,
}: {
  label: string;
  value: string;
  dotClass: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`p-4 ${highlight ? 'border-emerald-200' : ''}`}>
      <div className="flex items-center gap-2 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        {label}
      </div>
      <div className={`text-2xl font-extrabold mt-1.5 tabular-nums ${highlight ? 'text-emerald-600' : 'text-slate-900'}`}>
        {value}
      </div>
    </Card>
  );
}
