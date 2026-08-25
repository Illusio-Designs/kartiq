'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi, planApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { track, upgradeSession } from '@/lib/analytics';
import { ArrowRight, Sparkles, Building2, User, Lock, CheckCircle2 } from 'lucide-react';
import { PhoneField, isPhoneEmpty, Input, Select } from '@/components/ui';
import {
  collectErrors, validateEmail, validateGstin, validatePassword, validatePhone, validateText,
} from '@/lib/validators';

function OnboardingInner() {
  const router = useRouter();
  const params = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<any[]>([]);
  const [planCode, setPlanCode] = useState(params.get('plan') || 'STANDARD');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [step1Errs, setStep1Errs] = useState<{ ownerName?: string; email?: string; password?: string }>({});
  const [step2Errs, setStep2Errs] = useState<{ businessName?: string; gstin?: string }>({});
  const [form, setForm] = useState({
    ownerName: '', email: '', password: '',
    businessName: '', phone: '', gstin: '',
    industry: '', companySize: '', country: 'IN',
  });
  // Capture `?ref=CODE` once on mount + persist to localStorage so the link
  // keeps working after a tab refresh / coming back from email verification.
  const [referralCode, setReferralCode] = useState<string>('');
  useEffect(() => {
    const fromUrl = params.get('ref') || params.get('referral');
    if (fromUrl) {
      const cleaned = fromUrl.trim().toUpperCase().slice(0, 32);
      setReferralCode(cleaned);
      try { localStorage.setItem('kartriq.referralCode', cleaned); } catch {}
    } else {
      try {
        const saved = localStorage.getItem('kartriq.referralCode') || '';
        if (saved) setReferralCode(saved);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    planApi.list().then((r) => setPlans(r.data || [])).catch(() => {});
  }, []);

  const update = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k in step1Errs) setStep1Errs((e) => ({ ...e, [k]: undefined }));
    if (k in step2Errs) setStep2Errs((e) => ({ ...e, [k]: undefined }));
  };

  const validateStep1 = (): boolean => {
    const errs = collectErrors([
      ['ownerName', validateText(form.ownerName, { required: true, fieldName: 'Full name' })],
      ['email',     validateEmail(form.email, { required: true })],
      ['password',  validatePassword(form.password, { required: true })],
    ]);
    setStep1Errs(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = (): boolean => {
    const errs = collectErrors([
      ['businessName', validateText(form.businessName, { required: true, fieldName: 'Business name' })],
      // GSTIN is optional in onboarding (some businesses don't have one yet)
      ['gstin',        validateGstin(form.gstin)],
    ]);
    setStep2Errs(errs);
    const pErr = validatePhone(form.phone);
    setPhoneError(pErr);
    return Object.keys(errs).length === 0 && !pErr;
  };

  const submit = async () => {
    setErr('');
    setLoading(true);
    try {
      const { data } = await authApi.onboard({
        ...form,
        phone: isPhoneEmpty(form.phone) ? '' : form.phone,
        planCode,
        ...(referralCode ? { referralCode } : {}),
      });
      // Clear the cached referral so it doesn't stick on the next signup
      // from this device.
      try { localStorage.removeItem('kartriq.referralCode'); } catch {}
      // Conversion: SaaS signup. Mapped to Meta CompleteRegistration +
      // StartTrial (every signup gets a 14-day trial). Marked as a
      // high-value Clarity session so the recording sticks.
      track('signup_complete', {
        plan: planCode || 'STANDARD',
        referred: referralCode ? 'yes' : 'no',
      });
      upgradeSession('signup_complete');
      setAuth(data.user, data.token);
      // Defer the redirect so the Zustand persist middleware has a tick
      // to write the new token to localStorage. Otherwise on a hard
      // refresh of /dashboard/billing the next render reads the *old*
      // (empty) auth state, the layout's auth guard bounces to /login,
      // and the user appears to have lost their signup.
      queueMicrotask(() => router.push('/dashboard/billing'));
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Onboarding failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-slate-50 via-emerald-50/60 to-white">
      <div className="pointer-events-none absolute -top-40 -left-32 w-[480px] h-[480px] rounded-full bg-[#0B1220]/[0.05] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 w-[480px] h-[480px] rounded-full bg-[#06D4B8]/[0.10] blur-3xl" />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 uppercase tracking-wider">
            <Sparkles size={12} /> Get Started
          </div>
          <h1 className="text-4xl font-bold mt-3 bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent">Set up your business</h1>
          <p className="text-slate-600 mt-2">14-day free trial. No credit card required.</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`flex items-center gap-2 ${n < 3 ? 'flex-1 max-w-[160px]' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                step >= n ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
              }`}>{n}</div>
              {n < 3 && <div className={`flex-1 h-0.5 ${step > n ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <User size={18} /> Your account
              </h2>
              <Field label="Full name"   value={form.ownerName} onChange={(v) => update('ownerName', v)} error={step1Errs.ownerName} />
              <Field label="Work email"  value={form.email}     onChange={(v) => update('email', v)} type="email" error={step1Errs.email} />
              <Field label="Password"    value={form.password}  onChange={(v) => update('password', v)} type="password" error={step1Errs.password} placeholder="At least 8 characters with a letter and a number" />
              <button
                onClick={() => { if (validateStep1()) setStep(2); }}
                className="btn-primary w-full mt-4"
              >
                Continue <ArrowRight size={16} className="inline ml-1" />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Building2 size={18} /> Your business
              </h2>
              <Field label="Business name"  value={form.businessName} onChange={(v) => update('businessName', v)} error={step2Errs.businessName} />
              <div className="grid grid-cols-2 gap-4">
                <PhoneField
                  label="Phone"
                  value={form.phone}
                  onChange={(v) => { update('phone', v); if (phoneError) setPhoneError(null); }}
                  error={phoneError || undefined}
                />
                <Field label="GSTIN (optional)" value={form.gstin} onChange={(v) => update('gstin', v.toUpperCase())} error={step2Errs.gstin} placeholder="22AAAAA0000A1Z5" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Industry"
                  fullWidth
                  placeholder="Select industry"
                  value={form.industry}
                  onChange={(v) => update('industry', v)}
                  options={[
                    { value: 'Apparel', label: 'Apparel' },
                    { value: 'Electronics', label: 'Electronics' },
                    { value: 'Beauty', label: 'Beauty' },
                    { value: 'Food', label: 'Food' },
                    { value: 'Home', label: 'Home' },
                    { value: 'Other', label: 'Other' },
                  ]}
                />
                <Select
                  label="Company size"
                  fullWidth
                  placeholder="Select size"
                  value={form.companySize}
                  onChange={(v) => update('companySize', v)}
                  options={[
                    { value: '1-10', label: '1-10' },
                    { value: '11-50', label: '11-50' },
                    { value: '51-200', label: '51-200' },
                    { value: '200+', label: '200+' },
                  ]}
                />
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setStep(1)} className="btn-secondary flex-1">Back</button>
                <button
                  onClick={() => { if (validateStep2()) setStep(3); }}
                  className="btn-primary flex-1"
                >
                  Continue <ArrowRight size={16} className="inline ml-1" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Lock size={18} /> Choose your plan
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {plans.map((p) => (
                  <button
                    key={p.code}
                    onClick={() => setPlanCode(p.code)}
                    className={`text-left p-4 rounded-2xl border-2 transition-all ${
                      planCode === p.code
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-900">{p.name}</div>
                      {planCode === p.code && <CheckCircle2 size={16} className="text-emerald-600" />}
                    </div>
                    <div className="text-2xl font-bold mt-2">₹{Number(p.monthlyPrice).toLocaleString()}<span className="text-xs text-slate-500">/mo</span></div>
                    <div className="text-xs text-slate-500 mt-1">
                      {p.maxFacilities ?? '∞'} facility · {p.maxUserRoles ?? '∞'} roles
                    </div>
                  </button>
                ))}
              </div>

              {err && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{err}</div>}

              <div className="flex gap-2 mt-4">
                <button onClick={() => setStep(2)} className="btn-secondary flex-1">Back</button>
                <button onClick={submit} disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
                  {loading ? 'Creating…' : 'Create my account'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', error, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  error?: string | null;
  placeholder?: string;
}) {
  return (
    <Input
      label={label}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      error={error || undefined}
    />
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingInner />
    </Suspense>
  );
}
