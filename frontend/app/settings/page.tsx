'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  Button, Card, Input, Textarea, Select, Switch, PasswordInput, FileUpload, Badge, Avatar,
  PhoneField, isPhoneEmpty, validatePhone,
} from '@/components/ui';
import {
  User, Building2, Bell, Shield, CreditCard, Mail, Save, Check,
  Download, Trash2, Smartphone, AlertTriangle, Palette,
} from 'lucide-react';
import { ThemeSegmented } from '@/components/theme/ThemeToggle';
import { useAuthStore } from '@/store/auth.store';
import { authApi, billingApi } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { useRouter } from 'next/navigation';

const TABS = [
  { key: 'profile',  label: 'Profile',       icon: User },
  { key: 'company',  label: 'Company',       icon: Building2 },
  { key: 'security', label: 'Security',      icon: Shield },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'appearance', label: 'Appearance',   icon: Palette },
  { key: 'billing',  label: 'Billing',       icon: CreditCard },
];

const CURRENCIES = [
  { value: 'INR', label: '₹ Indian Rupee (INR)' },
  { value: 'USD', label: '$ US Dollar (USD)' },
  { value: 'EUR', label: '€ Euro (EUR)' },
  { value: 'GBP', label: '£ British Pound (GBP)' },
];

const TIMEZONES = [
  { value: 'Asia/Kolkata',   label: 'India Standard Time (IST)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'Europe/London',  label: 'Greenwich Mean Time (GMT)' },
  { value: 'Asia/Dubai',     label: 'Gulf Standard Time (GST)' },
];

export default function SettingsPage() {
  const { user, tenant, setContext } = useAuthStore();

  // Pull the freshest user/tenant on mount so cached values from login don't override post-save updates
  useEffect(() => {
    authApi.me()
      .then(({ data }) => {
        const { tenant: t, plan, subscription, permissions, ...userFields } = data;
        setContext({ user: userFields, tenant: t ?? null, plan: plan ?? null, subscription: subscription ?? null, permissions: permissions ?? [] });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tab, setTab] = useState('profile');
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState({ name: '', email: '', phone: '' });
  const [profilePhoneError, setProfilePhoneError] = useState<string | null>(null);
  const [company, setCompany] = useState({
    name: '', gstin: '', address: '', currency: 'INR', timezone: 'Asia/Kolkata',
  });
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [notifications, setNotifications] = useState({
    orders: true, lowStock: true, reviews: false, marketing: false, weekly: true,
  });
  const [logo, setLogo] = useState<File[]>([]);
  const [profileError, setProfileError] = useState('');
  const [companyError, setCompanyError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Hydrate from the auth store once it's loaded
  useEffect(() => {
    if (user) setProfile({ name: user.name || '', email: user.email || '', phone: (user as any).phone || '' });
  }, [user]);
  useEffect(() => {
    if (tenant) setCompany((c) => ({ ...c, name: tenant.businessName || '', gstin: (tenant as any).gstin || '' }));
  }, [tenant]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('notificationPrefs');
      if (saved) setNotifications(JSON.parse(saved));
    } catch {}
  }, []);

  const refreshFromServer = async () => {
    try {
      const { data } = await authApi.me();
      const { tenant: t, plan, subscription, permissions, ...userFields } = data;
      setContext({ user: userFields, tenant: t ?? null, plan: plan ?? null, subscription: subscription ?? null, permissions: permissions ?? [] });
    } catch {}
  };

  const saveProfile = async () => {
    setProfileError('');
    const pErr = validatePhone(profile.phone);
    if (pErr) { setProfilePhoneError(pErr); return; }
    setProfilePhoneError(null);
    try {
      await authApi.updateMe({
        name: profile.name,
        phone: isPhoneEmpty(profile.phone) ? '' : profile.phone,
      });
      await refreshFromServer();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setProfileError(err.response?.data?.error || err.message);
    }
  };

  const saveCompany = async () => {
    setCompanyError('');
    try {
      await billingApi.updateTenant({ businessName: company.name, gstin: company.gstin });
      await refreshFromServer();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setCompanyError(err.response?.data?.error || err.message);
    }
  };

  const savePassword = async () => {
    setPasswordError('');
    if (password.next !== password.confirm) {
      setPasswordError('New passwords do not match');
      return;
    }
    try {
      await authApi.changePassword(password.current, password.next);
      setPassword({ current: '', next: '', confirm: '' });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setPasswordError(err.response?.data?.error || err.message);
    }
  };

  const saveNotifications = () => {
    localStorage.setItem('notificationPrefs', JSON.stringify(notifications));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 animate-slide-up max-w-5xl">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent tracking-tight">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your account and workspace</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* Tabs */}
          <div className="lg:col-span-1">
            <Card className="p-2">
              <nav className="space-y-0.5">
                {TABS.map(t => {
                  const Icon = t.icon;
                  const active = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                        active
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <Icon size={15} className={active ? 'text-emerald-600' : 'text-slate-400'} />
                      {t.label}
                    </button>
                  );
                })}
              </nav>
            </Card>
          </div>

          {/* Content */}
          <div className="lg:col-span-3 space-y-4">
            {tab === 'profile' && (
              <Card className="p-6">
                <h2 className="font-bold text-lg text-slate-900 mb-1">Profile</h2>
                <p className="text-xs text-slate-500 mb-5">Your personal information</p>

                <div className="flex items-center gap-4 mb-6">
                  <Avatar name={profile.name || 'U'} size="xl" />
                  <div>
                    <Button size="sm" variant="secondary">Change Avatar</Button>
                    <p className="text-xs text-slate-500 mt-1">PNG, JPG up to 2MB</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <Input label="Full Name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                  <Input label="Email" type="email" leftIcon={<Mail size={14} />} value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
                  <PhoneField
                    label="Phone"
                    value={profile.phone}
                    onChange={(v) => { setProfile({ ...profile, phone: v }); if (profilePhoneError) setProfilePhoneError(null); }}
                    error={profilePhoneError || undefined}
                  />
                </div>

                {profileError && <p className="text-xs text-rose-600 font-medium mt-2">{profileError}</p>}
                <div className="flex items-center justify-end gap-2 mt-6 pt-6 border-t border-slate-100">
                  <Button variant="secondary" onClick={() => {
                    if (user) setProfile({ name: user.name || '', email: user.email || '', phone: (user as any).phone || '' });
                  }}>Reset</Button>
                  <Button leftIcon={saved ? <Check size={14} /> : <Save size={14} />} onClick={saveProfile}>
                    {saved ? 'Saved' : 'Save Changes'}
                  </Button>
                </div>
              </Card>
            )}

            {tab === 'company' && (
              <Card className="p-6">
                <h2 className="font-bold text-lg text-slate-900 mb-1">Company Info</h2>
                <p className="text-xs text-slate-500 mb-5">Used on invoices, reports, and public pages</p>

                <div className="space-y-4">
                  <Input label="Company Name" leftIcon={<Building2 size={14} />} value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />
                  <Input label="GSTIN" value={company.gstin} onChange={(e) => setCompany({ ...company, gstin: e.target.value.toUpperCase() })} placeholder="22AAAAA0000A1Z5" />
                  <Textarea label="Registered Address" value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} rows={3} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Select label="Currency" value={company.currency} onChange={(v) => setCompany({ ...company, currency: v })} options={CURRENCIES} fullWidth />
                    <Select label="Timezone" value={company.timezone} onChange={(v) => setCompany({ ...company, timezone: v })} options={TIMEZONES} fullWidth />
                  </div>
                  <FileUpload
                    label="Company Logo"
                    accept="image/*"
                    maxSize={2 * 1024 * 1024}
                    value={logo}
                    onChange={setLogo}
                    hint="Square PNG recommended, min 200×200"
                  />
                </div>

                {companyError && <p className="text-xs text-rose-600 font-medium mt-2">{companyError}</p>}
                <div className="flex items-center justify-end gap-2 mt-6 pt-6 border-t border-slate-100">
                  <Button leftIcon={saved ? <Check size={14} /> : <Save size={14} />} onClick={saveCompany}>
                    {saved ? 'Saved' : 'Save Changes'}
                  </Button>
                </div>
              </Card>
            )}

            {tab === 'security' && (
              <>
                <Card className="p-6">
                  <h2 className="font-bold text-lg text-slate-900 mb-1">Change Password</h2>
                  <p className="text-xs text-slate-500 mb-5">Use a strong password you don't use elsewhere</p>

                  <div className="space-y-4">
                    <PasswordInput label="Current Password" value={password.current} onChange={(e) => setPassword({ ...password, current: e.target.value })} />
                    <PasswordInput label="New Password" value={password.next} onChange={(e) => setPassword({ ...password, next: e.target.value })} showStrength />
                    <PasswordInput label="Confirm Password" value={password.confirm} onChange={(e) => setPassword({ ...password, confirm: e.target.value })} />
                  </div>

                  {passwordError && <p className="text-xs text-rose-600 font-medium">{passwordError}</p>}
                  <div className="flex items-center justify-end gap-2 mt-6 pt-6 border-t border-slate-100">
                    <Button leftIcon={<Save size={14} />} onClick={savePassword}>Update Password</Button>
                  </div>
                </Card>

                <TwoFactorCard />

                <Card className="p-6">
                  <h2 className="font-bold text-lg text-slate-900 mb-1">Active Session</h2>
                  <p className="text-xs text-slate-500 mb-4">Authentication uses stateless tokens, so only the current browser session is shown.</p>
                  <CurrentSessionCard />
                </Card>

                <DataPrivacyCard />
              </>
            )}

            {tab === 'notifications' && (
              <Card className="p-6">
                <h2 className="font-bold text-lg text-slate-900 mb-1">Notifications</h2>
                <p className="text-xs text-slate-500 mb-5">Choose which alerts you want to receive</p>

                <div className="space-y-4 divide-y divide-slate-100">
                  <Switch label="New orders"    description="Get notified when a new order is placed"   checked={notifications.orders}    onCheckedChange={(v) => setNotifications({ ...notifications, orders: v })} />
                  <div className="pt-4"><Switch label="Low stock alerts" description="Notify when SKUs fall below reorder point" checked={notifications.lowStock} onCheckedChange={(v) => setNotifications({ ...notifications, lowStock: v })} /></div>
                  <div className="pt-4"><Switch label="Review requests"  description="Alerts when review APIs fail or succeed"   checked={notifications.reviews}   onCheckedChange={(v) => setNotifications({ ...notifications, reviews: v })} /></div>
                  <div className="pt-4"><Switch label="Weekly summary"   description="Monday morning business digest"           checked={notifications.weekly}    onCheckedChange={(v) => setNotifications({ ...notifications, weekly: v })} /></div>
                  <div className="pt-4"><Switch label="Marketing emails" description="Product updates and commerce tips"        checked={notifications.marketing} onCheckedChange={(v) => setNotifications({ ...notifications, marketing: v })} /></div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-6 pt-6 border-t border-slate-100">
                  <Button leftIcon={saved ? <Check size={14} /> : <Save size={14} />} onClick={saveNotifications}>
                    {saved ? 'Saved' : 'Save Preferences'}
                  </Button>
                </div>
              </Card>
            )}

            {tab === 'appearance' && (
              <Card className="p-6">
                <h2 className="font-bold text-lg text-slate-900 mb-1">Appearance</h2>
                <p className="text-xs text-slate-500 mb-5">Choose how Kartriq looks to you</p>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Theme</label>
                  <ThemeSegmented />
                  <p className="text-xs text-slate-500 mt-2">
                    <span className="font-semibold">System</span> follows your device setting and
                    switches automatically between light and dark. Your choice is saved on this
                    browser. You can also switch any time from the moon/sun button in the top bar.
                  </p>
                </div>
              </Card>
            )}

            {tab === 'billing' && (
              <>
                <Card className="p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-emerald-100 blur-3xl opacity-50" />
                  <div className="relative">
                    <Badge variant="emerald">Current Plan</Badge>
                    <h2 className="text-2xl font-bold text-slate-900 mt-2">Growth</h2>
                    <p className="text-xs text-slate-500 mt-1">Unlimited channels · 10,000 orders/month</p>
                    <div className="flex items-baseline gap-1 mt-4">
                      <span className="text-4xl font-bold gradient-text">₹2,499</span>
                      <span className="text-sm text-slate-500 font-semibold">/month</span>
                    </div>
                    <div className="flex items-center gap-2 mt-5">
                      <Button>Upgrade Plan</Button>
                      <Button variant="secondary">Cancel Subscription</Button>
                    </div>
                  </div>
                </Card>

                <Card className="p-6">
                  <h2 className="font-bold text-lg text-slate-900 mb-4">Payment Method</h2>
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50/50 border border-slate-100">
                    <div className="w-12 h-8 rounded-md bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white text-xs font-bold">
                      VISA
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-slate-900">•••• •••• •••• 4242</div>
                      <div className="text-xs text-slate-500">Expires 12/2027</div>
                    </div>
                    <Button size="sm" variant="secondary">Update</Button>
                  </div>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Renders the current browser session derived from the JWT and navigator info.
// JWTs are stateless — there's no per-session table on the server, so only the
// active browser tab is shown.
function CurrentSessionCard() {
  const [info, setInfo] = useState<{ device: string; issuedAt?: Date; expiresAt?: Date } | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    let issuedAt: Date | undefined;
    let expiresAt: Date | undefined;
    try {
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.iat) issuedAt = new Date(payload.iat * 1000);
        if (payload.exp) expiresAt = new Date(payload.exp * 1000);
      }
    } catch {}

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const browser = /Edg/i.test(ua) ? 'Edge'
      : /Chrome/i.test(ua) ? 'Chrome'
      : /Safari/i.test(ua) ? 'Safari'
      : /Firefox/i.test(ua) ? 'Firefox'
      : 'Browser';
    const os = /Windows/i.test(ua) ? 'Windows'
      : /Mac/i.test(ua) ? 'macOS'
      : /Android/i.test(ua) ? 'Android'
      : /iPhone|iPad/i.test(ua) ? 'iOS'
      : /Linux/i.test(ua) ? 'Linux'
      : 'Unknown OS';
    setInfo({ device: `${os} — ${browser}`, issuedAt, expiresAt });
  }, []);

  if (!info) return null;

  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50/50 border border-slate-100">
      <div>
        <div className="text-sm font-bold text-slate-900">{info.device}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {info.issuedAt && <>Signed in {info.issuedAt.toLocaleString()}</>}
          {info.expiresAt && <> · Expires {info.expiresAt.toLocaleString()}</>}
        </div>
      </div>
      <Badge variant="emerald" dot>Current</Badge>
    </div>
  );
}

// ─── 2FA / TOTP card ────────────────────────────────────────────────────────
function TwoFactorCard() {
  const { user, setContext } = useAuthStore();
  const enabled = !!user?.mfaEnabled;
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; qrImageUrl: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const startSetup = async () => {
    setErr(''); setCode(''); setBusy(true);
    try {
      const r = await authApi.mfaSetup();
      setSetup(r.data);
      setSetupOpen(true);
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Could not start setup');
    } finally { setBusy(false); }
  };

  const completeSetup = async () => {
    if (!/^\d{6}$/.test(code)) { setErr('Enter the 6-digit code from the app'); return; }
    setErr(''); setBusy(true);
    try {
      await authApi.mfaVerify(code);
      setSetupOpen(false); setSetup(null); setCode('');
      // refresh user state — caller of useAuthStore needs an updated mfaEnabled
      const me = await authApi.me();
      setContext(me.data);
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Invalid code');
    } finally { setBusy(false); }
  };

  const completeDisable = async () => {
    if (!pwd || !/^\d{6}$/.test(code)) { setErr('Password and 6-digit code required'); return; }
    setErr(''); setBusy(true);
    try {
      await authApi.mfaDisable(pwd, code);
      setDisableOpen(false); setPwd(''); setCode('');
      const me = await authApi.me();
      setContext(me.data);
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to disable');
    } finally { setBusy(false); }
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-lg text-slate-900 mb-1">Two-Factor Authentication</h2>
          <p className="text-xs text-slate-500 mb-1">
            Require a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password, etc.) when signing in.
          </p>
          {enabled && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-1 uppercase tracking-wider mt-2">
              <Check size={11} /> Active
            </span>
          )}
        </div>
        {enabled ? (
          <Button variant="outline" leftIcon={<Smartphone size={14} />} onClick={() => { setDisableOpen(true); setErr(''); }}>
            Disable 2FA
          </Button>
        ) : (
          <Button variant="primary" leftIcon={<Smartphone size={14} />} onClick={startSetup} loading={busy}>
            Enable 2FA
          </Button>
        )}
      </div>

      {/* Setup modal */}
      <Modal open={setupOpen} onClose={() => setSetupOpen(false)} title="Set up two-factor authentication" size="md">
        {setup && (
          <div className="space-y-4">
            <ol className="text-sm text-slate-600 list-decimal pl-5 space-y-1">
              <li>Open your authenticator app and tap <strong>Add account</strong>.</li>
              <li>Scan this QR code, or paste the secret if scanning fails.</li>
              <li>Enter the 6-digit code the app shows to confirm.</li>
            </ol>
            <div className="flex flex-col items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qrImageUrl} alt="2FA QR code" width={200} height={200} className="rounded-lg bg-white p-2" />
              <code className="text-xs text-slate-600 font-mono break-all text-center">{setup.secret}</code>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Verification code</label>
              <input
                type="text" inputMode="numeric" maxLength={6} pattern="\d{6}"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-center text-2xl font-mono tracking-[0.5em] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
              />
            </div>
            {err && <p className="text-xs text-rose-600">{err}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSetupOpen(false)}>Cancel</Button>
              <Button variant="primary" loading={busy} onClick={completeSetup}>Verify and enable</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Disable modal */}
      <Modal open={disableOpen} onClose={() => setDisableOpen(false)} title="Disable two-factor authentication" size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Confirm your password and enter a current 2FA code to remove this layer of protection.
          </p>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Current password</label>
            <input
              type="password" autoComplete="current-password"
              value={pwd} onChange={(e) => setPwd(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Authenticator code</label>
            <input
              type="text" inputMode="numeric" maxLength={6} pattern="\d{6}"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-center text-xl font-mono tracking-[0.4em] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
            />
          </div>
          {err && <p className="text-xs text-rose-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDisableOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={completeDisable}>Disable 2FA</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

// ─── Data privacy: export + delete account ─────────────────────────────────
function DataPrivacyCard() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  // OAuth-only users (Google) have no password to confirm with — their flow
  // requires them to retype their email instead.
  const hasPassword = !user?.provider || user.provider === 'local';
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const exportData = async () => {
    setExporting(true);
    try {
      const r = await authApi.exportMe();
      const blob = new Blob([r.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kartriq-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // ignore — error toast handled globally
    } finally { setExporting(false); }
  };

  const doDelete = async () => {
    setErr(''); setBusy(true);
    try {
      await authApi.deleteMe(hasPassword ? { password: pwd } : { confirmEmail });
      logout();
      router.replace('/');
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Could not delete account');
    } finally { setBusy(false); }
  };

  return (
    <Card className="p-6">
      <h2 className="font-bold text-lg text-slate-900 mb-1">Data &amp; Privacy</h2>
      <p className="text-xs text-slate-500 mb-5">
        Download a copy of your tenant data, or permanently delete your account.
      </p>

      <div className="space-y-3">
        <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200">
          <div>
            <div className="text-sm font-bold text-slate-900">Download my data</div>
            <div className="text-xs text-slate-500 mt-0.5">
              JSON bundle of products, orders, customers, invoices and more — for portability or backup.
            </div>
          </div>
          <Button variant="outline" leftIcon={<Download size={14} />} loading={exporting} onClick={exportData}>
            Export
          </Button>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl border border-rose-200 bg-rose-50/40">
          <div>
            <div className="text-sm font-bold text-rose-800">Delete my account</div>
            <div className="text-xs text-rose-700/80 mt-0.5">
              Removes your login and scrubs personal data. If you own the tenant, the workspace is also marked for deletion.
            </div>
          </div>
          <Button variant="danger" leftIcon={<Trash2 size={14} />} onClick={() => { setDeleteOpen(true); setErr(''); }}>
            Delete
          </Button>
        </div>
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account" size="md">
        <div className="space-y-4">
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-3 text-xs">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <div className="space-y-2">
              <p className="font-semibold">Login disabled immediately.</p>
              <p>
                Your account will be marked DELETED and you&apos;ll be signed out.
                If you own this workspace, the team will lose access too.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-1.5">
            <p className="font-semibold">Changed your mind? You have 30 days.</p>
            <p>
              Email{' '}
              <a href="mailto:privacy@kartriq.com" className="font-semibold underline">privacy@kartriq.com</a>{' '}
              from this same email address within 30 days and we&apos;ll restore your account fully —
              login, team access, and all business data come back as if nothing happened.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-900">After 30 days</p>
            <p>
              Personal identifiers (name, email, phone) are permanently scrubbed and the account becomes unrecoverable.
              Business records (invoices, orders, audit logs) are retained per Indian GST/accounting rules — typically up to 8 years —
              but de-linked from your identity.
            </p>
          </div>
          {hasPassword ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Confirm with your password</label>
              <input type="password" autoComplete="current-password" value={pwd} onChange={(e) => setPwd(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none" />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Type your email <code className="font-mono">{user?.email}</code> to confirm
              </label>
              <input type="email" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none" />
            </div>
          )}
          {err && <p className="text-xs text-rose-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={doDelete}>Permanently delete</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
