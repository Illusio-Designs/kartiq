import { ReactNode } from 'react';

/** Small keyboard-shortcut hint chip, e.g. <Kbd>/</Kbd> or <Kbd>⌘K</Kbd>. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center font-mono text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 leading-none">
      {children}
    </kbd>
  );
}
