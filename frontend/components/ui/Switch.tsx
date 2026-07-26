'use client';

import { cn } from '@/lib/utils';

interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  size?: 'sm' | 'md';
}

export function Switch({
  checked = false, onCheckedChange, disabled, label, description, size = 'md',
}: SwitchProps) {
  const sizes = {
    sm: { track: 'w-8 h-5',  thumb: 'w-3.5 h-3.5', translate: 'translate-x-[14px]' },
    md: { track: 'w-10 h-6', thumb: 'w-4 h-4',     translate: 'translate-x-[18px]' },
  }[size];

  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'relative inline-flex items-center rounded-full transition-colors flex-shrink-0',
        sizes.track,
        checked ? 'bg-emerald-500' : 'bg-slate-200',
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'cursor-pointer'
      )}
    >
      <span
        className={cn(
          'absolute left-1 rounded-full bg-white shadow-sm transition-transform',
          sizes.thumb,
          checked && sizes.translate
        )}
      />
    </button>
  );

  if (!label) return button;

  return (
    <label className={cn('flex items-center justify-between gap-3', disabled && 'opacity-60')}>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        {description && <div className="text-xs text-slate-500 mt-0.5">{description}</div>}
      </div>
      {button}
    </label>
  );
}
