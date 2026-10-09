'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api';
import {
  Save, Eye, EyeOff, CheckCircle2, Lock, Package2, Mail, CreditCard, ShoppingBag, Cable, Globe, Sparkles, Clock, BarChart3, Wrench, Gift,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tabs, TabItem } from '@/components/ui';

const CATEGORY_META: Record<string, { label: string; description: string; icon: any }> = {
  amazon:      { label: 'Amazon SP-API',  description: 'Public app credentials used for OAuth. Every seller authorizes this one app.', icon: ShoppingBag },
  shopify:     { label: 'Shopify',        description: 'Shopify public/custom app credentials for OAuth onboarding.',                icon: ShoppingBag },
  flipkart:    { label: 'Flipkart',       description: 'Flipkart Marketplace app credentials.',                                     icon: ShoppingBag },
  meta:        { label: 'Meta (FB/IG/WA)',description: 'Meta app for Facebook Shop, Instagram Shopping, WhatsApp Business.',         icon: Globe },
  google:      { label: 'Google OAuth',   description: 'Sign-in-with-Google credentials.',                                           icon: Globe },
  razorpay:    { label: 'Razorpay',       description: 'Payment gateway — rotating keys here takes effect within 60 seconds.',       icon: CreditCard },
  smtp:        { label: 'SMTP Email',     description: 'Outbound email transport. Leave blank for console-stub mode in dev.',        icon: Mail },
  billing:     { label: 'Billing',        description: 'Grace periods, invoice policy.',                                             icon: Sparkles },
  reviews:     { label: 'Reviews',        description: 'Automated review-request cadence.',                                          icon: Clock },
  referral:    { label: 'Referral',       description: 'Referral reward settings for referrers when an invited tenant becomes a paid customer.', icon: Gift },
  tracking:    { label: 'Tracking',       description: 'Analytics IDs injected into the public site (GA, FB Pixel, Microsoft Clarity).', icon: BarChart3 },
  maintenance: { label: 'Maintenance',    description: 'Toggle the dashboard maintenance page and customise the message users see.', icon: Wrench },
};

const CATEGORY_ORDER = ['amazon','shopify','flipkart','meta','google','razorpay','smtp','billing','reviews','referral','tracking','maintenance'];

export default function AdminSettingsPage() {
  const [data, setData] = useState<Record<string, any[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<string>('amazon');
  const [saving, setSaving] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const load = async () => {
    const r = await adminApi.settings();
    setData(r.data);
  };
  useEffect(() => { load(); }, []);

  const categories = useMemo(() => {
    const present = Object.keys(data);
    return CATEGORY_ORDER.filter((c) => present.includes(c));
  }, [data]);

  const update = (key: string, value: string) => setDrafts((p) => ({ ...p, [key]: value }));
  const toggleSecret = (key: string) => setShowSecret((p) => ({ ...p, [key]: !p[key] }));

  const saveOne = async (item: any) => {
    const value = drafts[item.key] ?? (item.isSecret ? '' : (item.value || ''));
    setSaving(true);
    try {
      await adminApi.updateSetting(item.key, value);
      setSavedKey(item.key);
      setTimeout(() => setSavedKey(null), 1500);
      await load();
      setDrafts((p) => { const n = { ...p }; delete n[item.key]; return n; });
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = async () => {
    const items = (data[activeTab] || [])
      .map((it: any) => ({ key: it.key, value: drafts[it.key] }))
      .filter((it) => it.value !== undefined);
    if (!items.length) return;
    setSaving(true);
    try {
      await adminApi.updateSettings(items);
      await load();
      setDrafts((p) => {
        const n = { ...p };
        for (const it of items) delete n[it.key];
        return n;
      });
    } finally { setSaving(false); }
  };

  const items = data[activeTab] || [];
  const meta = CATEGORY_META[activeTab] || { label: activeTab, description: '', icon: Package2 };
  const Icon = meta.icon;
  const hasDirty = items.some((it: any) => drafts[it.key] !== undefined);

  return (
    <div className="p-8">
      <div className="mb-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent">Platform Settings</h1>
        <p className="text-slate-500 mt-1">
          Configure integration credentials and runtime options. Values are encrypted at rest and cached for 60 seconds.
        </p>
      </div>

      {/* Tabs */}
      <div className="mt-6 mb-6">
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          items={categories.map((c): TabItem => {
            const CIcon = (CATEGORY_META[c]?.icon) || Package2;
            return {
              key: c,
              label: CATEGORY_META[c]?.label || c,
              icon: <CIcon size={14} />,
            };
          })}
        />
      </div>

      {/* Category header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center">
            <Icon size={18} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{meta.label}</h2>
            <p className="text-sm text-slate-500">{meta.description}</p>
          </div>
        </div>
        <Button
          variant="primary"
          leftIcon={<Save size={14} />}
          onClick={saveCategory}
          disabled={!hasDirty || saving}
          loading={saving && hasDirty}
        >
          Save all
        </Button>
      </div>

      {/* Fields */}
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {items.map((it: any) => {
          const draft = drafts[it.key];
          const isDirty = draft !== undefined;
          const displayValue = isDirty ? draft : (it.isSecret ? '' : (it.value || ''));
          const isSecret = it.isSecret;
          const show = !!showSecret[it.key];

          return (
            <div key={it.key} className="p-5 flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-sm font-bold text-slate-900">{it.label}</label>
                  {isSecret && <Lock size={12} className="text-slate-400" />}
                  {it.isSet && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">SET</span>
                  )}
                  {isDirty && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">UNSAVED</span>
                  )}
                  {savedKey === it.key && (
                    <span className="text-[10px] font-bold flex items-center gap-0.5 text-emerald-700">
                      <CheckCircle2 size={10} /> SAVED
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mb-2 font-mono">{it.key}</div>
                {it.description && <p className="text-xs text-slate-500 mb-2">{it.description}</p>}

                <div className="relative">
                  <input
                    type={isSecret && !show ? 'password' : 'text'}
                    value={displayValue}
                    placeholder={isSecret && it.isSet ? '•••••••• (leave blank to keep current)' : 'Not set'}
                    onChange={(e) => update(it.key, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-sm pr-10"
                  />
                  {isSecret && (
                    <button
                      type="button"
                      onClick={() => toggleSecret(it.key)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                    >
                      {show ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-6"
                onClick={() => saveOne(it)}
                disabled={!isDirty || saving}
              >
                Save
              </Button>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-400 mt-4">
        Secrets are AES-256-GCM encrypted with <code>ENCRYPTION_KEY</code>. Fallback: if a key isn't in the database, the backend reads the matching environment variable (uppercase, dots → underscores).
      </p>
    </div>
  );
}
