'use client';

import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select } from './Select';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function Pagination({
  page, pageSize, total, onPageChange, onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100], className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Build page list with ellipsis
  const pages: (number | '…')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('…');
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  return (
    <div className={cn('flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3', className)}>
      <div className="flex items-center gap-3 text-xs text-slate-500 order-2 sm:order-1">
        <span>
          Showing <span className="font-bold text-slate-900">{from}–{to}</span> of{' '}
          <span className="font-bold text-slate-900">{total}</span>
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="hidden sm:inline">Rows:</span>
            <Select
              size="sm"
              value={String(pageSize)}
              onChange={(v) => onPageSizeChange(Number(v))}
              options={pageSizeOptions.map((s) => ({ value: String(s), label: String(s) }))}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 order-1 sm:order-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={15} />
        </button>

        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="w-9 h-9 flex items-center justify-center text-slate-400">
              <MoreHorizontal size={14} />
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={cn(
                'w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold transition-all',
                p === page
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
