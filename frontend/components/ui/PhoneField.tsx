'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  usePhoneInput,
  defaultCountries,
  parseCountry,
  FlagImage,
  type ParsedCountry,
} from 'react-international-phone';
import 'react-international-phone/style.css';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhoneFieldProps {
  label?: ReactNode;
  hint?: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  defaultCountry?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Phone input with country flag selector and a custom searchable dropdown.
 * Composed from react-international-phone primitives (usePhoneInput hook +
 * FlagImage component) so we own all of the UI in pure Tailwind.
 *
 * Returns the value in E.164 format (e.g. "+919876543210").
 * Use isPhoneEmpty(value) to treat just-the-dial-code as absent.
 * Use validatePhone(value, { required }) for submit-time validation.
 */
export function PhoneField({
  label,
  hint,
  error,
  value,
  onChange,
  defaultCountry = 'in',
  disabled,
  required,
  placeholder = 'Phone number',
  className,
}: PhoneFieldProps) {
  // All countries (parsed once)
  const countries = useMemo<ParsedCountry[]>(
    () => defaultCountries.map((c) => parseCountry(c)),
    []
  );

  const { inputValue, country, setCountry, inputRef, handlePhoneValueChange } =
    usePhoneInput({
      defaultCountry,
      value,
      forceDialCode: true,
      onChange: (data) => onChange(data.phone),
    });

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Close dropdown on outside click + Esc
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    // Auto-focus the search input on open
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  // Reset search when dropdown closes
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return countries;
    const numericQ = q.replace(/\D/g, '');
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.iso2.toLowerCase().includes(q) ||
        (numericQ && c.dialCode.includes(numericQ))
    );
  }, [countries, search]);

  return (
    <div className={cn('w-full', className)} ref={wrapperRef}>
      {label && (
        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}
      <div
        className={cn(
          'relative flex w-full items-stretch rounded-xl border bg-white transition-all duration-200',
          'border-slate-200 hover:border-slate-300',
          'focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:border-emerald-400',
          error && 'border-rose-300 focus-within:ring-rose-500/10 focus-within:border-rose-400',
          disabled && 'opacity-60 cursor-not-allowed'
        )}
      >
        {/* Country button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-label={`Select country (current: ${country.name})`}
          aria-expanded={open}
          className={cn(
            'flex items-center gap-1.5 pl-3 pr-2 border-r border-slate-100',
            'hover:bg-slate-50 transition-colors',
            'focus:outline-none focus-visible:bg-slate-50 rounded-l-xl'
          )}
        >
          <FlagImage iso2={country.iso2} size={20} />
          <ChevronDown
            size={14}
            className={cn(
              'text-slate-400 transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>

        {/* Phone input */}
        <input
          ref={inputRef}
          type="tel"
          value={inputValue}
          onChange={handlePhoneValueChange}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 min-w-0 bg-transparent border-0 px-3 py-2.5 text-sm text-slate-900 tracking-wide placeholder:text-slate-400 focus:outline-none focus:ring-0"
        />

        {/* Dropdown */}
        {open && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
              <Search size={14} className="text-slate-400 flex-shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search for countries"
                className="flex-1 bg-transparent border-0 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
              />
            </div>
            {/* List */}
            <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
              {filtered.length === 0 && (
                <li className="px-3 py-4 text-sm text-slate-400 text-center">No countries match.</li>
              )}
              {filtered.map((c) => {
                const isSelected = c.iso2 === country.iso2;
                return (
                  <li key={c.iso2} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onClick={() => {
                        setCountry(c.iso2);
                        setOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors',
                        'hover:bg-slate-50',
                        isSelected
                          ? 'bg-emerald-50/70 text-emerald-700 font-semibold'
                          : 'text-slate-700'
                      )}
                    >
                      <FlagImage iso2={c.iso2} size={20} />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span
                        className={cn(
                          'text-xs font-medium',
                          isSelected
                            ? 'text-emerald-600/80'
                            : 'text-slate-500'
                        )}
                      >
                        (+{c.dialCode})
                      </span>
                      {isSelected && <Check size={14} className="text-emerald-600 ml-1" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      {hint && !error && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
      {error && <p className="text-xs text-rose-600 mt-1 font-medium">{error}</p>}
    </div>
  );
}

/**
 * Returns true if the value is an empty E.164 stub (just a dial code,
 * no actual subscriber digits). Useful for treating an unfilled optional
 * phone field as absent.
 */
export function isPhoneEmpty(value: string): boolean {
  if (!value) return true;
  const digits = value.replace(/\D/g, '');
  return digits.length <= 4;
}

/**
 * Validate an E.164 phone string. Empty input is allowed unless `required`.
 * Format check only (no carrier-specific length lookup) to keep the
 * bundle small. Returns null on success, or an error message string.
 */
export function validatePhone(value: string, opts: { required?: boolean } = {}): string | null {
  if (isPhoneEmpty(value)) {
    return opts.required ? 'Phone number is required' : null;
  }
  if (!/^\+\d{8,15}$/.test(value.replace(/[\s()-]/g, ''))) {
    return 'Enter a valid phone number with country code';
  }
  return null;
}
