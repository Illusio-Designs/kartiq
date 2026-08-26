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
  // Shift keeps the tooltip inside the viewport; `positioned` hides it for the
  // one frame between first paint and the clamp so it never flashes off-screen.
  const [shift, setShift] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [positioned, setPositioned] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const tipId = useId();

  useEffect(() => setMounted(true), []);

  // After the tooltip renders, measure it and nudge it back inside the viewport
  // (an 8px margin) so trigger buttons near the screen edge aren't clipped.
  useEffect(() => {
    if (!open || !coords || !tipRef.current) return;
    const r = tipRef.current.getBoundingClientRect();
    const m = 8;
    let dx = 0;
    let dy = 0;
    if (r.left < m) dx = m - r.left;
    else if (r.right > window.innerWidth - m) dx = window.innerWidth - m - r.right;
    if (r.top < m) dy = m - r.top;
    else if (r.bottom > window.innerHeight - m) dy = window.innerHeight - m - r.bottom;
    setShift({ dx, dy });
    setPositioned(true);
  }, [open, coords]);

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
        // Reset the clamp so the effect measures the fresh, unshifted position.
        setShift({ dx: 0, dy: 0 });
        setPositioned(false);
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
          ref={tipRef}
          id={tipId}
          role="tooltip"
          style={{
            position: 'fixed',
            top: coords.top + shift.dy,
            left: coords.left + shift.dx,
            zIndex: 9999,
            pointerEvents: 'none',
            opacity: positioned ? undefined : 0,
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
