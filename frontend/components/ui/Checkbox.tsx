'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}

export function Checkbox({
  checked = false, onCheckedChange, disabled, label, description,
}: CheckboxProps) {
  const control = (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all',
        checked
          ? 'bg-emerald-500 border-emerald-500 shadow-sm shadow-emerald-500/30'
          : 'bg-white border-slate-300 hover:border-emerald-400',
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'cursor-pointer'
      )}
    >
      {checked && <Check size={13} strokeWidth={3} className="text-white" />}
    </button>
  );

  if (!label) return control;

  return (
    <label className={cn('flex items-start gap-3 cursor-pointer', disabled && 'opacity-60 cursor-not-allowed')}>
      {control}
      <div className="min-w-0 -mt-0.5">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        {description && <div className="text-xs text-slate-500 mt-0.5">{description}</div>}
      </div>
    </label>
  );
}
