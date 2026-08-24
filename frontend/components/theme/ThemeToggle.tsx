'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  ThemePref,
  THEME_KEY,
  getStoredTheme,
  applyTheme,
} from '@/lib/theme';

const ORDER: ThemePref[] = ['light', 'dark', 'system'];
const META: Record<ThemePref, { Icon: typeof Sun; label: string }> = {
  light: { Icon: Sun, label: 'Light' },
  dark: { Icon: Moon, label: 'Dark' },
  system: { Icon: Monitor, label: 'System' },
};

/**
 * Shared theme state. Reads the stored preference on mount, keeps the DOM in
 * sync, and — while on `system` — reacts to the OS switching light/dark.
 */
function useThemePref() {
  const [pref, setPref] = useState<ThemePref>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPref(getStoredTheme());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    // Only re-apply automatically while the user is on the "system" setting.
    const onChange = () => { if (getStoredTheme() === 'system') applyTheme('system'); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mounted]);

  const set = useCallback((next: ThemePref) => {
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
    applyTheme(next);
    setPref(next);
  }, []);

  return { pref, mounted, set };
}

/** Compact cycling icon button — used in the topbar. */
export function ThemeToggle() {
  const { pref, mounted, set } = useThemePref();

  if (!mounted) {
    // Reserve the slot so the topbar layout doesn't shift after hydration.
    return <div className="w-10 h-10" aria-hidden />;
  }

  const { Icon, label } = META[pref];
  const cycle = () => set(ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]);

  return (
    <Tooltip content={`Theme: ${label}`} side="bottom">
      <button
        type="button"
        onClick={cycle}
        aria-label={`Theme: ${label}. Click to change.`}
        className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
      >
        <Icon size={18} />
      </button>
    </Tooltip>
  );
}

/** Segmented Light / Dark / System control — used on the settings page. */
export function ThemeSegmented() {
  const { pref, mounted, set } = useThemePref();

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-1">
      {ORDER.map((opt) => {
        const { Icon, label } = META[opt];
        const active = mounted && pref === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => set(opt)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              active
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        );
      })}
    </div>
  );
}
