'use client';

import { Rows3, Rows4 } from 'lucide-react';
import { Tooltip } from './Tooltip';

export type Density = 'comfortable' | 'compact';

/** Two-state row-density toggle for tables. */
export function DensityToggle({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  const opts: { key: Density; label: string; Icon: typeof Rows3 }[] = [
    { key: 'comfortable', label: 'Comfortable rows', Icon: Rows3 },
    { key: 'compact', label: 'Compact rows', Icon: Rows4 },
  ];
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
      {opts.map(({ key, label, Icon }) => (
        <Tooltip key={key} content={label} side="bottom">
          <button
            type="button"
            onClick={() => onChange(key)}
            aria-label={label}
            aria-pressed={value === key}
            className={`w-8 h-7 flex items-center justify-center rounded-md transition-colors ${
              value === key ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Icon size={14} />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
