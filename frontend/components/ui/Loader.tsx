'use client';

import { cn } from '@/lib/utils';

type LoaderSize = 'sm' | 'md' | 'lg';

interface LoaderProps {
  size?: LoaderSize;
  label?: string;
  fullScreen?: boolean;
  className?: string;
}

const SIZES: Record<LoaderSize, { box: string; inset: string; svg: number; bar: string; dot: string }> = {
  sm: { box: 'w-8 h-8',  inset: 'inset-1',   svg: 14, bar: 'w-16 h-1',   dot: 'w-1.5 h-1.5' },
  md: { box: 'w-12 h-12', inset: 'inset-1.5', svg: 18, bar: 'w-24 h-1',   dot: 'w-1.5 h-1.5' },
  lg: { box: 'w-16 h-16', inset: 'inset-2',   svg: 24, bar: 'w-32 h-1',   dot: 'w-2 h-2'   },
};

export function Loader({ size = 'md', label, fullScreen, className }: LoaderProps) {
  const s = SIZES[size];
  const a11yLabel = label || 'Loading';
  const content = (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className={cn('relative', s.box)} aria-hidden="true">
        <div className="absolute inset-0 rounded-2xl border-2 border-emerald-200 animate-spin-slow" />
        <div className={cn('absolute rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30 animate-pulse-soft flex items-center justify-center', s.inset)}>
          <svg width={s.svg} height={s.svg} viewBox="0 0 24 24" fill="none" className="text-white">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className={cn('absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-emerald-400 animate-orbit', s.dot)} />
        <div className={cn('absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-teal-400 animate-orbit', s.dot)} style={{ animationDelay: '0.5s' }} />
      </div>
      <div className={cn(s.bar, 'bg-slate-100 rounded-full overflow-hidden')} aria-hidden="true">
        <div className="h-full bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400 rounded-full animate-loading-bar" />
      </div>
      {label && <p className="text-xs text-slate-500 font-medium">{label}</p>}
      {!label && <span className="sr-only">{a11yLabel}</span>}
    </div>
  );

  if (fullScreen) {
    return (
      <div role="status" aria-live="polite" aria-label={a11yLabel} className="min-h-screen flex items-center justify-center bg-white">
        {content}
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" aria-label={a11yLabel} className="w-full flex items-center justify-center py-12">
      {content}
    </div>
  );
}
