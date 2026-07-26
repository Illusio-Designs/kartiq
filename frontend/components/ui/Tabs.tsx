'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<K extends string = string> {
  key: K;
  label: string;
  icon?: ReactNode;
  badge?: number | string;
  disabled?: boolean;
}

interface TabsProps<K extends string = string> {
  value: K;
  onChange: (key: K) => void;
  items: TabItem<K>[];
  className?: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
}

const SIZES = {
  sm: { wrap: 'p-0.5 gap-0.5', btn: 'px-3 py-1.5 text-xs', icon: 12 },
  md: { wrap: 'p-1 gap-1',     btn: 'px-4 py-2 text-sm',   icon: 14 },
};

/**
 * Inline tab toggle (pill style). Wraps the recurring
 * `flex gap-1 p-1 bg-slate-100 rounded-xl` pattern used on settings,
 * dashboard/team, inventory, etc.
 *
 *   <Tabs
 *     value={tab}
 *     onChange={setTab}
 *     items={[
 *       { key: 'users', label: 'Users', icon: <Users size={14} /> },
 *       { key: 'roles', label: 'Roles', icon: <Shield size={14} /> },
 *     ]}
 *   />
 */
export function Tabs<K extends string = string>({
  value, onChange, items, className, size = 'md', fullWidth,
}: TabsProps<K>) {
  const s = SIZES[size];
  return (
    <div
      className={cn(
        // Scroll container — hides scrollbar but keeps horizontal scroll/wheel/swipe
        'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        fullWidth ? 'w-full' : 'max-w-full'
      )}
    >
      <div className={cn(
        'inline-flex bg-slate-100 rounded-xl',
        s.wrap,
        fullWidth && 'w-full',
        className
      )}>
        {items.map((it) => {
          const active = it.key === value;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => !it.disabled && onChange(it.key)}
              disabled={it.disabled}
              className={cn(
                'flex items-center gap-2 rounded-lg font-bold transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed',
                s.btn,
                active
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-500 hover:text-slate-700',
                fullWidth && 'flex-1 justify-center'
              )}
            >
              {it.icon}
              {it.label}
              {it.badge !== undefined && it.badge !== null && it.badge !== 0 && (
                <span className={cn(
                  'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold',
                  active
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-600'
                )}>
                  {it.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
