'use client';

import { ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Selection action bar — appears above a table when one or more rows are
 * selected. Presentational: the parent owns the selection set and passes the
 * count, the actions (as children), and a clear handler.
 */
export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  if (count <= 0) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 animate-slide-up">
      <span className="text-sm font-bold text-emerald-800">
        <span className="text-emerald-600">{count}</span> selected
      </span>
      <div className="flex-1 min-w-0" />
      <div className="flex items-center gap-1.5 flex-wrap">{children}</div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="w-7 h-7 flex items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-100 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
