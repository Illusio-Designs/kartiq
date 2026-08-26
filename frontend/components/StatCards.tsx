'use client';

// Shared KPI stat cards used across dashboard pages, so every list page
// headlines with the same visual language. Colours are semantic, not
// decorative: emerald = healthy/primary, amber = needs attention, blue/violet
// = in-flight, rose = problem, slate = neutral total.
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type StatTone = 'slate' | 'emerald' | 'amber' | 'blue' | 'violet' | 'rose' | 'cyan';

const TONE: Record<StatTone, string> = {
  slate:   'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  amber:   'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  blue:    'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  violet:  'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
  rose:    'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
  cyan:    'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400',
};

export interface StatItem {
  label: string;
  value: React.ReactNode;
  tone?: StatTone;
  icon?: React.ReactNode;
  hint?: string;         // tooltip
  href?: string;         // makes the whole card a link (deep-link into a filtered view)
  onClick?: () => void;  // makes the card an in-place action (e.g. apply a filter)
  active?: boolean;      // highlight when its filter is currently applied
  loading?: boolean;
}

function StatCardInner({ label, value, tone = 'slate', icon, loading }: StatItem) {
  // Fixed structure so every card is identical in size: a 36px icon tile always
  // occupies the left slot, and the number/label column is a fixed two-line block.
  return (
    <div className="flex items-center gap-3 px-4 w-full">
      <span className={cn('w-9 h-9 rounded-xl grid place-items-center flex-shrink-0', TONE[tone])}>
        {icon}
      </span>
      <div className="min-w-0">
        {loading ? (
          <div className="h-[22px] w-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
        ) : (
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-none truncate">{value}</div>
        )}
        <div className="text-xs text-slate-500 mt-1 font-medium truncate">{label}</div>
      </div>
    </div>
  );
}

export function StatCard(item: StatItem) {
  // Same base on every variant → identical height (h-16) and layout, whether the
  // card is a link, a filter button, or static. hint uses a native title so no
  // wrapper element changes the box.
  const base = 'flex items-center h-16 bg-white dark:bg-slate-900 border rounded-2xl shadow-sm transition-shadow';
  const border = item.active ? 'border-emerald-400 ring-2 ring-emerald-500/15' : 'border-slate-200 dark:border-slate-800';
  const hoverable = 'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700';
  const title = item.hint || undefined;
  const inner = <StatCardInner {...item} />;

  if (item.href) {
    return <Link href={item.href} title={title} className={cn(base, border, hoverable)}>{inner}</Link>;
  }
  if (item.onClick) {
    return (
      <button type="button" onClick={item.onClick} title={title} className={cn(base, border, hoverable, 'text-left focus:outline-none focus:ring-2 focus:ring-emerald-500/30')}>
        {inner}
      </button>
    );
  }
  return <div title={title} className={cn(base, border)}>{inner}</div>;
}

// A responsive row of stat cards. Pass `cols` to hint the column count on wide
// screens (defaults to the number of items, capped at 5).
export function StatRow({ items, cols }: { items: StatItem[]; cols?: number }) {
  const n = Math.min(cols || items.length, 6);
  const lg: Record<number, string> = {
    2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6',
  };
  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-3 gap-3', lg[n] || 'lg:grid-cols-4')}>
      {items.map((it, i) => <StatCard key={i} {...it} />)}
    </div>
  );
}
