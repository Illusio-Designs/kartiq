'use client';

/**
 * Magic-link team invite acceptance.
 *
 * Flow:
 *   1. Tenant admin clicks "Invite" in /dashboard/team without setting a
 *      password. Backend creates an inactive user + emails a JWT-signed
 *      link to /accept-invite?token=...
 *   2. Recipient lands here. We hit GET /auth/invite/:token to confirm the
 *      link is valid and surface "You've been invited to <Tenant>" so the
 *      page isn't a blind credential prompt.
 *   3. They set a password (and optionally confirm their name) → POST
 *      /auth/accept-invite which activates the account, hashes the password
 *      and returns a session JWT. We persist it via useAuthStore and bounce
 *      to /dashboard.
 */

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, AlertCircle, Building2 } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { inviteApi, authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface InvitePreview {
  email: string;
  name?: string | null;
  tenantName?: string | null;
  expiresAt?: string | null;
}

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params?.get('token') || '';
  const { setAuth, setContext } = useAuthStore();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);

  // Verify the token + load preview info on mount.
  useEffect(() => {
    if (!token) { setPreviewError('No invite token in the URL.'); setLoading(false); return; }
    inviteApi.preview(token)
      .then((r) => {
        setPreview(r.data);
        setName(r.data?.name || '');
      })
      .catch((err) => {
        setPreviewError(err?.response?.data?.error || 'Could not verify the invite link.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Focus the password field once the preview resolves successfully.
  useEffect(() => {
    if (preview && !previewError) passwordRef.current?.focus();
  }, [preview, previewError]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await inviteApi.accept({ token, password, name: name.trim() || undefined });
      setAuth(res.data.user, res.data.token);
      // Hydrate the rest of the auth context (plan, permissions, tenant)
      try {
        const me = await authApi.me();
        setContext(me.data);
      } catch { /* non-fatal — dashboard will refetch */ }
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not accept the invite. The link may have expired.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left: form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-md">
          <Link href="/" className="inline-flex items-center mb-10" aria-label="Kartriq home">
            <BrandLogo variant="dark" priority className="h-9" />
          </Link>

          {loading ? (
            <div className="space-y-3">
              <div className="h-8 bg-slate-100 rounded w-3/4 animate-pulse" />
              <div className="h-4 bg-slate-100 rounded w-1/2 animate-pulse" />
              <div className="h-32 bg-slate-100 rounded mt-6 animate-pulse" />
            </div>
          ) : previewError ? (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-rose-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h2 className="font-bold text-rose-900">Can&apos;t accept this invite</h2>
                  <p className="text-sm text-rose-800 mt-1">{previewError}</p>
                  <p className="text-xs text-rose-700/80 mt-3">
                    Ask the admin who invited you to send a fresh invite from
                    Settings → Team, or just <Link href="/login" className="underline font-bold">sign in</Link>{' '}
                    if you already have an account.
                  </p>
                </div>
              </div>
            </div>
          ) : preview && (
            <>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent tracking-tight">
                Welcome to {preview.tenantName || 'the team'}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Set a password to finish creating your account.
              </p>

              <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
                <Building2 size={16} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-slate-700 min-w-0">
                  <div>You were invited as <strong className="break-all">{preview.email}</strong></div>
                  {preview.tenantName && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      Workspace: <strong>{preview.tenantName}</strong>
                    </div>
                  )}
                  {preview.expiresAt && (
                    <div className="text-[11px] text-slate-400 mt-1">
                      Link expires {new Date(preview.expiresAt).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Your name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Choose a password</label>
                  <input
                    ref={passwordRef}
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Confirm password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
                  />
                </div>
                {error && (
                  <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-start gap-2">
                    <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Activating…' : <>Accept invite <ArrowRight size={14} /></>}
                </button>
              </form>

              <p className="text-center text-xs text-slate-500 mt-6">
                Already have an account?{' '}
                <Link href="/login" className="font-bold text-emerald-600 hover:text-emerald-700">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>

      {/* Right: marketing panel */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 text-white relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-white/10 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-white/10 blur-[120px]" />
        <div className="relative max-w-md">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1.5 mb-6">
            <CheckCircle2 size={14} />
            <span className="text-xs font-bold">Joining a team</span>
          </div>
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Run your commerce<br />from one place.
          </h2>
          <p className="mt-5 text-white/80 leading-relaxed">
            Orders, inventory, customers and channels — all synced in real time
            for everyone on your team.
          </p>
        </div>
      </div>
    </div>
  );
}
