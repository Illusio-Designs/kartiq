'use client';

import { ReactNode, useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface SelectProps {
  value?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: ReactNode;
  className?: string;
  fullWidth?: boolean;
  size?: 'sm' | 'md';
}

const SIZE_CLASSES = {
  sm: 'px-2.5 py-1 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
};

export function Select({
  value, onChange, options, placeholder = 'Select…', label, className, fullWidth, size = 'md',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} className={cn('relative', fullWidth && 'w-full', className)}>
      {label && (
        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center justify-between gap-2 bg-white text-slate-900 border border-slate-200 hover:border-slate-300 transition-all',
          'focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400',
          SIZE_CLASSES[size],
          fullWidth && 'w-full'
        )}
      >
        <span className={cn('flex items-center gap-2 truncate', !selected && 'text-slate-400')}>
          {selected?.icon}
          {selected?.label || placeholder}
        </span>
        <ChevronDown size={15} className={cn('text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-900/10 p-1 z-50 max-h-64 overflow-y-auto animate-slide-up">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange?.(opt.value); setOpen(false); }}
              className={cn(
                'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                opt.value === value
                  ? 'bg-emerald-50 text-emerald-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50'
              )}
            >
              <span className="flex items-center gap-2 truncate">
                {opt.icon}
                {opt.label}
              </span>
              {opt.value === value && <Check size={14} className="text-emerald-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
