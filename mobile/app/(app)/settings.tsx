import { Building2, CreditCard, Shield, User, Fingerprint, ScanFace } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import PageShell from '../../components/ui/PageShell';
import { useAuthStore } from '../../store/auth.store';
import { authApi } from '../../lib/api';
import {
  isAvailable as biometricAvailable,
  isEnabled as biometricIsEnabled,
  setEnabled as biometricSetEnabled,
  authenticate as biometricAuthenticate,
  getBiometricKind,
  biometricLabel,
  type BiometricKind,
} from '../../lib/biometric';

type Row = { label: string; value: string };
type Section = { title: string; icon: React.ReactNode; iconBg: string; rows: Row[] };

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const tenant = useAuthStore((s) => s.tenant);
  const plan = useAuthStore((s) => s.plan);
  const subscription = useAuthStore((s) => s.subscription);
  const setContext = useAuthStore((s) => s.setContext);

  // Pull the freshest user/tenant on mount so cached values from login don't override post-save updates.
  useEffect(() => {
    authApi
      .me()
      .then(({ data }: any) => {
        const { tenant: t, plan: p, subscription: sub, permissions, ...userFields } = data;
        setContext({
          user: userFields,
          tenant: t ?? null,
          plan: p ?? null,
          subscription: sub ?? null,
          permissions: permissions ?? [],
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sections: Section[] = [
    {
      title: 'Account',
      icon: <User size={18} color="#04AB94" />,
      iconBg: 'bg-emerald-50',
      rows: [
        { label: 'Name', value: user?.name ?? '\u2014' },
        { label: 'Email', value: user?.email ?? '\u2014' },
        { label: 'Phone', value: user?.phone ?? '\u2014' },
        { label: 'Role', value: user?.role ?? '\u2014' },
      ],
    },
    {
      title: 'Workspace',
      icon: <Building2 size={18} color="#0ea5e9" />,
      iconBg: 'bg-sky-50',
      rows: [
        { label: 'Tenant', value: tenant?.businessName ?? '\u2014' },
        { label: 'Slug', value: tenant?.slug ?? '\u2014' },
        { label: 'GSTIN', value: tenant?.gstin ?? '\u2014' },
        { label: 'Status', value: tenant?.status ?? '\u2014' },
      ],
    },
    {
      title: 'Subscription',
      icon: <CreditCard size={18} color="#8b5cf6" />,
      iconBg: 'bg-violet-50',
      rows: [
        { label: 'Plan', value: plan?.name ?? '\u2014' },
        { label: 'Status', value: subscription?.status ?? '\u2014' },
      ],
    },
    {
      title: 'Security',
      icon: <Shield size={18} color="#f59e0b" />,
      iconBg: 'bg-amber-50',
      rows: [
        { label: 'Platform admin', value: user?.isPlatformAdmin ? 'Yes' : 'No' },
      ],
    },
  ];

  return (
    <PageShell title="Settings" subtitle="Account and workspace">
      {sections.map((sec) => (
        <Card key={sec.title} className="p-5 mb-4">
          <View className="flex-row items-center mb-4">
            <View
              className={`w-10 h-10 rounded-2xl ${sec.iconBg} items-center justify-center mr-3`}
            >
              {sec.icon}
            </View>
            <Text className="text-lg font-extrabold text-slate-900 tracking-tight">
              {sec.title}
            </Text>
          </View>
          {sec.rows.map((r, idx) => (
            <View
              key={r.label}
              className={`flex-row justify-between items-center py-3.5 ${
                idx > 0 ? 'border-t border-slate-100' : ''
              }`}
            >
              <Text className="text-[14px] text-slate-500 font-medium">{r.label}</Text>
              {r.value === 'active' || r.value === 'Yes' ? (
                <Badge variant="emerald">{r.value}</Badge>
              ) : r.value === 'Off' || r.value === 'No' ? (
                <Badge variant="slate">{r.value}</Badge>
              ) : (
                <Text className="text-[14px] font-bold text-slate-900" numberOfLines={1}>
                  {r.value}
                </Text>
              )}
            </View>
          ))}
        </Card>
      ))}

      <BiometricSettingsCard />
    </PageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Biometric unlock toggle. Hidden entirely on devices without hardware /
// enrolled biometrics so we don't tease a feature the user can't use.
// Enabling re-prompts the OS for a current biometric proof so a stranger
// holding an unlocked phone can't quietly turn it on.
function BiometricSettingsCard() {
  const [supported, setSupported] = useState(false);
  const [kind, setKind] = useState<BiometricKind>('biometric');
  const [enabled, setEnabledState] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ok = await biometricAvailable();
      setSupported(ok);
      if (ok) {
        setKind(await getBiometricKind());
        setEnabledState(await biometricIsEnabled());
      }
    })();
  }, []);

  if (!supported) return null;
  const label = biometricLabel(kind);
  const Icon = kind === 'face' ? ScanFace : Fingerprint;

  const toggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      // Always require a successful biometric proof before flipping the
      // switch — works for both enable and disable so a thief can't bypass
      // the lock from inside the app.
      const ok = await biometricAuthenticate(
        next ? `Enable ${label} unlock` : `Disable ${label} unlock`
      );
      if (!ok) {
        Alert.alert('Cancelled', 'No changes made.');
        return;
      }
      await biometricSetEnabled(next);
      setEnabledState(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5 mb-4">
      <View className="flex-row items-center mb-4">
        <View className="w-10 h-10 rounded-2xl bg-emerald-50 items-center justify-center mr-3">
          <Icon size={18} color="#04AB94" />
        </View>
        <Text className="text-lg font-extrabold text-slate-900 tracking-tight">
          Biometric unlock
        </Text>
      </View>
      <View className="flex-row items-center justify-between py-2">
        <View className="flex-1 pr-4">
          <Text className="text-[14px] font-bold text-slate-900">
            Use {label} to unlock the app
          </Text>
          <Text className="text-[12px] text-slate-500 mt-1 leading-snug">
            Re-authenticate every time the app cold-starts. Your password
            stays as the fallback.
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={toggle}
          disabled={busy}
          trackColor={{ false: '#cbd5e1', true: '#06D4B8' }}
          thumbColor="#ffffff"
          ios_backgroundColor="#cbd5e1"
        />
      </View>
    </Card>
  );
}
