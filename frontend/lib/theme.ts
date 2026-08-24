// Theme preference: what the user picked. 'system' follows the OS setting,
// which is also the default when nothing has been stored yet.
export type ThemePref = 'light' | 'dark' | 'system';

export const THEME_KEY = 'kartriq-theme';

export function getStoredTheme(): ThemePref {
  if (typeof window === 'undefined') return 'system';
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* private mode / storage disabled — fall through to system */
  }
  return 'system';
}

export function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** Resolve a preference to an actual light/dark decision. */
export function resolveDark(pref: ThemePref): boolean {
  return pref === 'dark' || (pref === 'system' && systemPrefersDark());
}

/** Apply a preference to <html>: toggles `.dark` and the native color-scheme. */
export function applyTheme(pref: ThemePref): void {
  if (typeof document === 'undefined') return;
  const dark = resolveDark(pref);
  const el = document.documentElement;
  el.classList.toggle('dark', dark);
  // Drives native form controls, scrollbars and the browser UI to match.
  el.style.colorScheme = dark ? 'dark' : 'light';
}

// Runs inline in <head> BEFORE first paint so the correct theme is on the
// <html> element before React hydrates — this is what prevents a flash of the
// wrong theme (FOUC). Kept tiny and wrapped in try/catch so a storage error
// can never block rendering. Default (no stored value) follows the OS.
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
