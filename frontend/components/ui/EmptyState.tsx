'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: ReactNode;
  iconBg?: string;            // e.g. 'bg-emerald-50 text-emerald-600'
  title: string;
  description?: string;
  /** Primary CTA — usually a <Button>. */
  action?: ReactNode;
  /** Optional secondary CTA (lighter weight, e.g. "Or import a CSV"). */
  secondaryAction?: ReactNode;
  /**
   * Add a soft gradient halo behind the icon. Matches the channels-page
   * empty-state aesthetic and makes a list page feel less barren on
   * first paint. Keep `false` (default) for use inside compact cards.
   */
  decorative?: boolean;
  /** Optional small "Tip:" line shown under the actions. */
  tip?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { wrap: 'p-8',  iconBox: 'w-12 h-12', title: 'text-sm', desc: 'text-xs' },
  md: { wrap: 'p-12', iconBox: 'w-16 h-16', title: 'text-base font-bold', desc: 'text-sm' },
  lg: { wrap: 'p-16', iconBox: 'w-20 h-20', title: 'text-lg font-bold', desc: 'text-sm' },
};

/**
 * Standard "No X yet" placeholder. Drop into the body of a `<Card>` or
 * directly inside a list container. Backed by docs/PENDING.md item #33 —
 * polished empty states drive trial-to-paid activation.
 *
 *   <EmptyState
 *     icon={<Building2 size={28} />}
 *     iconBg="bg-emerald-50 text-emerald-600"
 *     title="No vendors yet"
 *     description="Add your first supplier to start creating purchase orders."
 *     action={<Button leftIcon={<Plus size={14} />}>New Vendor</Button>}
 *     secondaryAction={<a href="/help/vendors">Read the guide</a>}
 *     decorative
 *   />
 */
export function EmptyState({
  icon,
  iconBg = 'bg-slate-100 text-slate-500',
  title,
  description,
  action,
  secondaryAction,
  decorative = false,
  tip,
  className,
  size = 'md',
}: EmptyStateProps) {
  const s = SIZES[size];
  return (
    <div className={cn('relative text-center overflow-hidden', s.wrap, className)}>
      {/* Decorative gradient blob — purely aesthetic, sits behind everything */}
      {decorative && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-start justify-center"
        >
          <div className="w-72 h-72 rounded-full bg-gradient-to-br from-emerald-200/40 via-teal-200/30 to-cyan-200/20 blur-3xl -translate-y-12" />
        </div>
      )}

      <div className="relative">
        {icon && (
          <div className={cn(
            'inline-flex items-center justify-center rounded-2xl mb-4 transition-transform hover:scale-105',
            s.iconBox, iconBg,
            decorative && 'shadow-sm ring-1 ring-white/40',
          )}>
            {icon}
          </div>
        )}
        <h3 className={cn('text-slate-900', s.title)}>{title}</h3>
        {description && (
          <p className={cn('text-slate-500 mt-1 max-w-md mx-auto leading-relaxed', s.desc)}>
            {description}
          </p>
        )}
        {(action || secondaryAction) && (
          <div className="mt-5 inline-flex items-center gap-3 flex-wrap justify-center">
            {action}
            {secondaryAction && (
              <span className="text-xs text-slate-500">{secondaryAction}</span>
            )}
          </div>
        )}
        {tip && (
          <div className="mt-4 text-[11px] text-slate-400">
            <span className="font-bold text-slate-500">Tip:</span> {tip}
          </div>
        )}
      </div>
    </div>
  );
}
