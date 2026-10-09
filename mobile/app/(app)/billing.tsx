import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react-native';
import { Alert, Pressable, Text, View } from 'react-native';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import PageShell from '../../components/ui/PageShell';
import { billingApi, paymentApi, planApi } from '../../lib/api';
import { subscribeToPlan } from '../../lib/razorpay';
import { formatCurrency } from '../../lib/utils';

export default function BillingScreen() {
  const qc = useQueryClient();

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: async () => (await billingApi.subscription()).data,
  });

  const { data: methods = [] } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => (await paymentApi.methods()).data,
  });

  const setDefaultMethod = useMutation({
    mutationFn: (id: string) => paymentApi.setDefaultMethod(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-methods'] }),
  });
  const removeMethod = useMutation({
    mutationFn: (id: string) => paymentApi.deleteMethod(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-methods'] }),
  });

  const autoRenewMutation = useMutation({
    mutationFn: (enabled: boolean) => billingApi.toggleAutoRenew(enabled),
    onSuccess: (_, enabled) => {
      qc.invalidateQueries({ queryKey: ['billing'] });
      Alert.alert('Saved', `Auto-renew ${enabled ? 'enabled' : 'disabled'}.`);
    },
    onError: (err: any) =>
      Alert.alert('Failed', err?.response?.data?.error || err.message),
  });

  // Available plans for the upgrade flow
  const { data: plansData } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => (await planApi.list()).data,
  });

  const onUpgrade = async (planCode: string, billingCycle: 'MONTHLY' | 'YEARLY' = 'MONTHLY') => {
    const result = await subscribeToPlan(planCode, billingCycle);
    if (result.ok) {
      qc.invalidateQueries({ queryKey: ['billing'] });
    }
  };

  const plan = data?.plan;

  return (
    <PageShell
      title="Billing"
      subtitle="Plan, payment methods and renewal"
      loading={isLoading}
      error={error}
      refreshing={isRefetching}
      onRefresh={refetch}
    >
      {/* Current plan */}
      {plan ? (
        <Card className="p-5 mb-4">
          <View className="flex-row items-center mb-3">
            <View className="w-10 h-10 rounded-2xl bg-emerald-50 items-center justify-center mr-3">
              <CreditCard size={18} color="#04AB94" />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-bold text-slate-400 uppercase tracking-wider">
                Current plan
              </Text>
              <Text className="text-xl font-extrabold text-slate-900 tracking-tight">
                {plan.name}
              </Text>
            </View>
            <Badge variant={data?.status === 'ACTIVE' ? 'emerald' : 'amber'} dot>
              {data?.status || 'ACTIVE'}
            </Badge>
          </View>
          {plan.tagline ? (
            <Text className="text-[13px] text-slate-500 font-medium">{plan.tagline}</Text>
          ) : null}
          {plan.monthlyPrice > 0 ? (
            <Text className="text-[13px] text-slate-600 font-bold mt-2">
              {formatCurrency(plan.monthlyPrice)} / month
            </Text>
          ) : null}

          {/* Auto-renew toggle — charges saved card at end of period */}
          {plan.monthlyPrice > 0 ? (
            <View className="flex-row items-center mt-3 p-3 rounded-2xl bg-slate-50">
              <View className="flex-1">
                <Text className="text-[13px] font-bold text-slate-900">Auto-renew</Text>
                <Text className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {data?.autoRenew
                    ? `Renews on ${new Date(data?.currentPeriodEnd).toLocaleDateString()} via saved card`
                    : `Manual renewal — pay before ${new Date(data?.currentPeriodEnd).toLocaleDateString()}`}
                </Text>
                {data?.lastRenewalError ? (
                  <Text className="text-[10px] text-amber-700 font-bold mt-1">
                    ⚠ Last renewal failed: {data.lastRenewalError}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => autoRenewMutation.mutate(!data?.autoRenew)}
                disabled={autoRenewMutation.isPending}
                className={`w-12 h-7 rounded-full justify-center ${data?.autoRenew ? 'bg-emerald-500' : 'bg-slate-300'}`}
                style={{ opacity: autoRenewMutation.isPending ? 0.6 : 1 }}
              >
                <View
                  className={`w-6 h-6 rounded-full bg-white shadow-sm ${data?.autoRenew ? 'self-end mr-0.5' : 'self-start ml-0.5'}`}
                  style={{ shadowColor: '#0f172a', shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 }}
                />
              </Pressable>
            </View>
          ) : null}

          {data?.autoRenew && Array.isArray(methods) && methods.filter((m: any) => m.isDefault).length === 0 ? (
            <View className="mt-2 p-3 rounded-2xl bg-amber-50 border border-amber-200">
              <Text className="text-[11px] text-amber-700 font-bold">
                ⚠ Auto-renew is on but no saved card. Save a card when you next purchase or switch a plan.
              </Text>
            </View>
          ) : null}

          {/* Change-plan list — opens Razorpay native modal on tap */}
          {Array.isArray(plansData) && plansData.length > 1 ? (
            <View className="mt-4 pt-4 border-t border-slate-100">
              <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Switch plan
              </Text>
              {plansData
                .filter((p: any) => p.code !== plan.code && p.isPublic !== false)
                .map((p: any) => (
                  <Pressable
                    key={p.code}
                    onPress={() => onUpgrade(p.code, 'MONTHLY')}
                    className="flex-row items-center py-2 border-b border-slate-50 last:border-b-0"
                  >
                    <View className="flex-1">
                      <Text className="text-[14px] font-bold text-slate-900">{p.name}</Text>
                      <Text className="text-[11px] text-slate-500 font-medium">
                        {p.tagline || p.description || ''}
                      </Text>
                    </View>
                    <Text className="text-[14px] font-extrabold text-emerald-700">
                      {formatCurrency(p.monthlyPrice)}/mo
                    </Text>
                  </Pressable>
                ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* Saved payment methods */}
      <Card className="p-5 mb-4">
        <View className="flex-row items-start mb-3">
          <View className="w-10 h-10 rounded-2xl bg-emerald-50 items-center justify-center mr-3">
            <CreditCard size={18} color="#04AB94" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-bold text-slate-900 tracking-tight">
              Payment methods
            </Text>
            <Text className="text-[13px] text-slate-500 font-medium mt-1">
              Used to auto-renew your subscription.
            </Text>
          </View>
        </View>

        {/* Saved methods */}
        <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 mt-2">
          Saved payment methods
        </Text>
        {Array.isArray(methods) && methods.length === 0 ? (
          <View className="bg-slate-50 rounded-2xl p-3">
            <Text className="text-[11px] text-slate-500 font-medium">
              No saved cards yet. Save a card when you next purchase or switch a plan.
            </Text>
          </View>
        ) : (
          (methods as any[]).map((m) => (
            <View key={m.id} className="flex-row items-center py-2 border-b border-slate-50 last:border-b-0">
              <View className="w-9 h-9 rounded-xl bg-slate-50 items-center justify-center mr-3">
                <Text className="text-[10px] font-bold text-slate-700">
                  {(m.brand || m.method || 'CARD').slice(0, 4).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-[13px] font-bold text-slate-900" numberOfLines={1}>
                  {m.label || `${m.brand || 'Card'} •••• ${m.last4 || ''}`}
                </Text>
                <Text className="text-[10px] text-slate-400 font-medium">
                  {m.expiryMonth ? `Expires ${String(m.expiryMonth).padStart(2,'0')}/${m.expiryYear}` : (m.upiVpa || 'Saved at checkout')}
                  {m.failureCount ? ` · last failed (${m.failureCount}x)` : ''}
                </Text>
              </View>
              {m.isDefault ? (
                <Text className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg mr-2">
                  DEFAULT
                </Text>
              ) : (
                <Pressable onPress={() => setDefaultMethod.mutate(m.id)} className="px-2 py-1 mr-1">
                  <Text className="text-[10px] font-bold text-emerald-700">Set default</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => Alert.alert('Remove card', 'Are you sure?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => removeMethod.mutate(m.id) },
                ])}
                className="px-2 py-1"
              >
                <Text className="text-[10px] font-bold text-rose-600">Remove</Text>
              </Pressable>
            </View>
          ))
        )}

      </Card>

    </PageShell>
  );
}
