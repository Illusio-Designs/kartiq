'use client';

import { ReactNode, useEffect } from 'react';
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

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1220]/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full bg-white text-slate-900 rounded-3xl shadow-2xl shadow-[#0B1220]/30 overflow-hidden animate-slide-up border border-transparent',
          SIZES[size]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-start justify-between p-6 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{title}</h2>
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
        <div className="p-6 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
