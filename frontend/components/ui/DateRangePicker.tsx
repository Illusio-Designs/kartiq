'use client';

import { Calendar } from 'lucide-react';
import { Popover } from './Popover';
import { DatePicker } from './DatePicker';

// Local YYYY-MM-DD (never toISOString — that shifts the day in +ve timezones).
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Today', range: () => { const s = ymd(new Date()); return [s, s]; } },
  { label: 'Last 7 days', range: () => { const t = new Date(); const s = new Date(); s.setDate(t.getDate() - 6); return [ymd(s), ymd(t)]; } },
  { label: 'Last 30 days', range: () => { const t = new Date(); const s = new Date(); s.setDate(t.getDate() - 29); return [ymd(s), ymd(t)]; } },
  { label: 'This month', range: () => { const t = new Date(); const s = new Date(t.getFullYear(), t.getMonth(), 1); return [ymd(s), ymd(t)]; } },
];

function shortLabel(from: string, to: string): string {
  const fmt = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `From ${fmt(from)}`;
  if (to) return `Until ${fmt(to)}`;
  return 'Any date';
}

/**
 * One control for a from→to date range: quick presets plus two calendars for a
 * custom range. Replaces two standalone DatePickers + a manual guard. Emits
 * YYYY-MM-DD strings ('' to clear either end).
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  className,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}) {
  const active = !!(from || to);
  return (
    <Popover
      align="left"
      width="w-[300px]"
      className={className}
      trigger={
        <button
          type="button"
          className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl border transition-colors ${
            active
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : 'text-slate-700 bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <Calendar size={14} className={active ? 'text-emerald-600' : 'text-slate-400'} />
          {shortLabel(from, to)}
        </button>
      }
    >
      {(close) => (
        <div className="p-3 w-[300px]">
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { const [s, e] = p.range(); onChange(s, e); }}
                className="px-2 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">From</label>
              <DatePicker
                value={from ? new Date(from) : null}
                maxDate={to ? new Date(to) : undefined}
                placeholder="Start date"
                className="w-full"
                onChange={(d) => onChange(ymd(d), to)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">To</label>
              <DatePicker
                value={to ? new Date(to) : null}
                minDate={from ? new Date(from) : undefined}
                placeholder="End date"
                className="w-full"
                onChange={(d) => onChange(from, ymd(d))}
              />
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => onChange('', '')} className="text-xs font-bold text-slate-500 hover:text-slate-700">
              Clear
            </button>
            <button type="button" onClick={close} className="text-xs font-bold text-emerald-600 hover:text-emerald-700">
              Done
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
