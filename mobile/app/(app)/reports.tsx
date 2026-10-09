import { useQuery } from '@tanstack/react-query';
import { BarChart3, Package, TrendingUp, Landmark } from 'lucide-react-native';
import { Text, View } from 'react-native';
import Card from '../../components/ui/Card';
import PageShell from '../../components/ui/PageShell';
import { MetricCardSkeleton, ListSkeleton } from '../../components/ui/Shimmer';
import { reportApi } from '../../lib/api';
import { formatCurrency } from '../../lib/utils';

type Metric = { label: string; value: string; icon: React.ReactNode; color: string; bg: string };

export default function ReportsScreen() {
  const sales = useQuery({
    queryKey: ['reports', 'sales'],
    queryFn: async () => (await reportApi.sales()).data,
  });

  const valuation = useQuery({
    queryKey: ['reports', 'valuation'],
    queryFn: async () => (await reportApi.inventoryValuation()).data,
  });

  const topProducts = useQuery({
    queryKey: ['reports', 'top'],
    queryFn: async () => (await reportApi.topProducts()).data,
  });

  const metrics: Metric[] = [
    {
      label: 'Total sales',
      value: sales.data?.total != null ? formatCurrency(sales.data.total) : '\u2014',
      icon: <Landmark size={18} color="#04AB94" />,
      color: '#06D4B8',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Orders',
      value: sales.data?.count?.toString() ?? '\u2014',
      icon: <TrendingUp size={18} color="#04AB94" />,
      color: '#06D4B8',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Inventory value',
      value: valuation.data?.total != null ? formatCurrency(valuation.data.total) : '\u2014',
      icon: <Package size={18} color="#0ea5e9" />,
      color: '#0ea5e9',
      bg: 'bg-sky-50',
    },
    {
      label: 'Top SKUs',
      value: (topProducts.data?.items?.length ?? topProducts.data?.length ?? 0).toString(),
      icon: <BarChart3 size={18} color="#8b5cf6" />,
      color: '#8b5cf6',
      bg: 'bg-violet-50',
    },
  ];

  const top: any[] =
    topProducts.data?.items ?? (Array.isArray(topProducts.data) ? topProducts.data : []);

  const refreshAll = () => {
    sales.refetch();
    valuation.refetch();
    topProducts.refetch();
  };

  return (
    <PageShell
      title="Reports"
      subtitle="Sales and inventory analytics"
      loading={sales.isLoading || valuation.isLoading || topProducts.isLoading}
      skeleton={
        <View>
          <View className="flex-row flex-wrap gap-4 mb-5">
            <View className="w-[47%]"><MetricCardSkeleton /></View>
            <View className="w-[47%]"><MetricCardSkeleton /></View>
            <View className="w-[47%]"><MetricCardSkeleton /></View>
            <View className="w-[47%]"><MetricCardSkeleton /></View>
          </View>
          <ListSkeleton rows={5} />
        </View>
      }
      error={sales.error || valuation.error || topProducts.error}
      refreshing={sales.isRefetching || valuation.isRefetching || topProducts.isRefetching}
      onRefresh={refreshAll}
    >
      <View className="flex-row flex-wrap gap-4 mb-5">
        {metrics.map((m) => (
          <View key={m.label} className="w-[47%]">
            <Card className="p-5">
              <View
                className={`w-10 h-10 rounded-2xl ${m.bg} items-center justify-center mb-3`}
                style={{
                  shadowColor: m.color,
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 1,
                }}
              >
                {m.icon}
              </View>
              <Text className="text-2xl font-extrabold text-slate-900 tracking-tight" numberOfLines={1}>
                {m.value}
              </Text>
              <Text className="text-[13px] text-slate-500 font-medium mt-1" numberOfLines={1}>
                {m.label}
              </Text>
            </Card>
          </View>
        ))}
      </View>

      <Card className="p-5">
        <Text className="text-lg font-extrabold text-slate-900 tracking-tight mb-4">
          Top Products
        </Text>
        {top.length > 0 ? (
          top.slice(0, 5).map((p, idx) => (
            <View
              key={p.id ?? idx}
              className={`flex-row items-center py-4 ${
                idx > 0 ? 'border-t border-slate-100' : ''
              }`}
            >
              <View
                className="w-10 h-10 rounded-2xl bg-slate-900 items-center justify-center mr-3.5"
              >
                <Text className="text-sm font-extrabold text-white">{idx + 1}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-slate-900 tracking-tight" numberOfLines={1}>
                  {p.name ?? p.productName ?? `Product ${idx + 1}`}
                </Text>
                <Text className="text-[13px] text-slate-500 font-medium">
                  {p.qty ?? p.quantity ?? 0} sold
                </Text>
              </View>
              <Text className="text-[15px] font-extrabold text-slate-900 tracking-tight">
                {p.revenue != null ? formatCurrency(p.revenue) : ''}
              </Text>
            </View>
          ))
        ) : (
          <Text className="text-sm text-slate-400 text-center py-8 font-medium">No data yet</Text>
        )}
      </Card>
    </PageShell>
  );
}
