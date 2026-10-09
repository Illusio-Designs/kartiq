'use client';

import { useMemo, useState } from 'react';
import { bundledLogo, domainFor, logoDevUrl, iconHorseUrl, googleFaviconUrl, getChannelInitials } from '@/lib/channel-logos';
import { cn } from '@/lib/utils';

/**
 * The channel's real brand icon. Our own bundled copy first (always loads), then
 * logo.dev → icon.horse → Google favicon, and finally coloured initials.
 */
export function ChannelLogo({ type, name, className }: { type: string; name: string; className?: string }) {
  const own = bundledLogo(type);
  const [stage, setStage] = useState<number>(own ? -1 : 0); // -1 own file, 0..2 CDNs, 3 initials
  const domain = useMemo(() => domainFor(type, name), [type, name]);
  const src = stage === -1 ? own
    : stage === 0 ? logoDevUrl(domain)
    : stage === 1 ? iconHorseUrl(domain)
    : stage === 2 ? googleFaviconUrl(domain)
    : null;
  return (
    <div className={cn('w-9 h-9 rounded-lg bg-white border border-slate-100 dark:bg-slate-800 dark:border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} loading="lazy" decoding="async" referrerPolicy="no-referrer"
          className="w-full h-full object-contain p-1" onError={() => setStage((s) => s + 1)} />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-[11px] font-bold">
          {getChannelInitials(name)}
        </div>
      )}
    </div>
  );
}
