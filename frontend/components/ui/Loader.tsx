'use client';

import { cn } from '@/lib/utils';

type LoaderSize = 'sm' | 'md' | 'lg';

interface LoaderProps {
  size?: LoaderSize;
  label?: string;
  fullScreen?: boolean;
  className?: string;
}

// Per-size geometry for the wave bars: bar width, resting/full height, and gap.
const SIZES: Record<LoaderSize, { bar: number; height: number; gap: number; gapY: string; text: string }> = {
  sm: { bar: 3, height: 16, gap: 3, gapY: 'gap-2',   text: 'text-[11px]' },
  md: { bar: 4, height: 28, gap: 4, gapY: 'gap-3.5', text: 'text-xs'   },
  lg: { bar: 6, height: 40, gap: 6, gapY: 'gap-4',   text: 'text-sm'   },
};

const BARS = 5;

export function Loader({ size = 'md', label, fullScreen, className }: LoaderProps) {
  const s = SIZES[size];
  const a11yLabel = label || 'Loading';

  const content = (
    <div className={cn('flex flex-col items-center', s.gapY, className)}>
      <div className="kq-wave" style={{ gap: s.gap, height: s.height }} aria-hidden="true">
        {Array.from({ length: BARS }).map((_, i) => (
          <i key={i} style={{ width: s.bar, height: s.height }} />
        ))}
      </div>
      {label && <p className={cn(s.text, 'text-slate-500 dark:text-slate-400 font-medium tracking-wide')}>{label}</p>}
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
