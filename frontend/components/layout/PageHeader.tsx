import { ReactNode } from 'react';

/**
 * Slim, responsive page sub-heading used across dashboard pages.
 *
 * The big page title now lives left-aligned in the Topbar (derived from the
 * route), which frees the vertical space the old gradient <h1> occupied. So
 * this component keeps only the optional subtitle + action buttons, plus an
 * sr-only <h1> so each page still has a proper document heading for
 * accessibility. When a page passes neither a subtitle nor actions, nothing
 * visible is rendered (just the sr-only heading).
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
  const hasVisibleRow = subtitle != null || actions != null;
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      {hasVisibleRow && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          {subtitle != null ? (
            <p className="text-sm text-slate-500 min-w-0">{subtitle}</p>
          ) : (
            <span className="hidden sm:block" />
          )}
          {actions && (
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:justify-end sm:shrink-0">
              {actions}
            </div>
          )}
        </div>
      )}
    </>
  );
}
