'use client';

import { ReactNode, useState, useRef, useEffect, useId, cloneElement, isValidElement } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type Side = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  delay?: number;
  className?: string;
  /** Allow the tooltip text to wrap (use for help text > a few words). */
  wrap?: boolean;
}

/**
 * JS-positioned tooltip rendered in a portal so it can escape any scroll
 * container or overflow:hidden parent (like a collapsed sidebar nav).
 * Uses a wrapper span but delegates events via onMouseEnter/Leave/Focus/Blur.
 */
export function Tooltip({ content, children, side = 'top', delay = 150, className, wrap }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const tipId = useId();

  useEffect(() => setMounted(true), []);

  const computePosition = () => {
    if (!wrapperRef.current) return null;
    const rect = wrapperRef.current.getBoundingClientRect();
    const gap = 8;

    switch (side) {
      case 'top':
        return { top: rect.top - gap, left: rect.left + rect.width / 2 };
      case 'bottom':
        return { top: rect.bottom + gap, left: rect.left + rect.width / 2 };
      case 'left':
        return { top: rect.top + rect.height / 2, left: rect.left - gap };
      case 'right':
        return { top: rect.top + rect.height / 2, left: rect.right + gap };
    }
  };

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const pos = computePosition();
      if (pos) {
        setCoords(pos);
        setOpen(true);
      }
    }, delay);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Transform origin mapping
  const transformClass = {
    top:    '-translate-x-1/2 -translate-y-full',
    bottom: '-translate-x-1/2',
    left:   '-translate-x-full -translate-y-1/2',
    right:  '-translate-y-1/2',
  }[side];

  return (
    <>
      <span
        ref={wrapperRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        // Link the trigger to the tooltip so screen readers announce the hint.
        aria-describedby={open ? tipId : undefined}
        className="inline-flex"
      >
        {children}
      </span>

      {mounted && open && coords && createPortal(
        <div
          id={tipId}
          role="tooltip"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          className={cn(
            'px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#0B1220] rounded-md shadow-xl',
            wrap ? 'max-w-xs leading-snug whitespace-normal break-words' : 'whitespace-nowrap',
            'animate-fade-in',
            transformClass,
            className
          )}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  );
}
