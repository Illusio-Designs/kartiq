/**
 * Tenant-visible audit log on mobile.
 *
 * Mirrors the web /audit page — same /billing/audit endpoint, gated by
 * the `settings.read` permission server-side. Lists every authenticated
 * mutation inside the caller's tenant: who did it, when, what resource.
 *
 * Filterable by `action` (orders.create, channels.connect, etc.) via a
 * horizontal chip strip; tapping a row reveals the full metadata in an
 * inline expanded panel.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Activity, ChevronDown } from 'lucide-react-native';
import EmptyState from '../../components/ui/EmptyState';
import PageShell from '../../components/ui/PageShell';
import { billingApi, type AuditRow } from '../../lib/api';

const VERB_TINT: Record<string, string> = {
  create:   'bg-emerald-100 text-emerald-700',
  update:   'bg-blue-100 text-blue-700',
  delete:   'bg-rose-100 text-rose-700',
  suspend:  'bg-amber-100 text-amber-700',
  activate: 'bg-emerald-100 text-emerald-700',
  sync:     'bg-violet-100 text-violet-700',
  connect:  'bg-emerald-100 text-emerald-700',
  pay:      'bg-emerald-100 text-emerald-700',
  reply:    'bg-blue-100 text-blue-700',
  close:    'bg-slate-200 text-slate-600',
  cancel:   'bg-rose-100 text-rose-700',
  enable:   'bg-emerald-100 text-emerald-700',
  disable:  'bg-rose-100 text-rose-700',
  reset:    'bg-blue-100 text-blue-700',
  export:   'bg-violet-100 text-violet-700',
};

function verbTint(action: string) {
  const verb = action.split('.').pop() || '';
  return VERB_TINT[verb] || 'bg-slate-100 text-slate-700';
}

function relTime(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 14) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AuditScreen() {
  const [actionFilter, setActionFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['audit', actionFilter],
    queryFn: () => billingApi.audit({
      limit: 200,
      action: actionFilter || undefined,
    }).then((r) => r.data || []),
  });

  // Build an action-filter chip list from the loaded rows so users
  // only see filters that exist in their own audit history.
  const actionCounts = useMemo(() => {
    const out = new Map<string, number>();
    for (const row of data || []) {
      out.set(row.action, (out.get(row.action) || 0) + 1);
    }
    return Array.from(out.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [data]);

  const items = data ?? [];

  return (
    <PageShell
      title="Activity log"
      subtitle="Every authenticated change inside your workspace."
      loading={isLoading}
      refreshing={isRefetching}
      onRefresh={refetch}
    >
      {/* Action filter chips */}
      {actionCounts.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6 }}
          className="mb-3 -mx-1"
        >
          <Chip label="All" count={items.length} active={actionFilter === ''} onPress={() => setActionFilter('')} />
          {actionCounts.map(([action, count]) => (
            <Chip
              key={action}
              label={action}
              count={count}
              active={actionFilter === action}
              onPress={() => setActionFilter(action)}
            />
          ))}
        </ScrollView>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon={<Activity size={28} color="#94a3b8" />}
          title="No activity yet"
          description="Audit rows appear here as your team makes changes — orders, channels, settings, billing."
        />
      ) : (
        <View className="gap-2">
          {items.map((row) => (
            <AuditRowCard
              key={row.id}
              row={row}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
            />
          ))}
        </View>
      )}
    </PageShell>
  );
}

function Chip({ label, count, active, onPress }: { label: string; count?: number; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-3 py-1.5 rounded-full border ${
        active ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'
      }`}
    >
      <Text className={`text-xs font-bold ${active ? 'text-emerald-700' : 'text-slate-600'}`}>
        {label}
        {count !== undefined ? <Text className="text-slate-400"> {count}</Text> : null}
      </Text>
    </Pressable>
  );
}

function AuditRowCard({
  row, expanded, onToggle,
}: {
  row: AuditRow; expanded: boolean; onToggle: () => void;
}) {
  const tint = verbTint(row.action);
  return (
    <Pressable
      onPress={onToggle}
      className="bg-white border border-slate-200 rounded-2xl p-4"
    >
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2 flex-wrap">
            <View className={`px-2 py-0.5 rounded ${tint.split(' ')[0]}`}>
              <Text className={`text-[10px] font-bold ${tint.split(' ')[1]}`}>
                {row.action}
              </Text>
            </View>
            {row.resource ? (
              <Text className="text-xs text-slate-500 font-medium">{row.resource}</Text>
            ) : null}
            {row.statusCode ? (
              <Text className={`text-[10px] font-bold ${
                row.statusCode >= 400 ? 'text-rose-600' : 'text-emerald-600'
              }`}>
                {row.statusCode}
              </Text>
            ) : null}
          </View>
          <Text numberOfLines={1} className="text-sm font-semibold text-slate-900 mt-1">
            {row.userEmail || 'System'}
          </Text>
          <View className="flex-row items-center gap-2 mt-1">
            <Text className="text-[11px] text-slate-400">{relTime(row.createdAt)}</Text>
            {row.ip ? (
              <Text className="text-[11px] text-slate-400">· {row.ip}</Text>
            ) : null}
          </View>
        </View>
        <ChevronDown
          size={14}
          color="#94a3b8"
          style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
        />
      </View>

      {expanded ? (
        <View className="mt-3 pt-3 border-t border-slate-100 gap-1.5">
          {row.path ? (
            <RowKv k="Path" v={`${row.method || ''} ${row.path}`.trim()} />
          ) : null}
          {row.resourceId ? <RowKv k="Resource ID" v={row.resourceId} /> : null}
          {row.metadata ? (
            <View>
              <Text className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Metadata</Text>
              <Text className="text-[11px] text-slate-600 font-mono leading-snug">
                {JSON.stringify(row.metadata, null, 2)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function RowKv({ k, v }: { k: string; v: string }) {
  return (
    <View className="flex-row gap-2">
      <Text className="text-[10px] uppercase tracking-wider font-bold text-slate-400 w-20">{k}</Text>
      <Text className="text-[11px] text-slate-700 flex-1">{v}</Text>
    </View>
  );
}
