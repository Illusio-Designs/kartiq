/**
 * Shared client-side validators for public-facing forms.
 *
 * Each function returns `null` on success or a human-readable error string
 * on failure, so a form can wire it up in a uniform way:
 *
 *   const errs: Record<string, string> = {};
 *   const e = validateEmail(form.email);
 *   if (e) errs.email = e;
 *
 * Every validator treats an empty value as valid by default — pass
 * `{ required: true }` to flip that.
 *
 * Phone validation lives in components/ui/PhoneField.tsx (validatePhone)
 * because it depends on E.164 parsing. Re-exported here for convenience.
 */

export { validatePhone, isPhoneEmpty } from '@/components/ui/PhoneField';

interface BaseOpts {
  required?: boolean;
}

/** Trim + non-empty check. */
export function validateRequired(value: string, fieldName = 'This field'): string | null {
  if (!value || !value.trim()) return `${fieldName} is required`;
  return null;
}

/** Free-text length check (for names, business names, subjects, etc.). */
export function validateText(
  value: string,
  opts: BaseOpts & { fieldName?: string; min?: number; max?: number } = {}
): string | null {
  const { required, fieldName = 'This field', min = 2, max = 200 } = opts;
  const v = (value || '').trim();
  if (!v) return required ? `${fieldName} is required` : null;
  if (v.length < min) return `${fieldName} is too short (min ${min} characters)`;
  if (v.length > max) return `${fieldName} is too long (max ${max} characters)`;
  return null;
}

/** RFC-5322-ish email format. Permissive but blocks the obvious garbage. */
export function validateEmail(value: string, opts: BaseOpts = {}): string | null {
  const v = (value || '').trim();
  if (!v) return opts.required ? 'Email is required' : null;
  if (v.length > 254) return 'Email is too long';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email address';
  return null;
}

/**
 * GSTIN — the Indian Goods & Services Tax identifier.
 * Format: 15 chars, e.g. 22AAAAA0000A1Z5
 *   2 digits state code + 10-char PAN (5 letters, 4 digits, 1 letter)
 *   + 1 entity number + 'Z' literal + 1 check digit/letter.
 */
export function validateGstin(value: string, opts: BaseOpts = {}): string | null {
  const v = (value || '').trim().toUpperCase();
  if (!v) return opts.required ? 'GSTIN is required' : null;
  if (v.length !== 15) return 'GSTIN must be 15 characters';
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v)) {
    return 'Enter a valid GSTIN (e.g. 22AAAAA0000A1Z5)';
  }
  return null;
}

/**
 * Password strength: minimum 8 chars with at least one letter and one digit.
 * Blocks the most common weak-password patterns without being annoying.
 */
export function validatePassword(value: string, opts: BaseOpts = {}): string | null {
  if (!value) return opts.required ? 'Password is required' : null;
  if (value.length < 12) return 'Password must be at least 12 characters';
  if (value.length > 128) return 'Password is too long';
  if (!/[a-z]/.test(value)) return 'Password needs a lower-case letter';
  if (!/[A-Z]/.test(value)) return 'Password needs an upper-case letter';
  if (!/\d/.test(value)) return 'Password needs a number';
  if (!/[^A-Za-z0-9]/.test(value)) return 'Password needs a special character (for example ! @ # $ %)';
  return null;
}

/** Confirm-password field — must match the original. */
export function validatePasswordMatch(value: string, original: string): string | null {
  if (!value) return 'Please confirm your password';
  if (value !== original) return 'Passwords do not match';
  return null;
}

/**
 * Convenience: run a list of [field, error|null] tuples and return the
 * resulting record. The form can do:
 *
 *   const errs = collectErrors([
 *     ['name',  validateRequired(form.name, 'Name')],
 *     ['email', validateEmail(form.email, { required: true })],
 *   ]);
 *   setErrors(errs);
 *   if (Object.keys(errs).length) return;
 */
export function collectErrors<K extends string>(
  pairs: Array<[K, string | null]>
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const [key, err] of pairs) {
    if (err) out[key] = err;
  }
  return out;
}
