/**
 * Global runtime overrides — imported ONCE at the top of app/_layout.tsx
 * before any other code runs. Two side effects:
 *
 *   1. Alert.alert(title, message, buttons) is intercepted so every
 *      existing call site in the codebase (and any inside third-party
 *      libraries) renders our branded <AppAlert /> modal instead of
 *      the OS's generic system dialog. The API signature is preserved
 *      so no call site needs to change.
 *
 *   2. RN's <Text> and <TextInput> are render-patched so every instance
 *      — even ones with no className / style — gets `fontFamily: 'Poppins'`
 *      as the FIRST entry in its style array. A user-provided style still
 *      overrides because RN merges styles left-to-right with later wins,
 *      so a heading can opt into Agency via the `font-agency` utility.
 *      Why patch render instead of defaultProps: on RN 0.81 / React 19,
 *      Text and TextInput are forwardRef function components and
 *      defaultProps no longer propagates to function components.
 *
 * Both overrides are idempotent — guarded by a module-level flag, so a
 * Fast Refresh re-run doesn't double-wrap.
 */

import React from 'react';
import { Alert, Text, TextInput } from 'react-native';
import { appAlert } from './alert';

let installed = false;

export function installGlobalOverrides() {
  if (installed) return;
  installed = true;

  // ── 1. Alert.alert → appAlert ─────────────────────────────────────
  // Same signature: (title, message?, buttons?, options?). We ignore
  // `options` (iOS-only `userInterfaceStyle` / `cancelable` etc.) —
  // the branded modal handles those concerns its own way.
  (Alert as any).alert = (
    title: string,
    message?: string,
    buttons?: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }>,
  ) => {
    appAlert(title, message, buttons);
  };

  // ── 2. Text / TextInput global font ───────────────────────────────
  const FONT_STYLE = { fontFamily: 'Poppins' };

  // Wrap the existing render so the override is non-destructive. If RN
  // ever upgrades to a different internal shape (functional component
  // without `.render`), the try/catch keeps the app booting.
  function patchRender(Component: any, label: string) {
    try {
      const originalRender = Component.render;
      if (typeof originalRender !== 'function') return; // not a forwardRef
      Component.render = function patchedRender(...args: any[]) {
        const element = originalRender.apply(this, args);
        if (!React.isValidElement(element)) return element;
        const userStyle = (element.props as any).style;
        const next = Array.isArray(userStyle)
          ? [FONT_STYLE, ...userStyle]
          : userStyle
            ? [FONT_STYLE, userStyle]
            : FONT_STYLE;
        return React.cloneElement(element, { style: next } as any);
      };
    } catch (e) {
      console.warn(`[overrides] could not patch ${label}.render:`, (e as Error)?.message);
    }
  }

  patchRender(Text, 'Text');
  patchRender(TextInput, 'TextInput');
}
