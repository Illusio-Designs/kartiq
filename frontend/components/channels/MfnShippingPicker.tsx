'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { channelApi } from '@/lib/api';
import { cn } from '@/lib/utils';

export type MfnChoice = { mfnShipping: 'AMAZON' | 'OWN'; shippingProviderId: string | null };

// Couriers we can book through automatically (others come later).
export const SUPPORTED_COURIERS = ['ITHINK', 'SHIPROCKET', 'DELHIVERY', 'XPRESSBEES'];

/**
 * "How do orders that you ship yourself (MFN) work?" — Amazon arranges the courier,
 * or the seller's own courier partner (which must already be connected under Channels).
 */
export function MfnShippingPicker({
  value, onChange, disabled,
}: { value: MfnChoice; onChange: (v: MfnChoice) => void; disabled?: boolean }) {
  const { data } = useQuery({
    queryKey: ['channels', 'LOGISTICS'],
    queryFn: () => channelApi.list({ category: 'LOGISTICS' }).then((r) => r.data),
  });
  const list: any[] = Array.isArray(data) ? data : (data?.channels || []);
  const couriers = list.filter((c) => SUPPORTED_COURIERS.includes(c.type) && c.credentials);

  const Option = ({ id, title, text, active, onClick }: { id: string; title: string; text: string; active: boolean; onClick: () => void }) => (
    <button
      type="button"
      data-testid={`mfn-${id}`}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border p-4 transition',
        active ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' : 'border-slate-200 bg-white hover:border-slate-300',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 h-4 w-4 shrink-0 rounded-full border', active ? 'border-emerald-500 bg-emerald-500 ring-2 ring-white ring-inset' : 'border-slate-300')} />
        <div>
          <div className="text-sm font-bold text-slate-800">{title}</div>
          <p className="text-xs text-slate-500 mt-0.5">{text}</p>
        </div>
      </div>
    </button>
  );

  return (
    <div className="space-y-3">
      <Option
        id="amazon"
        title="Amazon arranges the courier"
        text="You confirm the order, Amazon books the courier and gives you the label. You just print it."
        active={value.mfnShipping === 'AMAZON'}
        onClick={() => onChange({ mfnShipping: 'AMAZON', shippingProviderId: null })}
      />
      <Option
        id="own"
        title="I use my own courier partner"
        text="You confirm the order, we book it with your courier (iThink, Shiprocket, Delhivery or Xpressbees) and get the label."
        active={value.mfnShipping === 'OWN'}
        onClick={() => onChange({ mfnShipping: 'OWN', shippingProviderId: value.shippingProviderId || couriers[0]?.id || null })}
      />
      {value.mfnShipping === 'OWN' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="mfn-couriers">
          {couriers.length ? (
            <>
              <div className="text-xs font-semibold text-slate-600 mb-2">Which courier partner?</div>
              <div className="flex flex-wrap gap-2">
                {couriers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ mfnShipping: 'OWN', shippingProviderId: c.id })}
                    className={cn('rounded-lg border px-3 py-1.5 text-xs font-semibold',
                      value.shippingProviderId === c.id ? 'border-emerald-500 bg-white text-emerald-700' : 'border-slate-200 bg-white text-slate-600')}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-amber-700">
              Your courier must be connected first.{' '}
              <Link href="/channels" className="font-semibold underline">Connect iThink, Shiprocket, Delhivery or Xpressbees under Channels</Link>
              , then come back here.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
