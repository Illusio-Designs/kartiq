'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, ShieldCheck, FlaskConical } from 'lucide-react';
import { oauthApi } from '@/lib/api';

// The FAKE "Authorize this app" screen for the demo tenant. In a real account,
// "Authorize with Amazon" opens Amazon Seller Central; in the demo it opens this
// page instead. Clicking Authorize marks the demo channel connected — nothing
// is sent to Amazon and no keys are involved.
function Consent() {
  const channelId = useSearchParams().get('channelId') || '';
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const authorize = async () => {
    setState('working'); setError('');
    try {
      await oauthApi.amazonDemoAuthorize(channelId);
      setState('done');
      setTimeout(() => { try { window.close(); } catch { /* user can close it */ } }, 1800);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Authorization failed');
      setState('error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-6 py-4 text-sm font-semibold">Amazon Seller Central <span className="text-slate-400 font-normal">· DEMO</span></div>
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <FlaskConical size={14} className="mt-0.5 shrink-0" />
            <span>This is a <b>fake</b> Amazon screen for the Kartriq demo. Nothing is sent to Amazon.</span>
          </div>
          {state === 'done' ? (
            <div className="text-center py-6 space-y-2">
              <CheckCircle2 className="mx-auto text-emerald-500" size={44} />
              <div className="font-bold text-slate-900">Connected</div>
              <p className="text-sm text-slate-500">You can close this tab and go back to Kartriq.</p>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-bold text-slate-900">Authorize Kartriq to access your seller account</h1>
              <ul className="text-sm text-slate-600 space-y-1.5">
                <li className="flex gap-2"><ShieldCheck size={15} className="text-emerald-600 mt-0.5 shrink-0" /> Read your orders and listings</li>
                <li className="flex gap-2"><ShieldCheck size={15} className="text-emerald-600 mt-0.5 shrink-0" /> Update inventory and shipment details</li>
                <li className="flex gap-2"><ShieldCheck size={15} className="text-emerald-600 mt-0.5 shrink-0" /> Buy shipping labels for orders you ship</li>
              </ul>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={authorize}
                disabled={!channelId || state === 'working'}
                className="w-full rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-60 text-slate-900 font-bold py-2.5 transition-colors"
              >
                {state === 'working' ? 'Authorizing…' : 'Authorize'}
              </button>
              <button onClick={() => window.close()} className="w-full text-sm text-slate-500 hover:text-slate-700">Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DemoAmazonConsentPage() {
  return <Suspense fallback={null}><Consent /></Suspense>;
}
