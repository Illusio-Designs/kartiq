'use client';

// Shared KPI stat cards used across dashboard pages, so every list page
// headlines with the same visual language. Colours are semantic, not
// decorative: emerald = healthy/primary, amber = needs attention, blue/violet
// = in-flight, rose = problem, slate = neutral total.
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui';

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
  return (
    <div className="flex items-center gap-3 p-4 h-full">
      {icon && (
        <span className={cn('w-9 h-9 rounded-xl grid place-items-center flex-shrink-0', TONE[tone])}>
          {icon}
        </span>
      )}
      <div className="min-w-0">
        {loading ? (
          <div className="h-6 w-10 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
        ) : (
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-none truncate">{value}</div>
        )}
        <div className="text-xs text-slate-500 mt-1 font-medium truncate">{label}</div>
      </div>
    </div>
  );
}

export function StatCard(item: StatItem) {
  const base = 'bg-white dark:bg-slate-900 border rounded-2xl shadow-sm transition-shadow';
  const border = item.active ? 'border-emerald-400 ring-2 ring-emerald-500/15' : 'border-slate-200 dark:border-slate-800';
  const hoverable = 'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700';
  const inner = <StatCardInner {...item} />;
  let card: React.ReactNode;
  if (item.href) {
    card = <Link href={item.href} className={cn(base, border, 'block', hoverable)}>{inner}</Link>;
  } else if (item.onClick) {
    card = (
      <button type="button" onClick={item.onClick} className={cn(base, border, 'w-full text-left', hoverable, 'focus:outline-none focus:ring-2 focus:ring-emerald-500/30')}>
        {inner}
      </button>
    );
  } else {
    card = <div className={cn(base, border)}>{inner}</div>;
  }
  return item.hint ? <Tooltip content={item.hint}><div className="h-full">{card}</div></Tooltip> : card;
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
