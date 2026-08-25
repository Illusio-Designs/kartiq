// Theme preference: what the user picked. 'system' follows an automatic rule,
// which is also the default when nothing has been stored yet.
export type ThemePref = 'light' | 'dark' | 'system';

export const THEME_KEY = 'kartriq-theme';

// Public / marketing routes. On these, the 'system' preference resolves by
// TIME OF DAY (day → light, night → dark) instead of the OS setting, so the
// marketing site greets visitors with a theme that matches their local time.
// Inside the app (dashboard), 'system' follows the OS preference as usual.
const PUBLIC_RE =
  /^\/(?:$|about|features|pricing|solutions|integrations|contact|resources|privacy|terms|login|onboarding|accept-invite)(?:\/|$)/;

export function isPublicPath(path: string): boolean {
  return PUBLIC_RE.test(path);
}

/** Daytime window: 07:00–18:59 local time reads as "light". */
export function isDayTime(d: Date = new Date()): boolean {
  const h = d.getHours();
  return h >= 7 && h < 19;
}

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

/** Resolve a preference to an actual light/dark decision.
 *  For 'system' the rule depends on where we are:
 *   - public/marketing routes → time of day (night = dark)
 *   - app routes → OS preference
 *  An explicit 'light' / 'dark' choice always wins, everywhere. */
export function resolveDark(pref: ThemePref, pathname?: string): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  const path = pathname ?? (typeof location !== 'undefined' ? location.pathname : '');
  if (isPublicPath(path)) return !isDayTime();
  return systemPrefersDark();
}

/** Apply a preference to <html>: toggles `.dark` and the native color-scheme.
 *  Applies everywhere — the marketing pages are dark-aware too. */
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
// can never block rendering. Mirrors resolveDark() exactly: explicit choice
// wins; otherwise public routes go by time of day and app routes by OS.
export const THEME_INIT_SCRIPT = `(function(){try{var path=location.pathname;var pub=/^\\/(?:$|about|features|pricing|solutions|integrations|contact|resources|privacy|terms|login|onboarding|accept-invite)(?:\\/|$)/.test(path);var p=localStorage.getItem('${THEME_KEY}')||'system';var d;if(p==='dark'){d=true;}else if(p==='light'){d=false;}else if(pub){var h=new Date().getHours();d=!(h>=7&&h<19);}else{d=!!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);}var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
