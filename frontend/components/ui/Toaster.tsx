'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToastStore, ToastType } from '@/store/toast.store';
import { cn } from '@/lib/utils';

// Per-severity styling. `wash` is the soft gradient bleed on the left of the
// card; `tile` colors the icon; `prog` colors the auto-dismiss progress bar.
// Success stays GREEN (not the brand teal) so it reads as a semantic success.
const STYLES: Record<ToastType, { wash: string; tile: string; prog: string; icon: typeof Info }> = {
  success: { wash: 'from-green-100/70 dark:from-green-500/[0.16]', tile: 'text-green-600', prog: 'bg-green-500', icon: CheckCircle2 },
  error:   { wash: 'from-rose-100/70 dark:from-rose-500/[0.18]',   tile: 'text-rose-600',  prog: 'bg-rose-500',  icon: XCircle },
  info:    { wash: 'from-sky-100/70 dark:from-sky-500/[0.16]',     tile: 'text-sky-600',   prog: 'bg-sky-500',   icon: Info },
  warning: { wash: 'from-amber-100/80 dark:from-amber-500/[0.16]', tile: 'text-amber-600', prog: 'bg-amber-500', icon: AlertTriangle },
};

/**
 * Mounts a portal that renders all queued toasts in the bottom-right.
 * Drop one `<Toaster />` once at the root layout (DashboardLayout) — every
 * `toast.success(...)` / `toast.error(...)` call from anywhere shows up here.
 * The arrival chime is played by the toast store on push (see toast.store.ts).
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-3 w-[380px] max-w-[calc(100vw-2rem)] pointer-events-none">
      {toasts.map((t) => {
        const s = STYLES[t.type];
        const Icon = s.icon;
        const dur = t.durationMs ?? 4000;
        return (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl border border-slate-100 bg-white pl-4 pr-10 py-4 shadow-xl shadow-slate-900/10 animate-slide-in-right"
          >
            {/* Soft severity wash bleeding in from the left */}
            <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent', s.wash)} />

            {/* Icon tile */}
            <div className={cn('relative z-10 w-9 h-9 flex-shrink-0 rounded-xl bg-white dark:!bg-white/10 shadow-md dark:shadow-none flex items-center justify-center', s.tile)}>
              <Icon size={18} />
            </div>

            {/* Copy */}
            <div className="relative z-10 flex-1 min-w-0">
              {t.title && <div className="text-sm font-bold text-slate-900 leading-tight">{t.title}</div>}
              <div className="text-sm text-slate-600 leading-relaxed break-words mt-0.5">{t.message}</div>
            </div>

            <button
              onClick={() => dismiss(t.id)}
              className="absolute top-3 right-3 z-10 p-1 rounded-md text-slate-400 opacity-60 hover:opacity-100 hover:bg-slate-100 transition"
              aria-label="Dismiss"
            >
              <X size={15} />
            </button>

            {/* Auto-dismiss progress bar */}
            {dur > 0 && (
              <div
                className={cn('absolute left-0 bottom-0 h-[3px] w-full origin-left opacity-60', s.prog)}
                style={{ animation: `toast-progress ${dur}ms linear forwards` }}
              />
            )}
          </div>
        );
      })}
    </div>,
    document.body
  );
}
