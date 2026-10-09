'use client';

import { FlaskConical } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

/**
 * Shown on every dashboard page ONLY for the sandbox demo tenant, so nobody
 * mistakes it for a real account: the Amazon channel here is fake, labels are
 * stamped DEMO, and nothing reaches a real marketplace.
 */
export function DemoBanner() {
  const isDemo = useAuthStore((s) => !!s.tenant?.isDemo);
  if (!isDemo) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <FlaskConical size={16} className="mt-0.5 shrink-0 text-amber-600" />
      <div>
        <b>Demo sandbox.</b> The Amazon account here is fake: nothing is sent to Amazon, no real money is used, and labels are
        marked &ldquo;DEMO&rdquo;. Try the whole journey: <b>Channels → connect Amazon → Pull catalog → Sync orders → Confirm &amp; get label → Print</b>.
      </div>
    </div>
  );
}
