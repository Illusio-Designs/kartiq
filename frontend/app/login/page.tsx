'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useAuthStore, isTokenExpired } from '@/store/auth.store';
import { Sparkles, ArrowRight, Mail, AlertCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { validateEmail, validateRequired } from '@/lib/validators';

export default function LoginPage() {
  const router = useRouter();
  const { token, setAuth, setContext, isPlatformAdmin, logout } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const mfaInputRef = useRef<HTMLInputElement>(null);

  // Focus the MFA code input the moment the form transitions into the
  // 2FA challenge step — saves a click after the user just typed their
  // password. Programmatic focus avoids the jsx-a11y/no-autofocus rule.
  useEffect(() => {
    if (mfaToken) mfaInputRef.current?.focus();
  }, [mfaToken]);

  // Already logged in with a valid token? Redirect away. If expired, clear it.
  useEffect(() => {
    if (!token) return;
    if (isTokenExpired(token)) {
      logout();
      return;
    }
    router.replace(isPlatformAdmin() ? '/admin' : '/dashboard');
  }, [token]);

  const loadContext = async () => {
    try {
      const me = await authApi.me();
      setContext({
        tenant: me.data.tenant,
        plan: me.data.plan,
        subscription: me.data.subscription,
        permissions: me.data.permissions || [],
      });
      return me.data;
    } catch {
      return null;
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Read from the form so browser-autofilled values work even if React
    // state didn't catch the autofill onChange event.
    const formData = new FormData(e.currentTarget);
    const emailValue = ((formData.get('email') as string) || email).trim();
    const passwordValue = (formData.get('password') as string) || password;

    const eErr = validateEmail(emailValue, { required: true });
    const pErr = validateRequired(passwordValue, 'Password');
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) return;

    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(emailValue, passwordValue);
      // 2FA challenge — server returned a short-lived mfa token instead of a
      // full session. Switch the form into MFA mode and wait for the code.
      if (res.data?.mfaRequired && res.data?.mfaToken) {
        setMfaToken(res.data.mfaToken);
        setLoading(false);
        return;
      }
      setAuth(res.data.user, res.data.token);
      const me = await loadContext();
      router.replace(me?.isPlatformAdmin ? '/admin' : '/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Login failed. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    if (!/^\d{6}$/.test(mfaCode)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await authApi.mfaLogin(mfaToken, mfaCode);
      setAuth(res.data.user, res.data.token);
      const me = await loadContext();
      router.replace(me?.isPlatformAdmin ? '/admin' : '/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Invalid code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left: form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-md">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Sparkles size={17} className="text-white" />
            </div>
            <span className="font-bold text-lg text-slate-900">Kartriq</span>
          </Link>

          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#0891b2] bg-clip-text text-transparent tracking-tight">
            {mfaToken ? 'Two-factor authentication' : 'Welcome back'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {mfaToken
              ? 'Enter the 6-digit code from your authenticator app to continue.'
              : 'Sign in to continue to your dashboard'}
          </p>

          {mfaToken && (
            <form onSubmit={handleMfaSubmit} className="mt-8 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Authenticator code</label>
                <input
                  ref={mfaInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-center text-2xl font-mono tracking-[0.5em] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
                />
              </div>
              {error && (
                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>
              )}
              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Verifying…' : 'Verify and sign in'}
              </button>
              <button
                type="button"
                onClick={() => { setMfaToken(null); setMfaCode(''); setError(''); }}
                className="w-full text-xs text-slate-500 hover:text-slate-700"
              >
                ← Use a different account
              </button>
            </form>
          )}

          {!mfaToken && (
          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <Input
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(null); }}
              placeholder="you@company.com"
              leftIcon={<Mail size={15} />}
              error={emailError || undefined}
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700">Password</label>
                <Link
                  href="/help"
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                >
                  Forgot?
                </Link>
              </div>
              <PasswordInput
                name="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(null); }}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              {passwordError && <p className="text-xs text-rose-600 mt-1 font-medium">{passwordError}</p>}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/30 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  Sign in <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>
          )}

          <p className="text-center text-sm text-slate-500 mt-6">
            Don't have an account?{' '}
            <Link href="/onboarding" className="font-bold text-emerald-600 hover:text-emerald-700">
              Start free trial
            </Link>
          </p>
        </div>
      </div>

      {/* Right: marketing panel */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-white/10 blur-3xl -translate-y-1/3 translate-x-1/4" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 rounded-full bg-emerald-300/20 blur-3xl translate-y-1/2" />

        <div className="relative flex flex-col justify-between p-12 text-white">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur text-xs font-bold uppercase tracking-wider w-fit">
            <Sparkles size={12} /> Everything Commerce
          </div>

          <div>
            <h2 className="text-4xl xl:text-5xl font-bold tracking-tight leading-tight">
              One platform<br />
              for every channel.
            </h2>
            <p className="mt-4 text-white/80 text-base max-w-md leading-relaxed">
              Amazon, Flipkart, Blinkit, Shopify & 56+ more — manage orders, inventory, shipping, and reviews in one beautiful dashboard.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { value: '56+',  label: 'Channels' },
              { value: '14d',  label: 'Free trial' },
              { value: '99.9%', label: 'Uptime' },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-[10px] font-bold text-white/70 uppercase tracking-wider mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
