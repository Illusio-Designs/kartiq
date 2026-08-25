'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { applyTheme, getStoredTheme } from '@/lib/theme';

// Re-applies the correct theme on every client-side navigation. `applyTheme`
// is route-aware (public/marketing/auth routes are forced light, the app keeps
// the stored preference), so this flips the theme correctly when moving between
// the dashboard and the marketing site without a full reload. The inline
// THEME_INIT_SCRIPT handles the very first paint; this handles SPA transitions.
export function ThemeRouter() {
  const pathname = usePathname();
  useEffect(() => {
    applyTheme(getStoredTheme());
  }, [pathname]);
  return null;
}
