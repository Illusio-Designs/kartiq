'use client';

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value?: Date | null;
  onChange?: (date: Date) => void;
  placeholder?: string;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

export function DatePicker({ value, onChange, placeholder = 'Select date', className, minDate, maxDate }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value || new Date());
  const ref = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Follow an externally-controlled value: when the parent sets/changes the
  // selected date, jump the visible month to match (previously the calendar
  // stayed on whatever month it opened with).
  useEffect(() => {
    if (value) setViewDate(value);
  }, [value]);

  // Roving arrow-key navigation across the day grid.
  const onGridKey = (e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const btns = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>('button[data-day]') || []);
    const idx = btns.findIndex((b) => b === document.activeElement);
    if (idx < 0) return;
    e.preventDefault();
    const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : 7;
    const next = idx + delta;
    if (next >= 0 && next < btns.length) btns[next].focus();
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const pick = (day: number) => {
    const d = new Date(year, month, day);
    onChange?.(d);
    setOpen(false);
  };

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all"
      >
        <Calendar size={14} className="text-slate-400" />
        {value ? formatDate(value) : placeholder}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-900/10 p-4 z-50 animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Previous month"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <div className="text-sm font-bold text-slate-900">
              {MONTHS[month]} {year}
            </div>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Next month"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-slate-400 uppercase py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div ref={gridRef} onKeyDown={onGridKey} className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const thisDate = new Date(year, month, day);
              const isToday = isSameDay(thisDate, today);
              const isSelected = value && isSameDay(thisDate, value);
              const isDisabled =
                (minDate && thisDate < minDate) || (maxDate && thisDate > maxDate);
              return (
                <button
                  key={day}
                  type="button"
                  data-day={day}
                  disabled={isDisabled}
                  onClick={() => pick(day)}
                  className={cn(
                    'h-9 rounded-lg text-xs font-semibold transition-all',
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30'
                      : isToday
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      : 'text-slate-700 hover:bg-slate-100',
                    isDisabled && 'opacity-30 cursor-not-allowed hover:bg-transparent'
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                onChange?.(new Date());
                setOpen(false);
              }}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-bold text-slate-500 hover:text-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
