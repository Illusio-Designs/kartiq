import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Bell,
  Clock,
  Package,
  Plus,
  Send,
  ShoppingCart,
  TrendingDown,
  Users,
  Landmark,
} from 'lucide-react-native';
import {
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { DashboardHeaderSkeleton, DashboardSkeleton } from '../../components/ui/Shimmer';
import { channelApi, dashboardApi, notificationApi } from '../../lib/api';
import { formatCurrency, formatShortDate } from '../../lib/utils';
import { useAuthStore } from '../../store/auth.store';

type MonthPoint = { month: string; earnings: number };

function RevenueChart({ data }: { data: MonthPoint[] }) {
  const width = Dimensions.get('window').width - 40 - 40;
  const height = 160;
  const pad = { top: 10, right: 8, bottom: 28, left: 8 };

  if (!data.length) {
    return (
      <View className="h-40 items-center justify-center">
        <Text className="text-slate-400 text-sm font-medium">No revenue data yet</Text>
      </View>
    );
  }

  const max = Math.max(...data.map((d) => d.earnings), 1);
  const min = 0;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: pad.left + i * stepX,
    y: pad.top + innerH - ((d.earnings - min) / (max - min || 1)) * innerH,
  }));

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
  const area = `${line} L ${points[points.length - 1].x} ${pad.top + innerH} L ${pad.left} ${
    pad.top + innerH
  } Z`;

  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#06D4B8" stopOpacity={0.25} />
            <Stop offset="100%" stopColor="#06D4B8" stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#grad)" />
        <Path d={line} stroke="#06D4B8" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
      <View className="flex-row justify-between px-1 mt-1">
        {data.map((d) => (
          <Text key={d.month} className="text-[10px] text-slate-400 font-bold">
            {d.month}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await dashboardApi.get()).data,
  });

  const { data: channelCatalog } = useQuery({
    queryKey: ['dashboard-channels'],
    queryFn: async () => (await channelApi.catalog()).data,
  });

  // Polled unread count drives the bell-icon badge. Same 60s cadence
  // the web frontend uses so the two stay in lockstep.
  const { data: unreadCountData } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async () => (await notificationApi.unreadCount()).data,
    refetchInterval: 60_000,
  });
  const unreadCount = unreadCountData?.count ?? 0;

  const s = data?.summary || {};
  const connectedChannels: any[] = (channelCatalog?.catalog || [])
    .filter((c: any) => c.status === 'connected')
    .slice(0, 4);

  const recentOrders: any[] = (data?.recentOrders || []).slice(0, 5);
  const chartData: MonthPoint[] = data?.revenueByMonth || [];

  const firstName = user?.name?.split(' ')[0] ?? '';

  // Compute real revenue growth from API data
  const currentRev = Number(s.monthRevenue) || 0;
  const lastRev = Number(s.lastMonthRevenue) || 0;
  const revenueGrowth = lastRev > 0 ? ((currentRev - lastRev) / lastRev) * 100 : 0;
  const revenueGrowthAbs = Math.abs(revenueGrowth).toFixed(1);
  const revenueUp = revenueGrowth >= 0;

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['top']}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={['#06D4B8']} tintColor="#06D4B8" />}
      >
        {/* ── Premium header ──────────────────────────────── */}
        <View
          className="bg-slate-900 px-6 pt-5 pb-8 rounded-b-[36px]"
          style={{
            shadowColor: '#0f172a',
            shadowOpacity: 0.2,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 10,
          }}
        >
          <View className="flex-row items-center justify-between mb-5">
            <View className="flex-row items-center flex-1">
              <View className="w-11 h-11 rounded-2xl bg-emerald-500 items-center justify-center mr-3"
                style={{
                  shadowColor: '#06D4B8',
                  shadowOpacity: 0.4,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 4,
                }}
              >
                <Text className="text-white font-extrabold text-lg">
                  {firstName?.charAt(0) || 'U'}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-slate-400 text-[13px] font-medium">Welcome back</Text>
                <Text className="text-white text-lg font-extrabold tracking-tight">
                  {firstName}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => router.push('/inbox' as any)}
              accessibilityLabel={
                unreadCount > 0 ? `Inbox — ${unreadCount} unread` : 'Inbox'
              }
              className="w-11 h-11 rounded-2xl bg-slate-800 items-center justify-center"
            >
              <Bell size={20} color="#94a3b8" />
              {unreadCount > 0 ? (
                <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 items-center justify-center border-2 border-slate-900">
                  <Text className="text-[10px] font-bold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {/* Revenue hero */}
          {isLoading ? <DashboardHeaderSkeleton /> : <View className="bg-slate-800/60 rounded-3xl p-5 border border-slate-700/50">
            <View className="flex-row items-center justify-between mb-1">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-xl bg-emerald-500/20 items-center justify-center mr-2.5">
                  <Landmark size={16} color="#2BD5B6" />
                </View>
                <Text className="text-slate-400 text-sm font-bold">Total Revenue</Text>
              </View>
              {lastRev > 0 ? (
                <Badge variant={revenueUp ? 'emerald' : 'rose'}>
                  {revenueUp ? <ArrowUp size={10} color="#077F70" /> : <ArrowDown size={10} color="#be123c" />}
                  {' '}{revenueGrowthAbs}%
                </Badge>
              ) : null}
            </View>
            <Text className="text-4xl font-extrabold text-white tracking-tight mt-2">
              {formatCurrency(currentRev)}
            </Text>
            <Text className="text-slate-500 text-[13px] font-medium mt-1">
              {lastRev > 0
                ? `vs ${formatCurrency(lastRev)} last month`
                : 'This month'}
            </Text>

            <View className="flex-row mt-5 gap-3">
              <View className="flex-1">
                <Button size="sm" leftIcon={<Send size={14} color="#fff" />} onPress={() => {
                  qc.invalidateQueries({ queryKey: ['dashboard'] });
                  qc.invalidateQueries({ queryKey: ['dashboard-channels'] });
                  refetch();
                }}>
                  Sync Now
                </Button>
              </View>
              <View className="flex-1">
                <Button variant="ghost" size="sm" className="border-slate-600 bg-slate-800" onPress={() => router.push('/reports')}>
                  <Text className="text-white text-xs font-bold">Reports</Text>
                </Button>
              </View>
            </View>
          </View>}
        </View>

        {isLoading ? (
          <DashboardSkeleton />
        ) : (
        <View className="px-5 pt-6">
          {/* ── Quick stats (2-up grid) ───────────────────── */}
          <View className="flex-row gap-4 mb-5">
            <View className="flex-1">
              <Card className="p-5">
                <View className="w-10 h-10 rounded-2xl bg-rose-50 items-center justify-center mb-3"
                  style={{
                    shadowColor: '#e11d48',
                    shadowOpacity: 0.1,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 2,
                  }}
                >
                  <TrendingDown size={18} color="#e11d48" />
                </View>
                <Text className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  {s.lowStockCount || 0}
                </Text>
                <Text className="text-[13px] text-slate-500 font-medium mt-0.5">Low Stock</Text>
                <Text className="text-[11px] text-slate-400 font-medium mt-2">SKUs below threshold</Text>
              </Card>
            </View>
            <View className="flex-1">
              <Card className="p-5">
                <View className="w-10 h-10 rounded-2xl bg-emerald-50 items-center justify-center mb-3"
                  style={{
                    shadowColor: '#06D4B8',
                    shadowOpacity: 0.1,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 2,
                  }}
                >
                  <ShoppingCart size={18} color="#04AB94" />
                </View>
                <Text className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  {(s.totalOrders || 0).toLocaleString()}
                </Text>
                <Text className="text-[13px] text-slate-500 font-medium mt-0.5">Total Orders</Text>
                <Text className="text-[11px] text-slate-400 font-medium mt-2">{s.todayOrders || 0} today</Text>
              </Card>
            </View>
          </View>

          {/* ── Revenue chart ─────────────────────────────── */}
          <Card className="p-5 mb-5">
            <View className="flex-row items-center justify-between mb-5">
              <View>
                <Text className="text-lg font-extrabold text-slate-900 tracking-tight">Overview</Text>
                <Text className="text-[13px] text-slate-400 font-medium mt-0.5">Revenue trend</Text>
              </View>
              <Badge variant="emerald" dot>
                Earnings
              </Badge>
            </View>
            <RevenueChart data={chartData} />
          </Card>

          {/* ── My Channels ─────────────────────────────────── */}
          <Card className="p-5 mb-5">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-extrabold text-slate-900 tracking-tight">My Channels</Text>
              <Pressable className="flex-row items-center bg-emerald-50 px-3 py-1.5 rounded-xl active:bg-emerald-100" onPress={() => router.push('/channels')}>
                <Plus size={14} color="#04AB94" />
                <Text className="text-xs font-bold text-emerald-700 ml-1">Add</Text>
              </Pressable>
            </View>
            {connectedChannels.length > 0 ? (
              connectedChannels.map((c, idx) => (
                <View
                  key={c.type}
                  className={`flex-row items-center justify-between py-3.5 ${
                    idx > 0 ? 'border-t border-slate-100' : ''
                  }`}
                >
                  <View className="flex-row items-center flex-1">
                    <View
                      className="w-11 h-11 rounded-2xl bg-slate-900 items-center justify-center mr-3.5"
                      style={{
                        shadowColor: '#0f172a',
                        shadowOpacity: 0.1,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 2,
                      }}
                    >
                      <Text className="text-white font-extrabold text-xs">
                        {String(c.name || '').slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-[15px] font-bold text-slate-900 tracking-tight" numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text className="text-[13px] text-slate-500 font-medium">
                        {c.connectedChannels?.length || 0} active
                      </Text>
                    </View>
                  </View>
                  <Badge variant="emerald" dot>
                    Active
                  </Badge>
                </View>
              ))
            ) : (
              <Pressable
                onPress={() => router.push('/channels')}
                className="py-6 items-center rounded-2xl bg-slate-50 border border-dashed border-slate-200 active:bg-slate-100"
              >
                <Text className="text-[14px] font-bold text-slate-700">No channels connected yet</Text>
                <Text className="text-[12px] text-slate-400 mt-1 font-medium">
                  Tap to connect Amazon, Flipkart, Shopify & more
                </Text>
              </Pressable>
            )}
          </Card>

          {/* ── Quick Metrics ───────────────────────────── */}
          <Card className="p-5 mb-5">
            <Text className="text-lg font-extrabold text-slate-900 tracking-tight mb-4">
              At a Glance
            </Text>
            {[
              { label: 'Pending Orders', value: s.pendingOrders || 0, icon: <Clock size={16} color="#f59e0b" />, color: '#f59e0b' },
              { label: 'Processing', value: s.processingOrders || 0, icon: <Package size={16} color="#0ea5e9" />, color: '#0ea5e9' },
              { label: 'Products Listed', value: s.totalProducts || 0, icon: <Package size={16} color="#8b5cf6" />, color: '#8b5cf6' },
              { label: 'Customers', value: s.totalCustomers || 0, icon: <Users size={16} color="#06D4B8" />, color: '#06D4B8' },
            ].map((item, idx) => (
              <View
                key={item.label}
                className={`flex-row items-center py-3.5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
              >
                <View
                  className="w-10 h-10 rounded-2xl items-center justify-center mr-3"
                  style={{ backgroundColor: item.color + '15' }}
                >
                  {item.icon}
                </View>
                <Text className="flex-1 text-[15px] font-bold text-slate-900 tracking-tight">
                  {item.label}
                </Text>
                <Text className="text-[17px] font-extrabold text-slate-900 tracking-tight">
                  {item.value.toLocaleString()}
                </Text>
              </View>
            ))}
          </Card>

          {/* ── Recent Transactions ─────────────────────────── */}
          <Card className="overflow-hidden mb-2">
            <View className="flex-row items-center justify-between p-5 pb-2">
              <Text className="text-lg font-extrabold text-slate-900 tracking-tight">Recent Orders</Text>
              <Pressable className="flex-row items-center active:opacity-70" onPress={() => router.push('/orders')}>
                <Text className="text-[13px] font-bold text-emerald-600 mr-1">View All</Text>
                <ArrowUpRight size={14} color="#04AB94" />
              </Pressable>
            </View>
            <View>
              {recentOrders.length > 0 ? (
                recentOrders.map((o, idx) => (
                  <View
                    key={o.id}
                    className={`px-5 py-4 flex-row items-center ${
                      idx > 0 ? 'border-t border-slate-100/80' : ''
                    }`}
                  >
                    <View
                      className="w-11 h-11 rounded-2xl bg-emerald-50 items-center justify-center mr-3.5"
                      style={{
                        shadowColor: '#06D4B8',
                        shadowOpacity: 0.08,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 1,
                      }}
                    >
                      <Package size={16} color="#04AB94" />
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-slate-900 text-[15px] tracking-tight" numberOfLines={1}>
                        {o.orderNumber}
                      </Text>
                      <Text className="text-[13px] text-slate-500 font-medium" numberOfLines={1}>
                        {o.customer?.name ?? '\u2014'}
                      </Text>
                      <Text className="text-[11px] text-slate-400 mt-0.5 font-medium">
                        {o.createdAt ? formatShortDate(o.createdAt) : ''}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-[15px] font-extrabold text-slate-900 tracking-tight">
                        {formatCurrency(o.total || 0)}
                      </Text>
                      <View className="mt-1.5">
                        <Badge variant="emerald" dot>
                          Success
                        </Badge>
                      </View>
                    </View>
                  </View>
                ))
              ) : (
                <View className="py-12 items-center">
                  <Text className="text-sm text-slate-400 font-medium">No recent orders yet</Text>
                </View>
              )}
            </View>
          </Card>
        </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
