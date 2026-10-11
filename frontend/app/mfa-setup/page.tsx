'use client';

/**
 * Forced two-factor enrolment for admin accounts. The API answers every other
 * request with 403 MFA_SETUP_REQUIRED until this is done (see api.ts).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

export default function MfaSetupPage() {
  const router = useRouter();
  const { setContext } = useAuthStore();
  const [setup, setSetup] = useState<{ secret: string; qrImageUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    authApi.mfaSetup()
      .then((r) => setSetup(r.data))
      .catch((e) => {
        if (e?.response?.status === 401) router.replace('/login');
        else setErr(e?.response?.data?.error || 'Could not start setup');
      });
  }, [router]);

  const confirm = async () => {
    if (!/^\d{6}$/.test(code)) { setErr('Enter the 6-digit code from the app'); return; }
    setErr(''); setBusy(true);
    try {
      await authApi.mfaVerify(code);
      const me = await authApi.me();
      setContext(me.data);
      router.replace('/dashboard');
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Invalid code');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6 space-y-4">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="w-5 h-5" /> Turn on two-factor authentication
        </div>
        <p className="text-sm text-gray-600">
          Admin accounts must use an authenticator app (Google Authenticator, Authy, 1Password…).
          Scan the QR code, then enter the 6-digit code to continue.
        </p>
        {setup && (
          <div className="space-y-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qrImageUrl} alt="2FA QR code" className="mx-auto w-48 h-48" />
            <p className="text-xs text-gray-500 break-all">Can't scan? Enter this key: <b>{setup.secret}</b></p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" placeholder="123456"
              className="w-full border rounded-lg px-3 py-2 text-center tracking-widest"
            />
            <button onClick={confirm} disabled={busy}
              className="w-full bg-black text-white rounded-lg py-2 disabled:opacity-50">
              {busy ? 'Checking…' : 'Verify and continue'}
            </button>
          </div>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </div>
  );
}
