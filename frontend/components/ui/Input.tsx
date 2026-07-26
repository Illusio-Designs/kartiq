'use client';

import { forwardRef, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, className, id, ...props }, ref) => {
    const autoId = id || `input-${Math.random().toString(36).substring(2, 8)}`;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={autoId} className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={autoId}
            className={cn(
              'w-full px-4 py-2.5 text-sm bg-white text-slate-900 border rounded-xl transition-all duration-200',
              'placeholder:text-slate-400 focus:outline-none focus:ring-4',
              error
                ? 'border-rose-300 focus:ring-rose-500/10 focus:border-rose-400'
                : 'border-slate-200 focus:ring-emerald-500/10 focus:border-emerald-400',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              {rightIcon}
            </div>
          )}
        </div>
        {hint && !error && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
        {error && <p className="text-xs text-rose-600 mt-1 font-medium">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const autoId = id || `ta-${Math.random().toString(36).substring(2, 8)}`;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={autoId} className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={autoId}
          className={cn(
            'w-full px-4 py-2.5 text-sm bg-white text-slate-900 border rounded-xl transition-all duration-200',
            'placeholder:text-slate-400 focus:outline-none focus:ring-4',
            error
              ? 'border-rose-300 focus:ring-rose-500/10 focus:border-rose-400'
              : 'border-slate-200 focus:ring-emerald-500/10 focus:border-emerald-400',
            className
          )}
          {...props}
        />
        {hint && !error && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
        {error && <p className="text-xs text-rose-600 mt-1 font-medium">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
