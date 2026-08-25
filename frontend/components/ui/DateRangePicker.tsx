'use client';

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Local YYYY-MM-DD — never toISOString (that shifts the day in +ve timezones).
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function parse(s: string): Date | null {
  return s ? new Date(`${s}T00:00:00`) : null;
}
function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function fmt(s: string): string {
  return new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Today', range: () => { const s = ymd(new Date()); return [s, s]; } },
  { label: 'Last 7 days', range: () => { const t = new Date(); const s = new Date(); s.setDate(t.getDate() - 6); return [ymd(s), ymd(t)]; } },
  { label: 'Last 30 days', range: () => { const t = new Date(); const s = new Date(); s.setDate(t.getDate() - 29); return [ymd(s), ymd(t)]; } },
  { label: 'This month', range: () => { const t = new Date(); const s = new Date(t.getFullYear(), t.getMonth(), 1); return [ymd(s), ymd(t)]; } },
];

/**
 * Single-control date-range picker: one popover with a calendar where you click
 * the start date, then the end date (the span highlights, with a hover preview),
 * plus quick presets. Emits YYYY-MM-DD strings; '' clears either end.
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = 'Any date',
  className,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(parse(from) || new Date());
  // While a start is chosen but the end isn't, the next click completes the range.
  const [pendingStart, setPendingStart] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setPendingStart(null); } };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  useEffect(() => { const f = parse(from); if (f) setViewDate(f); }, [from]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const fromD = parse(from);
  const toD = parse(to);
  // What to highlight: a committed range, or the pending start → hovered day.
  const rStart = pendingStart || fromD;
  const rEnd = pendingStart ? hover : toD;
  const lo = rStart && rEnd ? (rStart <= rEnd ? rStart : rEnd) : null;
  const hi = rStart && rEnd ? (rStart <= rEnd ? rEnd : rStart) : null;

  const pick = (day: number) => {
    const d = new Date(year, month, day);
    if (!pendingStart) {
      setPendingStart(d); setHover(null); onChange(ymd(d), '');
    } else if (d < atMidnight(pendingStart)) {
      setPendingStart(d); onChange(ymd(d), '');
    } else {
      onChange(ymd(pendingStart), ymd(d)); setPendingStart(null); setHover(null); setOpen(false);
    }
  };

  const active = !!(from || to);
  const label = from && to ? `${fmt(from)} – ${fmt(to)}` : from ? `From ${fmt(from)}` : to ? `Until ${fmt(to)}` : placeholder;

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl border transition-colors',
          active ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-700 bg-white border-slate-200 hover:border-slate-300'
        )}
      >
        <Calendar size={14} className={active ? 'text-emerald-600' : 'text-slate-400'} />
        {label}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-900/10 p-3 z-50 animate-slide-up">
          {/* Presets */}
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => { const [s, e] = p.range(); onChange(s, e); setPendingStart(null); }} className="px-2 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors">
                {p.label}
              </button>
            ))}
          </div>

          {/* Month header */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="Previous month" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600"><ChevronLeft size={16} aria-hidden="true" /></button>
            <div className="text-sm font-bold text-slate-900">{MONTHS[month]} {year}</div>
            <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="Next month" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600"><ChevronRight size={16} aria-hidden="true" /></button>
          </div>

          {/* Weekday row */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w, i) => <div key={i} className="text-center text-[10px] font-bold text-slate-400 uppercase py-1">{w}</div>)}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`b-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const d = new Date(year, month, day);
              const isToday = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
              const isLo = lo && d.getTime() === lo.getTime();
              const isHi = hi && d.getTime() === hi.getTime();
              const isStartOnly = pendingStart && d.getTime() === atMidnight(pendingStart).getTime();
              const inSpan = lo && hi && d >= lo && d <= hi;
              const isEdge = isLo || isHi || isStartOnly;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  onMouseEnter={() => pendingStart && setHover(d)}
                  className={cn(
                    'h-9 text-xs font-semibold transition-colors relative',
                    inSpan && !isEdge ? 'bg-emerald-50 text-emerald-700 rounded-none' : 'rounded-lg',
                    isEdge ? 'bg-emerald-600 text-white' : !inSpan && (isToday ? 'text-emerald-700 ring-1 ring-emerald-200 rounded-lg' : 'text-slate-700 hover:bg-slate-100 rounded-lg'),
                    isLo && hi ? 'rounded-l-lg' : '',
                    isHi && lo ? 'rounded-r-lg' : ''
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => { onChange('', ''); setPendingStart(null); setHover(null); }} className="text-xs font-bold text-slate-500 hover:text-slate-700">Clear</button>
            <span className="text-[11px] text-slate-400 font-medium">{pendingStart ? 'Pick an end date' : 'Pick a start date'}</span>
            <button type="button" onClick={() => { setOpen(false); setPendingStart(null); }} className="text-xs font-bold text-emerald-600 hover:text-emerald-700">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
