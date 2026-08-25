'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Debounced, in-page search input with a leading icon, a clear button, and an
 * optional keyboard-shortcut hint. Distinct from the global topbar search —
 * this is scoped to whatever list it's placed above.
 */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  debounce = 250,
  shortcut,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  debounce?: number;
  shortcut?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  // Keep in sync when the value is reset from outside (e.g. "Clear all").
  useEffect(() => { setLocal(value); }, [value]);
  // Debounce upward so we don't re-filter on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { if (local !== value) onChange(local); }, debounce);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <div className={cn('relative', className)}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 text-sm bg-white text-slate-900 border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 placeholder:text-slate-400 transition-all"
      />
      {local ? (
        <button
          type="button"
          onClick={() => { setLocal(''); onChange(''); }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-md transition-colors"
        >
          <X size={13} />
        </button>
      ) : shortcut ? (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 pointer-events-none">
          {shortcut}
        </span>
      ) : null}
    </div>
  );
}
