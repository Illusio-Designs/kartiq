'use client';

import { forwardRef, InputHTMLAttributes, useId, useState } from 'react';
import { Eye, EyeOff, Lock, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  showStrength?: boolean;
}

function scorePassword(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  return score;
}

const STRENGTH_META = [
  { label: 'Too weak',  color: 'bg-rose-500',    text: 'text-rose-600',    width: '20%' },
  { label: 'Weak',      color: 'bg-orange-500',  text: 'text-orange-600',  width: '40%' },
  { label: 'Fair',      color: 'bg-amber-500',   text: 'text-amber-600',   width: '60%' },
  { label: 'Good',      color: 'bg-lime-500',    text: 'text-lime-600',    width: '80%' },
  { label: 'Strong',    color: 'bg-emerald-500', text: 'text-emerald-600', width: '100%' },
];

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, error, hint, showStrength, className, id, value = '', ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const uid = useId();
    const autoId = id || `pw-${uid}`;
    const score = scorePassword(String(value));
    const meta = STRENGTH_META[Math.max(0, score - 1)] || STRENGTH_META[0];

    const checks = [
      { label: '8+ characters',      pass: String(value).length >= 8 },
      { label: 'Upper & lowercase',  pass: /[a-z]/.test(String(value)) && /[A-Z]/.test(String(value)) },
      { label: 'Number',             pass: /\d/.test(String(value)) },
      { label: 'Special character',  pass: /[^a-zA-Z0-9]/.test(String(value)) },
    ];

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={autoId} className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            ref={ref}
            id={autoId}
            type={visible ? 'text' : 'password'}
            value={value}
            className={cn(
              'w-full pl-10 pr-11 py-2.5 text-sm bg-white border rounded-xl transition-all duration-200',
              'placeholder:text-slate-400 focus:outline-none focus:ring-4',
              error
                ? 'border-rose-300 focus:ring-rose-500/10 focus:border-rose-400'
                : 'border-slate-200 focus:ring-emerald-500/10 focus:border-emerald-400',
              className
            )}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible(!visible)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-md transition-colors"
            aria-label={visible ? 'Hide password' : 'Show password'}
          >
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {/* Strength meter */}
        {showStrength && value && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden mr-3">
                <div
                  className={cn('h-full rounded-full transition-all duration-300', meta.color)}
                  style={{ width: meta.width }}
                />
              </div>
              <span className={cn('text-[10px] font-bold uppercase tracking-wider', meta.text)}>
                {meta.label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 mt-2">
              {checks.map(c => (
                <div key={c.label} className={cn('flex items-center gap-1.5 text-[10px] font-semibold', c.pass ? 'text-emerald-600' : 'text-slate-400')}>
                  {c.pass ? <Check size={10} /> : <X size={10} />}
                  {c.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {hint && !error && !showStrength && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
        {error && <p className="text-xs text-rose-600 mt-1 font-medium">{error}</p>}
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';
