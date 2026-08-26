'use client';

// Shared error/loading shells used by app/<segment>/error.tsx and loading.tsx.
// Each segment file is required to live next to the route — these components
// keep them one-liners.
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export function SegmentError({
  error,
  reset,
  segment,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  segment: string;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { segment } });
  }, [error, segment]);

  return (
    <div className="p-8 max-w-md mx-auto text-center">
      <h2 className="text-lg font-bold text-slate-900">Couldn't load {segment}</h2>
      <p className="mt-1 text-sm text-slate-500">Please retry. If this keeps happening, contact support.</p>
      {error.digest && (
        <p className="mt-2 text-xs font-mono text-slate-400">Ref: {error.digest}</p>
      )}
      <div className="mt-5 flex gap-2 justify-center">
        <button
          onClick={reset}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-full"
        >
          Retry
        </button>
        <a
          href="/dashboard"
          className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-full hover:bg-slate-50"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}

export function SegmentLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="p-8 animate-pulse"
    >
      <div className="h-7 w-48 bg-slate-100 rounded mb-3" />
      <div className="h-4 w-72 bg-slate-100 rounded mb-8" />
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-50 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
