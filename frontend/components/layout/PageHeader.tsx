import { ReactNode } from 'react';

/**
 * Consistent, responsive page heading used across dashboard pages.
 *
 * Mobile:  title/subtitle stacked on top, actions on their own row below
 *          (wrapping if needed) — no cramped squeeze against the buttons.
 * Desktop: title on the left, actions right-aligned on the same row.
 *
 * Keeping this in one place means every page gets the same gradient title,
 * spacing and breakpoints instead of each re-implementing the flex header.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#06D4B8] to-[#06B6D4] bg-clip-text text-transparent tracking-tight truncate">
          {title}
        </h1>
        {subtitle != null && (
          <p className="text-sm text-slate-500 mt-0.5 sm:mt-1">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:justify-end sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
