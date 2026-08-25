'use client';

import { ReactNode, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

// Panel widths for the side drawer (was max-w for the old centred modal).
const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
};

// `Modal` renders as a right-anchored slide-over panel: a full-height drawer
// that slides in from the right, with a pinned header/footer and a scrollable
// body. Props are unchanged, so every existing <Modal> becomes a side panel
// without touching its call sites.
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Keep the latest onClose in a ref so the focus effect below can depend ONLY
  // on `open`. If it depended on `onClose` (often an inline arrow that changes
  // every render), the effect would re-run on each keystroke and re-focus the
  // first field — stealing focus after every character typed in a modal input.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    // Remember what was focused so we can restore it when the drawer closes.
    const prevActive = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );
    // Move focus into the drawer (first field, else the panel itself).
    (focusable()[0] || panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key !== 'Tab') return;
      // Trap Tab focus inside the drawer.
      const items = focusable();
      if (items.length === 0) { e.preventDefault(); panel?.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prevActive?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    // Overlay closes the drawer only when the click lands on the overlay itself
    // (not a child). Because the panel no longer needs its own click handler,
    // it can safely carry role="dialog" without tripping
    // jsx-a11y/no-noninteractive-element-interactions.
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#0B1220]/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        tabIndex={-1}
        className={cn(
          'w-full h-full bg-white text-slate-900 shadow-2xl shadow-[#0B1220]/30 flex flex-col animate-drawer-in border-l border-slate-200 focus:outline-none',
          SIZES[size]
        )}
      >
        {title && (
          <div className="flex items-start justify-between p-6 border-b border-slate-100 flex-shrink-0">
            <div>
              <h2 id={titleId} className="text-lg font-bold text-slate-900">{title}</h2>
              {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="p-6 flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
