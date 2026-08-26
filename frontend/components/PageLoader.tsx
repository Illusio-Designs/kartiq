'use client';

import { useEffect, useState } from 'react';

export function PageLoader() {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFadeOut(true), 600);
    const remove = setTimeout(() => setVisible(false), 1200);
    return () => { clearTimeout(timer); clearTimeout(remove); };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-white dark:bg-slate-950 transition-all duration-500 ${
        fadeOut ? 'opacity-0 scale-105' : 'opacity-100 scale-100'
      }`}
    >
      <span className="sr-only">Loading</span>
      <div className="flex flex-col items-center gap-5">
        {/* Brand mark */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-600 shadow-lg shadow-emerald-500/30 animate-pulse-soft flex items-center justify-center">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="text-white">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {/* Wave bars */}
        <div className="kq-wave" style={{ gap: 5, height: 34 }} aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <i key={i} style={{ width: 5, height: 34 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
