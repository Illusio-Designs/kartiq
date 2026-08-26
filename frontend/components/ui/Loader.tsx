'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

type LoaderSize = 'sm' | 'md' | 'lg';

interface LoaderProps {
  size?: LoaderSize;
  label?: string;
  fullScreen?: boolean;
  className?: string;
}

// Per-size geometry: outer box, ring thickness, inner-ring inset, brand-mark
// inset, icon size, and the width of the indeterminate progress track.
const SIZES: Record<LoaderSize, {
  box: string; thick: string; inner: string; mark: string; svg: number; track: string; gap: string;
}> = {
  sm: { box: 'w-9 h-9',   thick: '3px', inner: 'inset-[6px]',  mark: 'inset-[9px]',  svg: 12, track: 'w-14', gap: 'gap-3' },
  md: { box: 'w-14 h-14', thick: '4px', inner: 'inset-[9px]',  mark: 'inset-[13px]', svg: 18, track: 'w-24', gap: 'gap-4' },
  lg: { box: 'w-20 h-20', thick: '5px', inner: 'inset-[13px]', mark: 'inset-[19px]', svg: 26, track: 'w-32', gap: 'gap-4' },
};

export function Loader({ size = 'md', label, fullScreen, className }: LoaderProps) {
  const s = SIZES[size];
  const a11yLabel = label || 'Loading';
  const showTrack = size !== 'sm';

  const content = (
    <div className={cn('flex flex-col items-center', s.gap, className)}>
      <div className={cn('relative', s.box)} aria-hidden="true">
        {/* Soft breathing glow behind the rings */}
        <div className="kq-aurora-glow" />
        {/* Outer + inner counter-rotating aurora rings */}
        <div className="kq-aurora-ring" style={{ '--kq-thick': s.thick } as CSSProperties} />
        <div className={cn('kq-aurora-ring kq-aurora-ring--inner', s.inner)} style={{ '--kq-thick': s.thick } as CSSProperties} />
        {/* Center brand mark — gently pulsing */}
        <div className={cn(
          'absolute rounded-[10px] bg-gradient-to-br from-emerald-500 to-cyan-600',
          'shadow-lg shadow-emerald-500/30 flex items-center justify-center animate-pulse-soft',
          s.mark,
        )}>
          <svg width={s.svg} height={s.svg} viewBox="0 0 24 24" fill="none" className="text-white">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {showTrack && (
        <div className={cn(s.track, 'h-1 bg-slate-100 dark:bg-slate-800', 'kq-track')} aria-hidden="true" />
      )}

      {label && <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">{label}</p>}
      {!label && <span className="sr-only">{a11yLabel}</span>}
    </div>
  );

  if (fullScreen) {
    return (
      <div role="status" aria-live="polite" aria-label={a11yLabel} className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
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
