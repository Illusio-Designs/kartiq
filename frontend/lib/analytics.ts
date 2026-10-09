/**
 * Tiny analytics dispatcher — fires the same custom event into every
 * loaded analytics tool at once (Clarity + GA4 + Facebook Pixel today).
 * Each call is a NO-OP when the underlying SDK isn't loaded — either
 * because the visitor declined cookies, the script hasn't initialised
 * yet, or no ID is configured for that tool — so callers don't need
 * to guard.
 *
 *   import { track, tag, upgradeSession } from '@/lib/analytics';
 *   track('demo_request_submit', { source: 'pricing', value: 0, currency: 'INR' });
 *   tag('user_type', 'tenant');     // pins this on the Clarity session
 *
 * Meta's Pixel has a closed vocabulary of "standard events" (Lead,
 * Contact, CompleteRegistration, Subscribe, Purchase, ...). Our app
 * events use their own snake_case names; the FB_MAP below translates.
 * Anything without a mapping skips FB entirely so we never spam
 * Events Manager with no-op rows.
 *
 * IMPORTANT: Meta auto-event detection ("autoConfig") is disabled in
 * Analytics.tsx, so FB Pixel will ONLY record events fired through
 * this dispatcher — no more Subscribe / Lead being attributed to
 * stray button clicks just because Meta's heuristic guessed at them.
 */

type ClarityCommand =
  | ['event', string]
  | ['set', string, string]
  | ['upgrade', string]
  | ['identify', string, string?, string?, string?];

declare global {
  interface Window {
    clarity?: (...args: any[]) => void;
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
  }
}

// App-event → Meta-standard-event mapping. Each entry can also emit a
// secondary event when one user action maps to two meaningful Meta
// events (e.g. signup is both CompleteRegistration AND StartTrial on
// a SaaS that auto-enrols every signup into a free trial).
const FB_MAP: Record<string, string | string[]> = {
  // Top-of-funnel
  demo_open:            'Lead',
  demo_request_submit:  'Lead',
  contact_form_submit:  'Contact',
  // Acquisition
  signup_complete:      ['CompleteRegistration', 'StartTrial'],
  // Monetisation — plan upgrades. Pass {value, currency} in params so
  // Meta can attribute ad spend ROI correctly.
  checkout_started:     'InitiateCheckout',
  plan_purchased:       ['Subscribe', 'Purchase'],
};

function safeClarity(...args: any[]) {
  try {
    if (typeof window !== 'undefined' && typeof window.clarity === 'function') {
      window.clarity(...args);
    }
  } catch { /* swallow — analytics never breaks the call site */ }
}

function safeGtag(...args: any[]) {
  try {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag(...args);
    }
  } catch { /* swallow */ }
}

function safeFbq(...args: any[]) {
  try {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq(...args);
    }
  } catch { /* swallow */ }
}

/**
 * Fire a custom event into every loaded analytics tool.
 *
 * @param name  — short snake_case identifier (e.g. "demo_request_submit").
 *                Will appear as a filterable event name in Clarity dashboards
 *                and as the GA4 event name.
 * @param params — flat key/value object. GA4 records each as an event
 *                 parameter; Clarity's `event` API doesn't take params, so
 *                 we additionally `set` each pair as a session tag for
 *                 filtering recordings.
 */
export function track(name: string, params?: Record<string, string | number | boolean>) {
  // Clarity — event + per-param session tags for filterable recordings.
  safeClarity('event', name);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      safeClarity('set', k, String(v));
    }
  }

  // GA4 — single event with the params attached as event parameters.
  safeGtag('event', name, params || {});

  // Facebook Pixel — only if this app event maps to a Meta standard
  // event. We also forward `value` / `currency` / `content_name` etc.
  // when present; Meta uses those to attribute ad-spend ROI.
  const mapped = FB_MAP[name];
  if (mapped) {
    const fbParams = sanitiseFbParams(name, params);
    const list = Array.isArray(mapped) ? mapped : [mapped];
    for (const evt of list) safeFbq('track', evt, fbParams);
  }
}

// Strip params Meta doesn't recognise and ensure value/currency are
// numbers/strings where Meta expects them. Adds `content_name` =
// our internal event name so a single mapped FB event (e.g. Lead) is
// still distinguishable in Events Manager.
//
// IMPORTANT: only forward `value` when the caller explicitly passed a
// non-null one. Sending `value: 0` on a Lead / Contact / valueless
// event makes Meta treat it as a free purchase, which silently skews
// ad-spend ROI attribution. Same logic for currency — only sent when
// value is sent.
function sanitiseFbParams(eventName: string, params?: Record<string, any>) {
  const out: Record<string, any> = { content_name: eventName };
  if (!params) return out;
  const rawValue = params.value;
  if (rawValue !== undefined && rawValue !== null && !Number.isNaN(Number(rawValue))) {
    out.value = Number(rawValue);
    if (params.currency !== undefined && params.currency !== null) {
      out.currency = String(params.currency);
    } else {
      out.currency = 'INR';
    }
  }
  if (params.source !== undefined && params.source !== null) {
    out.source = String(params.source);
  }
  return out;
}

/**
 * Pin a session-level tag (Clarity) / user property (GA4). Useful for
 * segmenting recordings — e.g. tag every authenticated session with
 * the user's role so you can filter Clarity recordings by "STAFF".
 */
export function tag(key: string, value: string | number | boolean) {
  safeClarity('set', key, String(value));
  safeGtag('set', 'user_properties', { [key]: String(value) });
}

/**
 * Mark the current Clarity recording as worth preserving. Free-tier
 * Clarity is sample-based, so flagging high-value sessions (paying
 * tenant signup, checkout flow, support escalation) makes sure the
 * recording isn't dropped.
 */
export function upgradeSession(reason: string) {
  safeClarity('upgrade', reason);
}
