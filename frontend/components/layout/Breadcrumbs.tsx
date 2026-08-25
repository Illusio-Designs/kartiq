'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ChevronRight } from 'lucide-react';
import { labelForSegment as labelFor } from './routeLabels';

export function Breadcrumbs() {
  const pathname = usePathname() || '/';
  const parts = pathname.split('/').filter(Boolean);

  // Nothing useful to show on the dashboard root.
  if (parts.length === 0 || (parts.length === 1 && parts[0] === 'dashboard')) {
    return null;
  }

  // Build cumulative crumbs. The first "Home" always links to /dashboard.
  const crumbs = parts.map((seg, i) => ({
    label: labelFor(seg),
    href: '/' + parts.slice(0, i + 1).join('/'),
    last: i === parts.length - 1,
  }));

  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      {/* leading-none keeps the text box tight to the glyph; combined with
          items-center and a 0.5px optical nudge on the icons, the Home/chevron
          icons sit dead-centre against the labels (Inter renders slightly
          top-heavy, so the raw geometric centre looks a touch low). */}
      <ol className="flex items-center gap-1.5 text-xs font-semibold leading-none text-slate-400 overflow-x-auto whitespace-nowrap no-scrollbar">
        <li className="flex items-center flex-shrink-0">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 hover:text-slate-600 transition-colors">
            <Home size={14} className="shrink-0 relative -top-[0.5px]" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </li>
        {crumbs.map((c) => (
          <li key={c.href} className="flex items-center gap-1.5 min-w-0">
            <ChevronRight size={14} className="text-slate-300 shrink-0 relative -top-[0.5px]" />
            {c.last ? (
              <span className="text-slate-700 truncate max-w-[45vw] sm:max-w-none">{c.label}</span>
            ) : (
              <Link href={c.href} className="hover:text-slate-600 transition-colors truncate max-w-[30vw] sm:max-w-none">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
