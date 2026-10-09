'use client';

import { useEffect, useState } from 'react';
import { FlaskConical, RefreshCw, Copy, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useConfirm } from '@/components/ui';
import { toast } from '@/store/toast.store';

type DemoStatus = {
  enabled: boolean;
  exists: boolean;
  tenant: { id: string; businessName: string; loginEmail: string } | null;
  channel: { id: string; name: string; autoBookShipping: boolean } | null;
  counts: { orders: number; mfn: number; fba: number; labels: number } | null;
};

const STEPS = [
  'Log in to the web app with the demo email and password. You will see an amber "Demo sandbox" banner.',
  'Channels → find "Amazon" → Connect → "Authorize with Amazon". A fake Amazon screen opens: click Authorize. The connection completes.',
  'On the channel page click "Pull now" under Pull Catalog. 3 products arrive (2 you ship, 1 FBA) with their stock.',
  'Click "Sync now" under Sync Orders. 6 orders arrive: 1 FBA (Amazon ships it) and 5 you ship (MFN).',
  'Orders → open a DEMO MFN order → click "Confirm & get shipping label". Amazon books the cheapest courier; the order becomes SHIPPED.',
  'Click Print label (or Download / Cancel label), and Print packing slip.',
  'Orders list → tick several orders → "Confirm & get labels" books them all and opens one PDF to print. "Print packing slips" works in bulk too.',
  'Try the order ending in MFN5-ERR: its booking fails on purpose, so you can see the error and "Try again". Open the FBA order: no label is needed.',
];

export default function AdminDemoPage() {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('demo-seller@kartriq.test');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<{ email: string; password?: string } | null>(null);
  const [confirmUi, askConfirm] = useConfirm();

  const load = () =>
    adminApi.demoStatus()
      .then((r) => { setStatus(r.data); setLoadError(null); })
      .catch((e) => setLoadError(e?.response?.data?.error || e.message));
  useEffect(() => { load(); }, []);

  const setup = async () => {
    setBusy(true);
    try {
      const r = await adminApi.demoSetup({ email: email.trim(), ...(password ? { password } : {}) });
      setCreds({ email: r.data.email, password: r.data.password || (password || undefined) });
      setPassword('');
      toast.success('Demo tenant created — testers start from an empty account');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e.message || 'Could not create the demo tenant');
    } finally { setBusy(false); }
  };

  const reset = async () => {
    const ok = await askConfirm({
      title: 'Reset demo data?',
      description: 'Deletes everything in the DEMO tenant (channel, products, orders, labels, anything testers added) and puts it back to the very start: one warehouse, nothing connected. Other tenants are never touched. The demo login keeps working.',
      confirmLabel: 'Reset demo data',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await adminApi.demoReset();
      toast.success('Demo data reset — back to the start (nothing connected yet)');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e.message || 'Could not reset the demo data');
    } finally { setBusy(false); }
  };

  const copy = (t: string) => { navigator.clipboard?.writeText(t); toast.success('Copied'); };

  return (
    <div className="p-8 max-w-4xl">
      {confirmUi}
      <div className="flex items-center gap-3 mb-1">
        <FlaskConical className="text-emerald-600" size={26} />
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent">Demo mode</h1>
      </div>
      <p className="text-slate-500 mb-6">
        A sandbox seller with a <b>fake Amazon</b>, so anyone can log in on the live site and click through the Amazon
        courier, label and packing-slip flows. No real Amazon account, no real money, and it never touches other tenants.
      </p>

      {loadError && <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 p-4 mb-4 text-sm">{loadError}</div>}
      {!status && !loadError && <div className="text-slate-400">Loading…</div>}

      {status && !status.enabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4 flex gap-3">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <div className="text-sm text-amber-900">
            <b>Demo mode is switched off on this server.</b> Add <code className="px-1 rounded bg-amber-100">DEMO_MODE_ENABLED=true</code> to
            the backend environment and restart the server. Until then nothing below can run.
          </div>
        </div>
      )}

      {status && status.enabled && !status.exists && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-bold text-slate-900">Create the demo tenant</h2>
          <p className="text-sm text-slate-500">Creates a seller on the free Fiverr plan with just one warehouse. The tester does the rest by clicking: connect the (fake) Amazon channel, pull the catalog, sync the orders, then get and print labels.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Demo login email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Password (min 10 chars — leave blank to generate one)" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button variant="primary" loading={busy} disabled={!email.trim() || (!!password && password.length < 10)} onClick={setup}>Create demo tenant</Button>
        </div>
      )}

      {creds && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 mt-4">
          <div className="flex items-center gap-2 font-bold text-emerald-800 mb-2"><CheckCircle2 size={18} /> Demo login — save the password now, it is not shown again</div>
          <div className="text-sm font-mono space-y-1">
            <div className="flex items-center gap-2">Email: <b>{creds.email}</b> <button onClick={() => copy(creds.email)} aria-label="Copy email"><Copy size={14} /></button></div>
            {creds.password && <div className="flex items-center gap-2">Password: <b>{creds.password}</b> <button onClick={() => copy(creds.password!)} aria-label="Copy password"><Copy size={14} /></button></div>}
          </div>
        </div>
      )}

      {status && status.enabled && status.exists && (
        <div className="space-y-4 mt-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-bold text-slate-900">{status.tenant?.businessName}</h2>
                <div className="text-sm text-slate-500 mt-1">Login: <span className="font-mono text-slate-800">{status.tenant?.loginEmail}</span></div>
                <div className="text-sm text-slate-500">{status.channel ? `Channel: ${status.channel.name} · auto-book ${status.channel.autoBookShipping ? 'ON' : 'OFF'}` : 'Channel: not connected yet — the tester connects it'}</div>
              </div>
              <div className="flex gap-2">
                <a href="/login" target="_blank" rel="noreferrer"><Button variant="secondary" leftIcon={<ExternalLink size={14} />}>Open login</Button></a>
                <Button variant="danger" leftIcon={<RefreshCw size={14} />} loading={busy} onClick={reset}>Reset demo data</Button>
              </div>
            </div>
            {status.counts && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                {[['Orders', status.counts.orders], ['MFN (you ship)', status.counts.mfn], ['FBA (Amazon ships)', status.counts.fba], ['Labels bought', status.counts.labels]].map(([k, v]) => (
                  <div key={String(k)} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                    <div className="text-2xl font-bold text-slate-900">{v}</div>
                    <div className="text-xs text-slate-500">{k}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-4">Forgot the password? It is not stored. Ask a developer to set a new one, or create a new demo login after removing this tenant.</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-bold text-slate-900 mb-3">What testers should click</h2>
            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-slate-700">{STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
            <p className="text-xs text-slate-400 mt-4">Press <b>Reset demo data</b> to take the demo back to the very start for the next tester. Labels are marked “DEMO LABEL — NOT VALID FOR SHIPPING”.</p>
          </div>
        </div>
      )}
    </div>
  );
}
