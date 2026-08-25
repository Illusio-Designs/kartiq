'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToastStore, ToastType } from '@/store/toast.store';
import { cn } from '@/lib/utils';

const STYLES: Record<ToastType, { bg: string; border: string; text: string; icon: any; iconColor: string }> = {
  success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', icon: CheckCircle2,  iconColor: 'text-emerald-600' },
  error:   { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-800',    icon: XCircle,       iconColor: 'text-rose-600' },
  info:    { bg: 'bg-sky-50',     border: 'border-sky-200',     text: 'text-sky-800 dark:text-sky-300',     icon: Info,          iconColor: 'text-sky-600' },
  warning: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   icon: AlertTriangle, iconColor: 'text-amber-600' },
};

/**
 * Mounts a portal that renders all queued toasts in the bottom-right.
 * Drop one `<Toaster />` once at the root layout (DashboardLayout) — every
 * `toast.success(...)` / `toast.error(...)` call from anywhere shows up here.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      {toasts.map((t) => {
        const s = STYLES[t.type];
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-xl shadow-slate-900/10 animate-slide-up',
              s.bg, s.border, s.text
            )}
          >
            <Icon size={18} className={cn('mt-0.5 flex-shrink-0', s.iconColor)} />
            <div className="flex-1 min-w-0">
              {t.title && <div className="text-sm font-bold mb-0.5">{t.title}</div>}
              <div className="text-sm leading-relaxed break-words">{t.message}</div>
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="flex-shrink-0 p-1 rounded-md opacity-50 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
