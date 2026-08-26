const { Router } = require('express');
const { v4: uuid } = require('uuid');
const prisma = require('../utils/prisma');

// Scrub axios/Razorpay error objects before logging — `err.config`,
// `err.request` and `err.response.config` echo the outgoing request body
// (which can include `key_id` headers) and Razorpay sometimes mirrors
// notes in the response. Returns a small object safe to console.error.
function safeErrLog(err) {
  if (!err) return err;
  return {
    name: err.name,
    message: err.message,
    code: err.code,
    status: err.response?.status,
    rzpDescription: err.error?.description || err.response?.data?.error?.description,
    rzpReason: err.error?.reason || err.response?.data?.error?.reason,
  };
}
const db = require('../utils/db');
const {
  authenticate, requireTenant, requirePermission, invalidateUserCache,
} = require('../middleware/auth.middleware');
const {
  createOrder, verifySignature, verifyWebhookSignature, getKeyId,
  createCustomer, applyTestMode,
} = require('../services/payment.service');
const wallet = require('../services/wallet.service');
const { audit } = require('../services/audit.service');
const { notifyTenant } = require('../services/notifications.service');
const { snapshotInvoiceForSubscription } = require('../jobs/billing.job');
const { idempotent } = require('../middleware/idempotency.middleware');

const router = Router();

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC WEBHOOK — Razorpay → us
// Mount BEFORE the authenticated middleware stack.
// ══════════════════════════════════════════════════════════════════════════
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'] || '';
    // Use the raw body captured by express.json's verify hook in index.js.
    // Falling back to a re-stringify means the HMAC can't match — so we
    // refuse instead of guessing.
    const rawBody = req.rawBody;
    if (!rawBody) {
      return res.status(400).json({ error: 'rawBody not captured' });
    }
    if (!(await verifyWebhookSignature(rawBody, signature))) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body?.event;
    const payload = req.body?.payload;
    const paymentEntity = payload?.payment?.entity;
    const orderEntity = payload?.order?.entity;
    const subEntity = payload?.subscription?.entity;
    const tokenEntity = paymentEntity?.token_id;
    const notes = paymentEntity?.notes || orderEntity?.notes || subEntity?.notes || {};

    // ── Successful payment captured (one-shot OR recurring) ───────────────
    if (event === 'payment.captured' || event === 'order.paid') {
      const tenantId = notes.tenantId;
      const subscriptionId = notes.subscriptionId;
      const invoiceId = notes.invoiceId;
      const purpose = notes.purpose; // 'plan' | 'wallet' | 'autopay'
      const amountInr = paymentEntity?.amount ? Number(paymentEntity.amount) / 100 : null;

      // Cross-check ownership before mutating: notes are signed by Razorpay
      // (we trust the signature) but the contents originated from /checkout
      // which wrote them at order creation. Still defence-in-depth: refuse
      // to update a record whose tenantId doesn't match the notes.
      if (invoiceId && tenantId) {
        const inv = await prisma.billingInvoice.findUnique({ where: { id: invoiceId } });
        if (inv && inv.tenantId === tenantId) {
          await prisma.billingInvoice.update({
            where: { id: invoiceId },
            data: { status: 'PAID', paidAt: new Date(), providerRef: paymentEntity?.id },
          });
        } else {
          console.warn('[payment.webhook] invoice tenant mismatch — refusing update:', { invoiceId, expectedTenant: tenantId, actualTenant: inv?.tenantId });
        }
      }
      if (subscriptionId && tenantId) {
        const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
        if (sub && sub.tenantId === tenantId) {
          await prisma.subscription.update({
            where: { id: subscriptionId },
            data: { status: 'ACTIVE', provider: 'razorpay' },
          });
        } else {
          console.warn('[payment.webhook] subscription tenant mismatch — refusing update:', { subscriptionId, expectedTenant: tenantId });
        }
      }
      if (tenantId) {
        await prisma.tenant.update({ where: { id: tenantId }, data: { status: 'ACTIVE' } });

        notifyTenant(tenantId, {
          type: 'payment.captured',
          category: 'payments',
          severity: 'success',
          title: amountInr
            ? `Payment received · ₹${amountInr.toLocaleString('en-IN')}`
            : 'Payment received',
          body: purpose === 'wallet'
            ? 'Wallet topped up — overage usage will draw from this balance.'
            : purpose === 'autopay'
              ? 'Auto top-up successful.'
              : 'Plan payment captured. Subscription is active.',
          link: '/billing',
          metadata: { paymentId: paymentEntity?.id, purpose, amountInr },
        });

        // Wallet top-ups (manual or autopay) flow through the webhook so the
        // ledger is the source of truth even if the client never returns.
        if (tenantId && (purpose === 'wallet' || purpose === 'autopay') && amountInr) {
          try {
            const existing = await db('wallet_transactions')
              .where({ tenantId, paymentRef: paymentEntity?.id }).first();
            if (!existing) {
              await wallet.topup(tenantId, amountInr, {
                paymentRef: paymentEntity?.id,
                description: purpose === 'autopay' ? 'Auto top-up (Razorpay)' : 'Top-up (Razorpay)',
                type: 'TOPUP',
              });
            }
          } catch (e) { console.warn('[payment.webhook] wallet topup credit failed:', e.message); }
        }

        // Persist the saved token if Razorpay returns one. Skip when we
        // don't have a customer_id — Razorpay rejects recurring charges
        // without one, so the row would be unusable anyway.
        if (tokenEntity && paymentEntity?.customer_id) {
          try {
            const customerId = paymentEntity.customer_id;
            // Idempotent on (tenantId, providerTokenId) via the unique index
            // pm_provider_token_unique. Pre-check + ER_DUP_ENTRY catch.
            const dupe = await db('tenant_payment_methods')
              .where({ tenantId, providerTokenId: tokenEntity }).first();
            if (!dupe) {
              const card = paymentEntity?.card || {};
              const upi = paymentEntity?.vpa || paymentEntity?.upi?.vpa;
              const id = uuid();
              try {
                await db('tenant_payment_methods').insert({
                  id,
                  tenantId,
                  provider: 'razorpay',
                  providerCustomerId: customerId,
                  providerTokenId: tokenEntity,
                  method: paymentEntity?.method || null,
                  brand: card.network || null,
                  last4: card.last4 || null,
                  expiryMonth: card.expiry_month || null,
                  expiryYear: card.expiry_year || null,
                  upiVpa: upi || null,
                  label: card.last4 ? `${card.network || 'Card'} •••• ${card.last4}` : (upi || 'Saved method'),
                  isDefault: 0,
                  isActive: 1,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });
              } catch (insErr) {
                if (insErr?.code !== 'ER_DUP_ENTRY' && !/Duplicate entry/.test(insErr?.message || '')) throw insErr;
              }
            }
          } catch (e) { console.warn('[payment.webhook] save token failed:', e.message); }
        }
      }
    }

    // ── Subscription lifecycle events ─────────────────────────────────────
    if (event === 'subscription.charged' && subEntity) {
      const tenantId = subEntity.notes?.tenantId;
      if (tenantId) {
        await prisma.subscription.update({
          where: { tenantId },
          data: { status: 'ACTIVE' },
        }).catch(() => {});
      }
    }
    if (event === 'subscription.halted' || event === 'subscription.cancelled') {
      const tenantId = subEntity?.notes?.tenantId;
      if (tenantId) {
        await prisma.subscription.update({
          where: { tenantId },
          data: { status: event === 'subscription.cancelled' ? 'CANCELLED' : 'PAST_DUE' },
        }).catch(() => {});
      }
    }

    // ── Failed payments ───────────────────────────────────────────────────
    if (event === 'payment.failed') {
      const sid = notes.subscriptionId;
      const tenantIdForFail = notes.tenantId;
      if (sid && tenantIdForFail) {
        const sub = await prisma.subscription.findUnique({ where: { id: sid } });
        if (sub && sub.tenantId === tenantIdForFail) {
          await prisma.subscription.update({ where: { id: sid }, data: { status: 'PAST_DUE' } }).catch(() => {});
        }
      }
      // Bump failure count on the saved method so autopay backs off — but
      // only update rows belonging to the tenant in the notes (defence in
      // depth in case two tenants ever share a token row).
      const tokenId = paymentEntity?.token_id;
      if (tokenId && tenantIdForFail) {
        await db('tenant_payment_methods')
          .where({ providerTokenId: tokenId, tenantId: tenantIdForFail })
          .update({
            failureCount: db.raw('failureCount + 1'),
            lastFailureAt: new Date(),
            lastFailureReason: paymentEntity?.error_description || 'Payment failed',
          })
          .catch(() => {});
      }

      // Notify the tenant owner — best-effort, never blocks the webhook ack.
      if (tenantIdForFail) {
        notifyTenant(tenantIdForFail, {
          type: 'payment.failed',
          category: 'payments',
          severity: 'error',
          title: 'Payment failed',
          body: paymentEntity?.error_description
            ? `Reason: ${paymentEntity.error_description}. Update your payment method to avoid suspension.`
            : 'A scheduled payment did not go through. Update your payment method to avoid suspension.',
          link: '/billing',
          metadata: { paymentId: paymentEntity?.id, reason: paymentEntity?.error_description || null },
        });
        try {
          const tenant = await prisma.tenant.findUnique({ where: { id: tenantIdForFail } });
          if (tenant?.ownerEmail) {
            const { sendPaymentFailed } = require('../services/email.service');
            await sendPaymentFailed({
              to: tenant.ownerEmail,
              name: tenant.ownerName || 'there',
              amount: ((paymentEntity?.amount || 0) / 100).toFixed(2),
              currency: paymentEntity?.currency || 'INR',
              reason: paymentEntity?.error_description || null,
            });
          }
        } catch (mailErr) {
          console.warn('[payment.webhook] failed-payment email failed:', mailErr.message);
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[payment.webhook]', safeErrLog(err));
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// AUTHENTICATED ROUTES
// ══════════════════════════════════════════════════════════════════════════
router.use(authenticate, requireTenant);

// ── Plan checkout: create Razorpay order for a plan upgrade ────────────────
router.post('/checkout', requirePermission('billing.manage'), idempotent(), async (req, res) => {
  try {
    const { planCode, billingCycle = 'MONTHLY', savePaymentMethod } = req.body;
    const plan = await prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const amount = Number(billingCycle === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice);
    const sub = await prisma.subscription.findUnique({ where: { tenantId: req.tenant.id } });

    let customerId = null;
    if (savePaymentMethod) {
      const customer = await createCustomer({
        name: req.user.name,
        email: req.user.email,
        contact: req.user.phone || undefined,
        notes: { tenantId: req.tenant.id },
      });
      customerId = customer.id;
    }

    const rzpOrder = await createOrder({
      amount, currency: plan.currency || 'INR',
      notes: {
        tenantId: req.tenant.id,
        subscriptionId: sub?.id || '',
        planCode: plan.code,
        billingCycle,
        purpose: 'plan',
      },
      customerId,
      savePaymentMethod: !!savePaymentMethod,
    });

    const keyId = (await getKeyId()) || rzpOrder.keyId;
    res.json({
      order: rzpOrder,
      keyId,
      customerId,
      plan: { code: plan.code, name: plan.name, amount },
      prefill: { email: req.user.email, name: req.user.name, contact: req.user.phone || '' },
    });
  } catch (err) {
    console.error('[payment.checkout]', safeErrLog(err));
    res.status(500).json({ error: err.message });
  }
});

// ── Verify a successful plan checkout ──────────────────────────────────────
router.post('/verify', requirePermission('billing.manage'), idempotent(), async (req, res) => {
  let { razorpay_order_id, razorpay_payment_id, razorpay_signature, planCode, billingCycle = 'MONTHLY', autoRenew } = req.body; // eslint-disable-line prefer-const

  const ok = await verifySignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });
  if (!ok) return res.status(400).json({ error: 'Signature mismatch' });

  // Derive the plan, cycle, and expected amount from the Razorpay ORDER notes
  // (server truth, set at checkout) — NEVER from the request body. Otherwise a
  // valid signature on a ₹1,499 order could be replayed with planCode:ENTERPRISE
  // to activate an expensive plan for a cheap payment.
  let effectivePlanCode = planCode;
  let effectiveCycle = billingCycle;
  try {
    const { getClient } = require('../services/payment.service');
    const client = await getClient();
    if (client) {
      const payment = await client.payments.fetch(razorpay_payment_id);
      if (!payment || payment.status !== 'captured') {
        return res.status(400).json({ error: 'Payment not captured at gateway' });
      }
      const order = await client.orders.fetch(razorpay_order_id).catch(() => null);
      const notes = order?.notes || payment?.notes || {};
      if (notes.tenantId && notes.tenantId !== req.tenant.id) {
        return res.status(403).json({ error: 'Payment belongs to a different tenant' });
      }
      if (notes.planCode) effectivePlanCode = notes.planCode;
      if (notes.billingCycle) effectiveCycle = notes.billingCycle;
      const notesPlan = await prisma.plan.findUnique({ where: { code: effectivePlanCode } });
      if (!notesPlan) return res.status(404).json({ error: 'Plan not found' });
      const expectedPaise = Math.round(Number(effectiveCycle === 'YEARLY' ? notesPlan.yearlyPrice : notesPlan.monthlyPrice) * 100);
      if (Number(payment.amount) !== expectedPaise) {
        return res.status(400).json({ error: 'Payment amount does not match the plan price' });
      }
    } else if (process.env.ALLOW_UNVERIFIED_PAYMENTS !== 'true') {
      // Fail closed unless a gateway is live (or an explicit test flag is set).
      return res.status(503).json({ error: 'Payment gateway not configured; cannot verify payment' });
    }
  } catch (err) {
    return res.status(400).json({ error: 'Failed to verify payment with gateway: ' + (err?.error?.description || err.message) });
  }

  const plan = await prisma.plan.findUnique({ where: { code: effectivePlanCode } });
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  billingCycle = effectiveCycle;
  const periodEnd = new Date();
  if (billingCycle === 'YEARLY') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const sub = await prisma.subscription.update({
    where: { tenantId: req.tenant.id },
    data: {
      planId: plan.id,
      billingCycle,
      status: 'ACTIVE',
      provider: 'razorpay',
      providerSubscriptionId: razorpay_order_id,
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
      // Auto-renew is enabled when the caller explicitly asked for it OR
      // when they ticked "save card" so we have a token to charge later.
      // Default to true on monthly if a token is being saved (the most common
      // expectation for monthly subscribers).
      ...(autoRenew !== undefined ? { autoRenew: !!autoRenew } : {}),
      lastRenewalError: null,
      renewalFailureCount: 0,
    },
    include: { plan: true },
  });

  // Snapshot a PAID invoice for this period
  try {
    const inv = await snapshotInvoiceForSubscription({ ...sub, plan }, new Date().toISOString().slice(0, 7));
    await prisma.billingInvoice.update({
      where: { id: inv.id },
      data: { status: 'PAID', paidAt: new Date(), providerRef: razorpay_payment_id },
    });
  } catch (err) {
    console.error('[payment.verify] invoice snapshot failed:', err.message);
  }

  await prisma.tenant.update({ where: { id: req.tenant.id }, data: { status: 'ACTIVE' } });
  invalidateUserCache(req.user.id);
  audit({ req, action: 'billing.payment.captured', resource: 'subscription', resourceId: sub.id, metadata: { planCode, paymentId: razorpay_payment_id } });

  res.json({ ok: true, subscription: sub });
});

// ── Wallet top-up checkout: create Razorpay order for arbitrary amount ─────
router.post('/wallet-checkout', requirePermission('billing.manage'), idempotent(), async (req, res) => {
  try {
    const { amount, savePaymentMethod } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be positive' });

    let customerId = null;
    if (savePaymentMethod) {
      const customer = await createCustomer({
        name: req.user.name,
        email: req.user.email,
        contact: req.user.phone || undefined,
        notes: { tenantId: req.tenant.id },
      });
      customerId = customer.id;
    }

    const rzpOrder = await createOrder({
      amount: Number(amount),
      currency: 'INR',
      notes: {
        tenantId: req.tenant.id,
        purpose: 'wallet',
        amount: String(amount),
      },
      customerId,
      savePaymentMethod: !!savePaymentMethod,
    });

    const keyId = (await getKeyId()) || rzpOrder.keyId;
    res.json({
      order: rzpOrder,
      keyId,
      customerId,
      prefill: { email: req.user.email, name: req.user.name, contact: req.user.phone || '' },
    });
  } catch (err) {
    console.error('[payment.wallet-checkout]', safeErrLog(err));
    res.status(500).json({ error: err.message });
  }
});

// ── Verify wallet top-up + credit the wallet ───────────────────────────────
router.post('/wallet-verify', requirePermission('billing.manage'), idempotent(), async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const ok = await verifySignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });
  if (!ok) return res.status(400).json({ error: 'Signature mismatch' });

  // Idempotent — if the webhook already credited this payment, skip the double credit
  const existing = await db('wallet_transactions')
    .where({ tenantId: req.tenant.id, paymentRef: razorpay_payment_id }).first();
  if (existing) {
    return res.json({ ok: true, alreadyCredited: true });
  }

  // Credit the amount the gateway actually CAPTURED — never a body-supplied
  // amount (the signature only covers order|payment id, so a body amount could
  // be inflated). Fetch the payment, require captured, and use payment.amount.
  let creditAmount;
  try {
    const { getClient } = require('../services/payment.service');
    const client = await getClient();
    if (client) {
      const payment = await client.payments.fetch(razorpay_payment_id);
      if (!payment || payment.status !== 'captured') {
        return res.status(400).json({ error: 'Payment not captured at gateway' });
      }
      const order = await client.orders.fetch(razorpay_order_id).catch(() => null);
      const notes = order?.notes || payment?.notes || {};
      if (notes.tenantId && notes.tenantId !== req.tenant.id) {
        return res.status(403).json({ error: 'Payment belongs to a different tenant' });
      }
      creditAmount = Number(payment.amount) / 100; // paise → rupees
    } else if (process.env.ALLOW_UNVERIFIED_PAYMENTS === 'true') {
      creditAmount = Number(req.body.amount); // test/stub mode only
    } else {
      return res.status(503).json({ error: 'Payment gateway not configured; cannot verify payment' });
    }
  } catch (err) {
    return res.status(400).json({ error: 'Failed to verify payment with gateway: ' + (err?.error?.description || err.message) });
  }
  if (!creditAmount || creditAmount <= 0) return res.status(400).json({ error: 'Invalid captured payment amount' });

  const result = await wallet.topup(req.tenant.id, creditAmount, {
    paymentRef: razorpay_payment_id,
    description: 'Top-up (Razorpay)',
    createdById: req.user.id,
    type: 'TOPUP',
  });
  audit({ req, action: 'wallet.topup.razorpay', resource: 'wallet', resourceId: result.transactionId, metadata: { amount: creditAmount, paymentId: razorpay_payment_id } });
  res.json({ ok: true, ...result });
});

// ──────────────────────────────────────────────────────────────────────────
// SAVED PAYMENT METHODS  (used by the autopay job to recurring-charge cards)
// ──────────────────────────────────────────────────────────────────────────
router.get('/methods', requirePermission('billing.read'), async (req, res) => {
  // Project only the display-safe columns. providerTokenId and
  // providerCustomerId are recurring-charge credentials that must never
  // leave the server — they're combined with our keySecret to drive the
  // autopay job. An XSS or leaked browser cache that exposed the token
  // alongside the public keyId would be enough to forge charges.
  const rows = await db('tenant_payment_methods')
    .where({ tenantId: req.tenant.id, isActive: 1 })
    .select(
      'id', 'method', 'brand', 'last4', 'expiryMonth', 'expiryYear',
      'upiVpa', 'label', 'isDefault', 'failureCount', 'lastUsedAt',
      'lastFailureAt', 'lastFailureReason', 'createdAt',
    )
    .orderBy([{ column: 'isDefault', order: 'desc' }, { column: 'createdAt', order: 'desc' }]);
  res.json(rows);
});

router.post('/methods/:id/default', requirePermission('billing.manage'), async (req, res) => {
  const id = req.params.id;
  await db.transaction(async (trx) => {
    // Lock every payment method row for this tenant so a concurrent
    // setDefault on a different id can't both end up with isDefault=1.
    await trx.raw('SELECT id FROM tenant_payment_methods WHERE tenantId = ? FOR UPDATE', [req.tenant.id]);
    await trx('tenant_payment_methods').where({ tenantId: req.tenant.id }).update({ isDefault: 0 });
    const updated = await trx('tenant_payment_methods')
      .where({ id, tenantId: req.tenant.id, isActive: 1 })
      .update({ isDefault: 1 });
    if (!updated) throw new Error('Payment method not found');
  });
  audit({ req, action: 'wallet.method.set_default', resource: 'payment_method', resourceId: id });
  res.json({ ok: true });
});

router.delete('/methods/:id', requirePermission('billing.manage'), async (req, res) => {
  const id = req.params.id;
  const updated = await db('tenant_payment_methods')
    .where({ id, tenantId: req.tenant.id })
    .update({ isActive: 0, isDefault: 0, updatedAt: new Date() });
  if (!updated) return res.status(404).json({ error: 'Payment method not found' });
  audit({ req, action: 'wallet.method.delete', resource: 'payment_method', resourceId: id });
  res.json({ ok: true });
});

// ──────────────────────────────────────────────────────────────────────────
// PLATFORM ADMIN — one-click test mode
// ──────────────────────────────────────────────────────────────────────────
router.post('/test-config', async (req, res) => {
  if (!req.user?.isPlatformAdmin) return res.status(403).json({ error: 'Platform admin only' });
  try {
    const { keyId, keySecret, webhookSecret } = req.body || {};
    const result = await applyTestMode({ keyId, keySecret, webhookSecret, updatedBy: req.user.email });
    audit({ req, action: 'platform.razorpay.test_mode', resource: 'settings', metadata: { keyId } });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
