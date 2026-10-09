import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Lock, Plug, Plus, ShoppingBag, Zap, Truck, Globe, MessageCircle, Building2,
  Sparkles, Calculator, ScanLine, CreditCard, Receipt, Users, Undo2, Warehouse,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import Badge from '../../components/ui/Badge';
import BottomSheet from '../../components/ui/BottomSheet';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import ChannelLogo from '../../components/ChannelLogo';
import EmptyState from '../../components/ui/EmptyState';
import FormInput from '../../components/ui/FormInput';
import PageShell from '../../components/ui/PageShell';
import SelectField from '../../components/ui/SelectField';
import { ShimmerBox } from '../../components/ui/Shimmer';
import { channelApi } from '../../lib/api';
import { providerFor, startOAuth } from '../../lib/oauth';

// Category metadata mirrors frontend/app/channels/page.tsx
const CATEGORY_META: Record<string, { label: string; tagline: string; Icon: any }> = {
  ECOM:        { label: 'Marketplaces',    tagline: 'Amazon, Flipkart, Myntra & more',          Icon: ShoppingBag },
  QUICKCOM:    { label: 'Quick Commerce',  tagline: 'Blinkit, Zepto, Swiggy Instamart',         Icon: Zap },
  LOGISTICS:   { label: 'Shipping',        tagline: 'Couriers & shipping aggregators',          Icon: Truck },
  OWNSTORE:    { label: 'Own Store',       tagline: 'Shopify, WooCommerce, Magento',            Icon: Globe },
  SOCIAL:      { label: 'Social',          tagline: 'Instagram, Facebook, WhatsApp, TikTok',    Icon: MessageCircle },
  B2B:         { label: 'B2B',             tagline: 'Wholesale, distributors, bulk',            Icon: Building2 },
  ACCOUNTING:  { label: 'Accounting',      tagline: 'Tally, Zoho Books, QuickBooks, SAP',       Icon: Calculator },
  POS_SYSTEM:  { label: 'POS',             tagline: 'Shopify POS, Square, Lightspeed',          Icon: ScanLine },
  PAYMENT:     { label: 'Payments',        tagline: 'Razorpay, Stripe, PayU, Cashfree',         Icon: CreditCard },
  TAX:         { label: 'Tax & GST',       tagline: 'ClearTax, GSTZen, IRP, Avalara',           Icon: Receipt },
  CRM:         { label: 'CRM',             tagline: 'HubSpot, Zoho CRM, Klaviyo, Mailchimp',    Icon: Users },
  RETURNS:     { label: 'Returns',         tagline: 'Return Prime, WeReturn, EasyVMS',          Icon: Undo2 },
  FULFILLMENT: { label: 'Fulfillment',     tagline: 'Amazon FBA, WareIQ, LogiNext',             Icon: Warehouse },
  CUSTOM:      { label: 'Custom',          tagline: 'Webhooks & universal receivers',           Icon: Sparkles },
};
const CATEGORY_ORDER = [
  'ECOM', 'QUICKCOM', 'LOGISTICS', 'OWNSTORE', 'SOCIAL', 'B2B',
  'ACCOUNTING', 'POS_SYSTEM', 'PAYMENT', 'TAX', 'CRM', 'RETURNS', 'FULFILLMENT',
  'CUSTOM',
];

export default function ChannelsScreen() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [chName, setChName] = useState('');
  const [chType, setChType] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => (await channelApi.list()).data,
  });

  const { data: catalogData } = useQuery({
    queryKey: ['channel-catalog'],
    queryFn: async () => (await channelApi.catalog()).data,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => channelApi.create(body),
    onSuccess: async (resp) => {
      qc.invalidateQueries({ queryKey: ['channels'] });
      qc.invalidateQueries({ queryKey: ['channel-catalog'] });
      qc.invalidateQueries({ queryKey: ['dashboard-channels'] });
      setShowCreate(false);
      setChName(''); setChType('');

      // If the channel uses an OAuth flow, immediately open the provider auth
      // sheet so the user can finish onboarding without a second tap.
      const created = resp.data;
      const provider = created?.type ? providerFor(created.type) : null;
      if (created?.id && provider) {
        const { ok, reason } = await startOAuth(provider, { channelId: created.id });
        if (ok) {
          qc.invalidateQueries({ queryKey: ['channels'] });
          Alert.alert('Connected', `${created.name} authorized.`);
          return;
        }
        Alert.alert(
          'Channel created',
          reason || 'Authorize from the channel card when you are ready.'
        );
        return;
      }
      Alert.alert('Channel created', 'Open the channel to set credentials.');
    },
    onError: (err: any) => {
      if (err?.response?.status === 402) {
        const { requiredPlan, currentPlan } = err.response.data || {};
        if (requiredPlan) {
          Alert.alert('Upgrade needed', `This channel requires the ${requiredPlan} plan. You're on ${currentPlan}. Upgrade to unlock.`);
        } else {
          Alert.alert('Upgrade needed', err.response.data?.error || 'Please upgrade your plan.');
        }
      } else {
        Alert.alert('Error', err?.response?.data?.error || 'Failed to connect channel');
      }
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => channelApi.syncOrders(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      Alert.alert('Success', 'Orders synced');
    },
    onError: (err: any) => Alert.alert('Error', err?.response?.data?.error || 'Sync failed'),
  });

  const catalog: any[] = catalogData?.catalog ?? [];
  const currentPlan: string = catalogData?.summary?.currentPlan ?? 'STANDARD';

  // Group catalog by category for the chip-row counters
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const e of catalog) {
      if (!map[e.category]) map[e.category] = [];
      map[e.category].push(e);
    }
    return map;
  }, [catalog]);

  const filteredCatalog = useMemo(
    () => activeCategory === 'ALL' ? catalog : catalog.filter((c) => c.category === activeCategory),
    [catalog, activeCategory],
  );

  const channelOptions = filteredCatalog.map((c) => {
    let suffix = '';
    if (c.status === 'connected') suffix = ' · connected';
    else if (c.status === 'plan_locked') suffix = ` · ${c.requiredPlan} plan`;
    else if (c.status === 'not_available') suffix = ' · coming soon';
    return { label: `${c.name}${suffix}`, value: c.type };
  });

  const selectedEntry = catalog.find((c) => c.type === chType);

  const onTypeChange = (value: string) => {
    const entry = catalog.find((c) => c.type === value);
    if (entry?.status === 'plan_locked') {
      Alert.alert('Upgrade needed', `${entry.name} requires the ${entry.requiredPlan} plan. You're currently on ${currentPlan}.`);
      return;
    }
    if (entry?.status === 'not_available') {
      Alert.alert('Coming soon', `${entry.name} integration isn't ready yet.`);
      return;
    }
    setChType(value);
    if (entry && !chName.trim()) setChName(entry.name);
  };

  const onSubmit = () => {
    if (!chName.trim()) { Alert.alert('Required', 'Channel name is required'); return; }
    if (!chType) { Alert.alert('Required', 'Select a channel type'); return; }
    createMutation.mutate({ name: chName.trim(), type: chType, category: selectedEntry?.category });
  };

  const items: any[] = data?.items ?? data ?? [];
  const visibleCategories = CATEGORY_ORDER.filter((c) => grouped[c]?.length);

  return (
    <PageShell
      title="Channels"
      subtitle={`${items.length} connected · ${catalog.length} available`}
      action={
        <Button size="sm" leftIcon={<Plus size={14} color="#fff" />} onPress={() => setShowCreate(true)}>
          Connect
        </Button>
      }
      loading={isLoading}
      skeleton={
        <View>
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5 mb-4">
              <View className="flex-row items-center">
                <ShimmerBox width={48} height={48} borderRadius={16} />
                <View className="flex-1 ml-4">
                  <ShimmerBox width="65%" height={16} borderRadius={8} />
                  <ShimmerBox width="40%" height={12} borderRadius={6} style={{ marginTop: 8 }} />
                </View>
                <ShimmerBox width={70} height={24} borderRadius={12} />
              </View>
            </Card>
          ))}
        </View>
      }
      error={error}
      refreshing={isRefetching}
      onRefresh={refetch}
    >
      {items.length > 0 ? (
        items.map((c) => (
          <Card key={c.id} className="p-5 mb-4">
            <View className="flex-row items-center mb-3">
              <View className="mr-4">
                <ChannelLogo type={c.type} name={c.name} size={48} />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-slate-900 tracking-tight" numberOfLines={1}>
                  {c.name}
                </Text>
                <Text className="text-[13px] text-slate-500 font-medium mt-0.5">
                  {c.type}{c.category ? ` · ${CATEGORY_META[c.category]?.label || c.category}` : ''}
                </Text>
              </View>
              <Badge variant={c.isActive === false ? 'slate' : 'emerald'} dot>
                {c.isActive === false ? 'disabled' : 'active'}
              </Badge>
            </View>

            {/* OAuth re-authorize, when this channel has an OAuth provider */}
            {providerFor(c.type) ? (
              <View className="mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={async () => {
                    const provider = providerFor(c.type)!;
                    const { ok, reason } = await startOAuth(provider, { channelId: c.id });
                    if (ok) {
                      qc.invalidateQueries({ queryKey: ['channels'] });
                      Alert.alert('Connected', `${c.name} authorized successfully.`);
                    } else if (reason) {
                      Alert.alert('OAuth incomplete', reason);
                    }
                  }}
                >
                  Authorize via OAuth
                </Button>
              </View>
            ) : null}

            {c.lastSyncAt || c.lastSyncError ? (
              <View className="bg-slate-50 rounded-xl p-3 mb-3">
                {c.lastSyncAt ? (
                  <Text className="text-[12px] text-slate-500 font-medium">
                    Last sync: {new Date(c.lastSyncAt).toLocaleString()}
                  </Text>
                ) : (
                  <Text className="text-[12px] text-slate-400 font-medium">Never synced yet</Text>
                )}
                {c.lastSyncError ? (
                  <Text className="text-[12px] text-rose-600 font-bold mt-1" numberOfLines={2}>
                    Error: {c.lastSyncError}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View className="flex-row gap-2 mb-2">
              <View className="flex-1">
                <Button variant="ghost" size="sm" onPress={() => syncMutation.mutate(c.id)} loading={syncMutation.isPending}>
                  Sync Orders
                </Button>
              </View>
              <View className="flex-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => channelApi.syncInventory(c.id).then(() => Alert.alert('Done', 'Inventory synced')).catch(() => Alert.alert('Error', 'Sync failed'))}
                >
                  Sync Inventory
                </Button>
              </View>
            </View>
            <Button
              variant="ghost"
              size="sm"
              onPress={async () => {
                try {
                  const { data } = await channelApi.get(c.id);
                  Alert.alert('Webhook URL', `Paste this in your ${c.type} seller/developer portal:\n\n${data.webhookUrl}`);
                } catch (err: any) {
                  Alert.alert('Error', err?.response?.data?.error || 'Failed to fetch');
                }
              }}
            >
              Webhook URL
            </Button>
          </Card>
        ))
      ) : (
        <Card className="overflow-hidden">
          <EmptyState
            icon={<Plug size={28} color="#94a3b8" />}
            title="No channels connected"
            description="Tap Connect to integrate Amazon, Flipkart, Razorpay, Tally and 165+ more."
          />
        </Card>
      )}

      <BottomSheet visible={showCreate} onClose={() => setShowCreate(false)} title="Connect Channel">
        {/* Plan indicator */}
        <View className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4">
          <View className="flex-row items-center mb-2">
            <View className="w-8 h-8 rounded-xl bg-emerald-50 items-center justify-center mr-3">
              <Lock size={14} color="#04AB94" />
            </View>
            <View className="flex-1">
              <Text className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Your plan</Text>
              <Text className="text-[14px] font-extrabold text-slate-900">{currentPlan}</Text>
            </View>
          </View>
        </View>

        {/* Category chip row — horizontal scroll */}
        <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
          Browse by category
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 -mx-4 px-4">
          <View className="flex-row gap-2">
            <CategoryChip
              active={activeCategory === 'ALL'}
              onPress={() => setActiveCategory('ALL')}
              label="All"
              count={catalog.length}
            />
            {visibleCategories.map((cat) => {
              const meta = CATEGORY_META[cat];
              const Icon = meta?.Icon || Sparkles;
              return (
                <CategoryChip
                  key={cat}
                  active={activeCategory === cat}
                  onPress={() => setActiveCategory(cat)}
                  label={meta?.label || cat}
                  icon={<Icon size={12} color={activeCategory === cat ? '#04AB94' : '#64748b'} />}
                  count={grouped[cat].length}
                />
              );
            })}
          </View>
        </ScrollView>

        {activeCategory !== 'ALL' && CATEGORY_META[activeCategory] ? (
          <View className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 mb-4">
            <Text className="text-[12px] font-bold text-emerald-800">
              {CATEGORY_META[activeCategory].label}
            </Text>
            <Text className="text-[11px] text-emerald-700 font-medium mt-0.5">
              {CATEGORY_META[activeCategory].tagline}
            </Text>
          </View>
        ) : null}

        <SelectField
          label="Channel Type"
          value={chType}
          onChange={onTypeChange}
          placeholder={channelOptions.length ? `Select from ${channelOptions.length} channels` : 'Loading...'}
          options={channelOptions}
        />
        <FormInput label="Channel Name" value={chName} onChangeText={setChName} placeholder="e.g. My Amazon Store" />

        {selectedEntry ? (
          selectedEntry.manualOnly ? (
            <View className="bg-sky-50 border border-sky-200 rounded-2xl p-4 mb-4">
              <Text className="text-[12px] font-bold text-sky-800">Manual channel — no API connection</Text>
              <Text className="text-[11px] text-sky-700 font-medium mt-1">
                Connect once; then enter orders against it via the New Order form.
              </Text>
            </View>
          ) : (
            <View className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-4">
              <Text className="text-[12px] font-bold text-emerald-700">
                {selectedEntry.tagline || 'Channel integration'}
              </Text>
              {selectedEntry.features?.length ? (
                <Text className="text-[11px] text-emerald-600 font-medium mt-1">
                  Features: {selectedEntry.features.join(', ')}
                </Text>
              ) : null}
            </View>
          )
        ) : null}

        <Button
          onPress={onSubmit}
          loading={createMutation.isPending}
          disabled={!chType || selectedEntry?.status === 'plan_locked' || selectedEntry?.status === 'not_available'}
          className="mt-2"
        >
          Connect Channel
        </Button>
      </BottomSheet>
    </PageShell>
  );
}

function CategoryChip({
  active, onPress, label, icon, count,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center px-3 py-2 rounded-full border ${active ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}
    >
      {icon ? <View className="mr-1.5">{icon}</View> : null}
      <Text className={`text-[12px] font-bold ${active ? 'text-emerald-700' : 'text-slate-700'}`}>
        {label}
      </Text>
      {count !== undefined ? (
        <View className={`ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full items-center justify-center ${active ? 'bg-emerald-100' : 'bg-slate-100'}`}>
          <Text className={`text-[10px] font-bold ${active ? 'text-emerald-700' : 'text-slate-500'}`}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
