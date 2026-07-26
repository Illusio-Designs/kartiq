'use client';

import { ReactNode, useRef } from 'react';
import { Bold, Italic, Heading, Link2, List, ListOrdered, Quote } from 'lucide-react';

interface MarkdownFieldProps {
  label?: ReactNode;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}

/**
 * Lightweight markdown editor — plain textarea + a toolbar that wraps the
 * selection (or inserts a stub) with markdown syntax. No runtime library
 * dependency, so the bundle stays small.
 *
 * Buttons supported:
 *   B  → **bold**
 *   I  → *italic*
 *   H  → # heading
 *   "  → > quote
 *   •  → - bullet list
 *   1. → 1. numbered list
 *   🔗 → [text](url)
 */
export function MarkdownField({
  label, hint, value, onChange, rows = 5, placeholder,
}: MarkdownFieldProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Wrap the current selection with `before` / `after`, or insert a stub.
  const wrap = (before: string, after = before, stub = 'text') => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || stub;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    // Restore selection inside the inserted slice
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  // Prepend a line-prefix (e.g. "# ", "- ") to the start of every selected
  // line — works even when the selection spans multiple lines.
  const prefixLines = (prefix: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    // Expand selection to whole lines
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = end;
    const block = value.slice(lineStart, lineEnd) || 'New item';
    const replaced = block.split(/\r?\n/).map((l) => (l ? prefix + l : l)).join('\n');
    const next = value.slice(0, lineStart) + replaced + value.slice(lineEnd);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(lineStart, lineStart + replaced.length);
    });
  };

  const insertLink = () => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || 'link text';
    const url = window.prompt('Link URL', 'https://');
    if (!url) return;
    const md = `[${selected}](${url})`;
    const next = value.slice(0, start) + md + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + 1, start + 1 + selected.length);
    });
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:border-emerald-400 transition-all">
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 bg-slate-50">
          <ToolBtn title="Heading" onClick={() => prefixLines('## ')}><Heading size={14} /></ToolBtn>
          <ToolBtn title="Bold (**text**)" onClick={() => wrap('**', '**', 'bold text')}><Bold size={14} /></ToolBtn>
          <ToolBtn title="Italic (*text*)" onClick={() => wrap('*', '*', 'italic text')}><Italic size={14} /></ToolBtn>
          <ToolBtn title="Link" onClick={insertLink}><Link2 size={14} /></ToolBtn>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <ToolBtn title="Bulleted list" onClick={() => prefixLines('- ')}><List size={14} /></ToolBtn>
          <ToolBtn title="Numbered list" onClick={() => prefixLines('1. ')}><ListOrdered size={14} /></ToolBtn>
          <ToolBtn title="Quote" onClick={() => prefixLines('> ')}><Quote size={14} /></ToolBtn>
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full px-4 py-2.5 text-sm bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none resize-y font-mono"
        />
      </div>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function ToolBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
    >
      {children}
    </button>
  );
}
