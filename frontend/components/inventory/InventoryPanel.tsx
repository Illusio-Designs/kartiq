'use client';

// Inventory management panel — the stock-by-warehouse view with inline
// set-stock. Rendered inside the Catalog page's "Inventory" tab (and reachable
// at /inventory, which redirects into that tab).
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, warehouseApi } from '@/lib/api';
import { StatRow } from '@/components/StatCards';
import { TableRowsSkeleton } from '@/components/Shimmer';
import { useFilteredBySearch } from '@/lib/useGlobalSearch';
import {
  Button, Badge, Card, Input, Select, Checkbox, EmptyState, Pagination, Tooltip,
} from '@/components/ui';
import { toast } from '@/store/toast.store';
import { Boxes, Store, CheckCircle2, Clock, AlertTriangle, Search, Save, PackageX } from 'lucide-react';

const PAGE_SIZE = 20;

function stockBadge(available: number) {
  if (available <= 0) return { variant: 'rose' as const, label: 'Out of stock' };
  if (available <= 10) return { variant: 'amber' as const, label: 'Low' };
  return { variant: 'emerald' as const, label: 'In stock' };
}

export function InventoryPanel() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [warehouseId, setWarehouseId] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [search, setSearch] = useState('');

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehouseApi.list().then((r) => r.data),
  });
  const warehouses: any[] = Array.isArray(warehousesData) ? warehousesData : (warehousesData?.warehouses || []);

  const { data: statsData } = useQuery({
    queryKey: ['inventory-stats', warehouseId],
    queryFn: () => inventoryApi.stats({ warehouseId: warehouseId || undefined }).then((r) => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', page, warehouseId, lowOnly],
    queryFn: () => inventoryApi.list({
      page,
      limit: PAGE_SIZE,
      warehouseId: warehouseId || undefined,
      lowStock: lowOnly ? 'true' : undefined,
    }).then((r) => r.data),
  });

  const items: any[] = data?.items || [];
  const total: number = data?.total || 0;

  const globallyFiltered = useFilteredBySearch(items, (i: any) =>
    `${i.variant?.product?.name || ''} ${i.variant?.sku || ''} ${i.warehouse?.name || ''}`
  );
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return globallyFiltered;
    return globallyFiltered.filter((i: any) =>
      `${i.variant?.product?.name || ''} ${i.variant?.sku || ''} ${i.warehouse?.name || ''}`.toLowerCase().includes(q)
    );
  }, [globallyFiltered, search]);

  const s = statsData || {};

  return (
    <div className="space-y-5">
      <StatRow items={[
        { label: 'Units on hand', value: (s.onHand ?? 0).toLocaleString(), tone: 'slate', icon: <Boxes size={16} /> },
        { label: 'Available', value: (s.available ?? 0).toLocaleString(), tone: 'emerald', icon: <CheckCircle2 size={16} /> },
        { label: 'Reserved', value: (s.reserved ?? 0).toLocaleString(), tone: 'amber', icon: <Clock size={16} />, hint: 'Held for open orders' },
        { label: 'Low-stock SKUs', value: (s.lowStock ?? 0).toLocaleString(), tone: 'rose', icon: <AlertTriangle size={16} /> },
        { label: 'Warehouses', value: (s.warehouses ?? 0).toLocaleString(), tone: 'blue', icon: <Store size={16} /> },
      ]} cols={5} />

      <Card className="p-0 overflow-visible">
        <div className="p-3 sm:p-4 flex items-center gap-2 flex-wrap border-b border-slate-100 dark:border-slate-800">
          <div className="flex-1 min-w-[180px] max-w-sm">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, SKU…" leftIcon={<Search size={14} />} />
          </div>
          <div className="w-48">
            <Select
              value={warehouseId}
              onChange={(v) => { setWarehouseId(v); setPage(1); }}
              options={[{ value: '', label: 'All warehouses' }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
              fullWidth
            />
          </div>
          <Checkbox label="Low stock only" checked={lowOnly} onCheckedChange={(v) => { setLowOnly(v); setPage(1); }} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
              <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400">
                <th className="px-4 py-2.5 font-bold w-full">Product</th>
                <th className="px-4 py-2.5 font-bold whitespace-nowrap">Warehouse</th>
                <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">On hand</th>
                <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">Reserved</th>
                <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">Available</th>
                <th className="px-4 py-2.5 font-bold whitespace-nowrap">Status</th>
                <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">Set stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <TableRowsSkeleton rows={8} cols={7} cellClassName="px-4 py-3" />
              ) : rows.length ? rows.map((it: any) => (
                <InventoryRow key={it.id} item={it} onSaved={() => {
                  qc.invalidateQueries({ queryKey: ['inventory'] });
                  qc.invalidateQueries({ queryKey: ['inventory-stats'] });
                }} />
              )) : (
                <tr>
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      icon={<PackageX size={28} />}
                      iconBg="bg-emerald-50 text-emerald-600"
                      title={search || lowOnly || warehouseId ? 'No matching stock' : 'No inventory yet'}
                      description={search || lowOnly || warehouseId
                        ? 'Nothing matches these filters. Try clearing the search, warehouse, or low-stock filter.'
                        : 'Pull a channel catalog or sync self-fulfilled (MFN) orders to seed stock here, then set quantities.'}
                      decorative
                      size="lg"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {total > PAGE_SIZE && (
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      )}
    </div>
  );
}

function InventoryRow({ item, onSaved }: { item: any; onSaved: () => void }) {
  const onHand = Number(item.quantityOnHand ?? 0);
  const reserved = Number(item.quantityReserved ?? 0);
  const available = Number(item.quantityAvailable ?? 0);
  const [value, setValue] = useState(String(onHand));
  const badge = stockBadge(available);
  const dirty = value.trim() !== '' && Number(value) !== onHand && !Number.isNaN(Number(value));

  const setMutation = useMutation({
    mutationFn: () => inventoryApi.adjust({
      warehouseId: item.warehouseId,
      variantId: item.variantId,
      quantity: Math.max(0, Math.round(Number(value))),
      type: 'SET',
    }),
    onSuccess: () => { toast.success('Stock updated'); onSaved(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message || 'Could not update stock'),
  });

  return (
    <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
      <td className="px-4 py-3">
        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{item.variant?.product?.name || item.variant?.name || '—'}</div>
        <div className="text-[11px] text-slate-400 font-mono">{item.variant?.sku || '—'}</div>
      </td>
      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5"><Store size={13} className="text-slate-400" />{item.warehouse?.name || '—'}</span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{onHand}</td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{reserved}</td>
      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{available}</td>
      <td className="px-4 py-3 whitespace-nowrap"><Badge variant={badge.variant} dot>{badge.label}</Badge></td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1.5">
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-20 h-8 px-2 text-sm text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400"
          />
          <Tooltip content={dirty ? 'Save new on-hand quantity' : 'Change the value to save'}>
            <span>
              <Button variant="outline" size="icon" disabled={!dirty} loading={setMutation.isPending} onClick={() => setMutation.mutate()}>
                <Save size={13} />
              </Button>
            </span>
          </Tooltip>
        </div>
      </td>
    </tr>
  );
}
