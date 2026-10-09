// Razorpay payment bridge.
//
//   subscribeToPlan(planCode, billingCycle, savePaymentMethod?)
//     → /payments/checkout → native Razorpay modal → /payments/verify
//
// Uses the `react-native-razorpay` native module. The module ships
// native code so the app must be a development build (or production EAS
// build) — it will not work in Expo Go. We lazy-require so the app boots
// either way and falls back gracefully.

import { Alert } from 'react-native';
import { paymentApi } from './api';

type CheckoutResponse = {
  order: { id: string; amount: number; currency: string; stub?: boolean };
  keyId: string;
  customerId?: string | null;
  plan?: { code: string; name: string; amount: number };
  prefill: { email: string; name: string; contact?: string };
};

function loadRazorpay(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-razorpay').default;
  } catch {
    return null;
  }
}

function buildOptions(co: CheckoutResponse, name: string, description: string) {
  return {
    description,
    image: 'https://kartriq.vercel.app/og-image.png',
    currency: co.order.currency,
    key: co.keyId,
    amount: co.order.amount,        // already in paise from backend
    order_id: co.order.id,
    name,
    customer_id: co.customerId || undefined,
    prefill: {
      email: co.prefill.email,
      contact: co.prefill.contact || '',
      name: co.prefill.name,
    },
    theme: { color: '#06D4B8' },
  };
}

/**
 * Upgrade / change subscription plan via Razorpay.
 *
 * `savePaymentMethod` (default true) saves the card so the backend autopay
 * job can charge it for the next billing period. We propagate the same flag
 * as `autoRenew` to the verify endpoint so the subscription is flagged
 * autoRenew=true the moment the first charge succeeds.
 */
export async function subscribeToPlan(
  planCode: string,
  billingCycle: 'MONTHLY' | 'YEARLY' = 'MONTHLY',
  savePaymentMethod = true,
) {
  let co: CheckoutResponse;
  try {
    const r = await paymentApi.checkout({ planCode, billingCycle, savePaymentMethod });
    co = r.data;
  } catch (err: any) {
    Alert.alert('Checkout failed', err?.response?.data?.error || err.message);
    return { ok: false };
  }

  // Stub mode (no Razorpay creds on backend) — finalise instantly so dev
  // environments still work.
  if (co.order?.stub) {
    try {
      await paymentApi.verify({
        razorpay_order_id: co.order.id,
        razorpay_payment_id: `pay_stub_${Date.now()}`,
        razorpay_signature: 'stub',
        planCode,
        billingCycle,
        autoRenew: savePaymentMethod,
      });
      Alert.alert('Plan switched (dev)', `${co.plan?.name || planCode} active.`);
      return { ok: true, dev: true };
    } catch (err: any) {
      Alert.alert('Failed', err?.response?.data?.error || err.message);
      return { ok: false };
    }
  }

  const RazorpayCheckout = loadRazorpay();
  if (!RazorpayCheckout) {
    Alert.alert(
      'Razorpay not available',
      'Run `npx expo install react-native-razorpay` and rebuild the dev client to enable in-app payments.'
    );
    return { ok: false };
  }

  try {
    const result: any = await RazorpayCheckout.open(buildOptions(co, 'Kartriq', `${co.plan?.name || planCode} (${billingCycle})`));
    await paymentApi.verify({
      razorpay_order_id: result.razorpay_order_id,
      razorpay_payment_id: result.razorpay_payment_id,
      razorpay_signature: result.razorpay_signature,
      planCode,
      billingCycle,
      autoRenew: savePaymentMethod,
    });
    Alert.alert('Subscription updated', `You're now on ${co.plan?.name || planCode}${savePaymentMethod ? ' with auto-renew on' : ''}.`);
    return { ok: true };
  } catch (err: any) {
    if (err?.code === 0 || err?.code === 'PAYMENT_CANCELLED') return { ok: false, cancelled: true };
    Alert.alert('Payment failed', err?.description || err?.message || 'Unknown error');
    return { ok: false };
  }
}
