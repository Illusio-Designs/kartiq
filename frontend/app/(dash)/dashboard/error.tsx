'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { segment: 'dashboard' } });
  }, [error]);

  return (
    <div className="p-8">
      <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-6 text-center">
        <h2 className="text-lg font-bold text-slate-900">Couldn't load this page</h2>
        <p className="mt-1 text-sm text-slate-500">
          Something went wrong while fetching data. You can try again or head back to the dashboard.
        </p>
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
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
