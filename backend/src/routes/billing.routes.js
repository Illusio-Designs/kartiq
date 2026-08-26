const { Router } = require('express');
const prisma = require('../utils/prisma');
const db = require('../utils/db');
const settings = require('../services/settings.service');
const {
  authenticate, requireTenant, requirePermission, invalidateUserCache,
} = require('../middleware/auth.middleware');
const { audit } = require('../services/audit.service');
const wallet = require('../services/wallet.service');
const { idempotent } = require('../middleware/idempotency.middleware');

const router = Router();
router.use(authenticate, requireTenant);

// ── Wallet endpoints ────────────────────────────────────────────────────────
router.get('/wallet', requirePermission('billing.read'), async (req, res) => {
  try {
    const w = await wallet.getOrCreateWallet(req.tenant.id);
    const low = Number(w.balance) < Number(w.lowBalanceThreshold);
    // Wallet is manual top-up only — auto-topup fields are intentionally NOT
    // returned anymore. The DB columns are kept for back-compat but the cron
    // that consumed them (autopay.job.js) is now a no-op.
    res.json({
      id: w.id,
      balance: Number(w.balance),
      currency: w.currency,
      lowBalanceThreshold: Number(w.lowBalanceThreshold),
      lowBalance: low,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/wallet/transactions', requirePermission('billing.read'), async (req, res) => {
  try {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const txns = await wallet.history(req.tenant.id, limit);
    res.json(txns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Direct wallet top-up — for use by:
//   1. Platform admins doing manual credits / refunds (audited)
//   2. Internal callers (autopay job, /payments/wallet-verify) which
//      pass a verified Razorpay paymentId — checked here against the
//      Razorpay API before crediting.
//
// Tenants cannot self-credit by calling this endpoint directly with an
// invented paymentRef — the payment is fetched from Razorpay and rejected
// unless its status === 'captured' AND the amount matches.
router.post('/wallet/topup', requirePermission('billing.manage'), idempotent(), async (req, res) => {
  try {
    const { amount, paymentRef, description } = req.body || {};
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'amount must be positive' });

    const isPlatformAdmin = !!req.user?.isPlatformAdmin;

    // Non-admins MUST provide a captured Razorpay paymentRef whose amount
    // matches what they're crediting. This blocks the "free money" attack
    // where a tenant admin self-credits with a fake paymentRef.
    if (!isPlatformAdmin) {
      if (!paymentRef) {
        return res.status(403).json({ error: 'paymentRef required (verified payment gateway transaction). Use /payments/wallet-checkout to start a Razorpay flow.' });
      }
      try {
        const { getClient, getCreds } = require('../services/payment.service');
        const client = await getClient();
        const { isLive } = await getCreds();
        // In stub/dev mode (no live Razorpay creds) we permit the legacy path
        // so e2e tests still work; in prod we require verification.
        if (isLive && client) {
          const payment = await client.payments.fetch(paymentRef);
          if (!payment || payment.status !== 'captured') {
            return res.status(400).json({ error: 'Payment not captured at gateway' });
          }
          const expectedPaise = Math.round(Number(amount) * 100);
          if (Number(payment.amount) !== expectedPaise) {
            return res.status(400).json({ error: 'Amount mismatch with Razorpay payment' });
          }
          // Confirm the payment is for this tenant via order notes
          if (payment.notes?.tenantId && payment.notes.tenantId !== req.tenant.id) {
            return res.status(403).json({ error: 'Payment belongs to a different tenant' });
          }
        } else if (process.env.ALLOW_UNVERIFIED_WALLET_TOPUP !== 'true') {
          // Fail CLOSED whenever the gateway can't verify — in every environment,
          // not just production. The unverified path (for e2e tests) must be
          // opted into explicitly via ALLOW_UNVERIFIED_WALLET_TOPUP=true, so a
          // misconfigured/non-live deploy can never let a tenant self-credit.
          return res.status(503).json({ error: 'Payment gateway not configured; cannot verify topup' });
        }
      } catch (err) {
        return res.status(400).json({ error: 'Failed to verify payment with gateway: ' + (err?.error?.description || err.message) });
      }
    }

    const result = await wallet.topup(req.tenant.id, Number(amount), {
      paymentRef: paymentRef || null,
      description: description || (isPlatformAdmin ? 'Manual top-up (platform admin)' : 'Top-up'),
      createdById: req.user.id,
      type: 'TOPUP',
    });
    audit({
      req,
      action: isPlatformAdmin ? 'wallet.topup.admin' : 'wallet.topup.razorpay',
      resource: 'wallet',
      resourceId: result.transactionId,
      metadata: { amount, paymentRef, byPlatformAdmin: isPlatformAdmin },
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/wallet/settings', requirePermission('billing.manage'), async (req, res) => {
  try {
    // Only the low-balance alert threshold is user-configurable now.
    // autoTopup* fields are silently ignored — wallet is manual top-up only.
    // Older clients sending those fields won't fail; we just drop them on
    // the floor and disable any pre-existing auto-topup so nothing fires.
    const { lowBalanceThreshold } = req.body || {};
    const updates = [];
    const values = [];
    if (lowBalanceThreshold != null) { updates.push('lowBalanceThreshold = ?'); values.push(Number(lowBalanceThreshold)); }
    // Defensive: any wallet that still has auto-topup enabled in the DB
    // gets disabled on the next save so the (already-no-op) cron never
    // re-activates if someone re-enables it later.
    updates.push('autoTopupEnabled = 0');
    if (!updates.length) return res.json({ ok: true });

    values.push(req.tenant.id);
    await prisma.$executeRawUnsafe(
      `UPDATE tenant_wallets SET ${updates.join(', ')}, updatedAt = NOW(3) WHERE tenantId = ?`,
      ...values
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update tenant company info (name, GSTIN)
router.patch('/tenant', requirePermission('billing.manage'), async (req, res) => {
  try {
    const { businessName, gstin } = req.body;
    const data = {};
    if (businessName != null) data.businessName = String(businessName).trim().slice(0, 191);
    if (gstin != null) data.gstin = String(gstin).trim().slice(0, 20);
    if (!Object.keys(data).length) return res.json({ ok: true });
    await prisma.tenant.update({ where: { id: req.tenant.id }, data });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current subscription + plan
router.get('/subscription', requirePermission('billing.read'), async (req, res) => {
  const sub = await prisma.subscription.findUnique({
    where: { tenantId: req.tenant.id },
    include: { plan: true },
  });
  res.json(sub);
});

// Usage snapshot for current period — includes overage + PAYG charges
router.get('/usage', requirePermission('billing.read'), async (req, res) => {
  const tenantId = req.tenant.id;
  const period = new Date().toISOString().slice(0, 7);

  // Load the full subscription row — req.subscription from auth middleware
  // only carries {id, status, payAsYouGo, currentPeriodEnd}, missing the
  // auto-renew fields. Hit the DB directly here so the API surfaces them.
  const fullSub = await prisma.subscription.findUnique({ where: { tenantId } });

  const [warehouses, products, users, roles, channels, ordersMeter] = await Promise.all([
    prisma.warehouse.count({ where: { tenantId } }),
    prisma.product.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId } }),
    prisma.tenantRole.count({ where: { tenantId, isSystem: false } }),
    prisma.channel.count({ where: { tenantId, isActive: true } }),
    prisma.usageMeter.findUnique({
      where: { tenantId_metric_period: { tenantId, metric: 'orders', period } },
    }),
  ]);

  const plan = req.plan || {};
  const subscription = req.subscription || {};
  const ordersThisPeriod = ordersMeter?.count || 0;
  const maxOrders = plan.maxOrdersPerMonth;
  const maxSkus = plan.maxSkus;
  const maxUsers = plan.maxUsers;
  const maxFacilities = plan.maxFacilities;
  const maxChannels = plan.features?.maxChannels ?? null;

  // Calculate overage — each metric over limit, priced per the plan's meteredRates
  const rates = plan.meteredRates || {};
  const overage = {
    orders: maxOrders != null && ordersThisPeriod > maxOrders ? ordersThisPeriod - maxOrders : 0,
    skus:   maxSkus != null && products > maxSkus ? products - maxSkus : 0,
    users:  maxUsers != null && users > maxUsers ? users - maxUsers : 0,
    channels: maxChannels != null && channels > maxChannels ? channels - maxChannels : 0,
  };
  const overageCharges = {
    orders:   overage.orders * Number(rates.extraOrders || 0),
    skus:     overage.skus * Number(rates.extraSkus || 0),
    users:    overage.users * Number(rates.extraUsers || 0),
    channels: overage.channels * Number(rates.extraChannels || 0),
  };
  const totalOverageCost = Object.values(overageCharges).reduce((a, b) => a + b, 0);

  // Wallet info (lazy-create if missing)
  const walletInfo = await wallet.getOrCreateWallet(tenantId).catch(() => null);

  // Default payment method (only the most recently saved active default).
  // Used by the lockscreen + billing page to show "we couldn't charge your
  // Visa ending 4242 — card expired" instead of a generic message.
  const defaultMethod = await db('tenant_payment_methods')
    .where({ tenantId, isDefault: 1 })
    .orderBy('createdAt', 'desc')
    .first()
    .catch(() => null);

  // Grace-period countdown — only meaningful while PAST_DUE. Anchor is
  // pastDueSince (set the first time the cron flipped status) plus the
  // platform-wide billing.graceDays setting. After that, suspendOverdueTenants
  // flips tenant.status to SUSPENDED.
  let gracePeriodEndsAt = null;
  if (fullSub?.status === 'PAST_DUE' && fullSub?.pastDueSince) {
    const graceDaysStr = await settings.get('billing.graceDays').catch(() => null);
    const graceDays = parseInt(graceDaysStr || '7', 10);
    const start = new Date(fullSub.pastDueSince);
    gracePeriodEndsAt = new Date(start.getTime() + graceDays * 86_400_000).toISOString();
  }

  res.json({
    period,
    plan,
    subscription: {
      status: subscription.status,
      payAsYouGo: !!subscription.payAsYouGo,
      autoRenew: !!(fullSub?.autoRenew),
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEndsAt: subscription.trialEndsAt || null,
      billingCycle: subscription.billingCycle,
      lastRenewalAt: fullSub?.lastRenewalAt || null,
      lastRenewalError: fullSub?.lastRenewalError || null,
      renewalFailureCount: fullSub?.renewalFailureCount || 0,
      pastDueSince: fullSub?.pastDueSince || null,
      gracePeriodEndsAt,
    },
    paymentMethod: defaultMethod ? {
      brand: defaultMethod.brand || null,
      last4: defaultMethod.last4 || null,
      method: defaultMethod.method || null,
      expiryMonth: defaultMethod.expiryMonth || null,
      expiryYear: defaultMethod.expiryYear || null,
      isActive: !!defaultMethod.isActive,
      failureCount: defaultMethod.failureCount || 0,
      lastFailureReason: defaultMethod.lastFailureReason || null,
      lastFailureAt: defaultMethod.lastFailureAt || null,
    } : null,
    wallet: walletInfo ? {
      balance: Number(walletInfo.balance),
      currency: walletInfo.currency,
      lowBalance: Number(walletInfo.balance) < Number(walletInfo.lowBalanceThreshold),
      lowBalanceThreshold: Number(walletInfo.lowBalanceThreshold),
    } : null,
    used: {
      facilities: warehouses,
      skus: products,
      users,
      roles,
      channels,
      ordersThisPeriod,
    },
    limits: {
      facilities: maxFacilities,
      skus: maxSkus,
      users: maxUsers,
      ordersPerMonth: maxOrders,
      channels: maxChannels,
    },
    overage,
    overageCharges,
    totalOverageCost,
    rates,
  });
});

// Change plan (upgrade/downgrade). Mid-cycle changes are pro-rated against
// the wallet:
//   • Upgrade   → wallet is debited for (newPlanDailyRate - oldPlanDailyRate)
//                 × daysRemaining. Insufficient balance returns 402 so the
//                 caller can top up first.
//   • Downgrade → wallet is credited for (oldPlanDailyRate - newPlanDailyRate)
//                 × daysRemaining as a refund.
//   • Cycle keeps its original currentPeriodEnd; the next renewal charges
//     the full new-plan amount.
router.post('/subscription/change', requirePermission('billing.manage'), async (req, res) => {
  const { planCode, billingCycle, payAsYouGo } = req.body;
  const newPlan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!newPlan) return res.status(404).json({ error: 'Plan not found' });

  const sub = await prisma.subscription.findUnique({
    where: { tenantId: req.tenant.id },
    include: { plan: true },
  });
  if (!sub) return res.status(404).json({ error: 'No active subscription' });

  const newCycle = billingCycle || sub.billingCycle || 'MONTHLY';
  const oldPrice = Number(sub.billingCycle === 'YEARLY' ? sub.plan.yearlyPrice : sub.plan.monthlyPrice) || 0;
  const newPrice = Number(newCycle === 'YEARLY' ? newPlan.yearlyPrice : newPlan.monthlyPrice) || 0;

  // Days-remaining maths. We treat MONTHLY as 30 days and YEARLY as 365 to
  // keep the daily rate stable regardless of which calendar month we're in.
  const cycleDays = (cycle) => (cycle === 'YEARLY' ? 365 : 30);
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const daysRemaining = periodEnd
    ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / 86_400_000))
    : 0;

  const oldDaily = oldPrice / cycleDays(sub.billingCycle || 'MONTHLY');
  const newDaily = newPrice / cycleDays(newCycle);
  const delta = (newDaily - oldDaily) * daysRemaining; // +ve = upgrade owe, -ve = downgrade refund
  const proration = Number(delta.toFixed(2));

  const isUpgrade = proration > 0;
  const isDowngrade = proration < 0;
  const skipProration = sub.status === 'TRIALING' || daysRemaining === 0 || oldPrice === 0;

  const wallet = require('../services/wallet.service');
  let walletTxn = null;

  if (!skipProration) {
    if (isUpgrade) {
      // Charge the wallet. If balance is short, return 402 so the caller can
      // surface a "top up first" prompt instead of silently leaving the plan
      // change incomplete.
      const balance = await wallet.getBalance(req.tenant.id);
      if (balance < proration) {
        return res.status(402).json({
          error: 'Insufficient wallet balance for prorated upgrade',
          required: proration,
          balance,
          shortfall: Number((proration - balance).toFixed(2)),
        });
      }
      walletTxn = await wallet.debit(req.tenant.id, proration, {
        description: `Plan upgrade proration (${sub.plan.code} → ${newPlan.code})`,
        type: 'PLAN_PRORATION',
        reference: sub.id,
      });
      // wallet.debit does NOT throw on insufficient funds — it returns
      // { ok:false }. The pre-check above is non-atomic (balance can drop under
      // concurrency), so this is the authoritative guard: if the debit didn't
      // succeed, do NOT apply the (paid) upgrade.
      if (!walletTxn?.ok) {
        return res.status(402).json({
          error: 'Insufficient wallet balance for prorated upgrade',
          required: walletTxn?.required ?? proration,
          balance: walletTxn?.balance,
        });
      }
    } else if (isDowngrade) {
      walletTxn = await wallet.topup(req.tenant.id, Math.abs(proration), {
        description: `Plan downgrade refund (${sub.plan.code} → ${newPlan.code})`,
        type: 'PLAN_REFUND',
        createdById: req.user.id,
      });
    }
  }

  const updated = await prisma.subscription.update({
    where: { tenantId: req.tenant.id },
    data: {
      planId: newPlan.id,
      billingCycle: newCycle,
      payAsYouGo: !!payAsYouGo,
      status: 'ACTIVE',
    },
    include: { plan: true },
  });
  invalidateUserCache(req.user.id);
  audit({
    req,
    action: 'billing.change_plan',
    resource: 'subscription',
    resourceId: updated.id,
    metadata: {
      from: sub.plan.code,
      to: planCode,
      billingCycle: newCycle,
      payAsYouGo,
      daysRemaining,
      proration,
      walletTxnId: walletTxn?.transactionId || null,
    },
  });

  // Referral conversion — fire when a tenant transitions from trial/free
  // onto a paid plan for the first time. The service is idempotent (only
  // converts the first pending row for this tenant) so it's safe to call
  // on every plan change.
  const becamePaid = newPrice > 0 && (sub.status === 'TRIALING' || oldPrice === 0);
  if (becamePaid) {
    try {
      const referrals = require('../services/referrals.service');
      await referrals.markConverted(req.tenant.id, { reason: 'plan-upgrade' });
    } catch (e) {
      console.warn('[referral] conversion failed:', e.message);
    }
  }
  res.json({
    ...updated,
    proration: skipProration ? null : {
      amount: proration,
      direction: isUpgrade ? 'charge' : 'refund',
      daysRemaining,
      oldDailyRate: Number(oldDaily.toFixed(4)),
      newDailyRate: Number(newDaily.toFixed(4)),
    },
  });
});

// Toggle pay-as-you-go
router.post('/subscription/payg', requirePermission('billing.manage'), async (req, res) => {
  const updated = await prisma.subscription.update({
    where: { tenantId: req.tenant.id },
    data: { payAsYouGo: !!req.body.enabled },
  });
  invalidateUserCache(req.user.id);
  res.json(updated);
});

// Toggle auto-renew (autopay for the plan itself). When ON, the billing job
// charges the tenant's default saved Razorpay token at the end of each
// billing cycle so the plan keeps running without manual checkout.
router.post('/subscription/auto-renew', requirePermission('billing.manage'), async (req, res) => {
  const updated = await prisma.subscription.update({
    where: { tenantId: req.tenant.id },
    data: { autoRenew: !!req.body.enabled, lastRenewalError: req.body.enabled ? null : undefined },
  });
  audit({ req, action: 'billing.auto_renew', resource: 'subscription', resourceId: updated.id, metadata: { enabled: !!req.body.enabled } });
  res.json(updated);
});

// Cancel
router.post('/subscription/cancel', requirePermission('billing.manage'), async (req, res) => {
  const updated = await prisma.subscription.update({
    where: { tenantId: req.tenant.id },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  res.json(updated);
});

// Tenant audit log (own tenant only). Lightly indexed read — capped at 500
// rows so a single response stays under the JSON limit; clients should
// paginate via `before` (cursor on createdAt) to walk further back.
router.get('/audit', requirePermission('settings.read'), async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const action = String(req.query.action || '').trim();
  const before = req.query.before ? new Date(String(req.query.before)) : null;

  const where = { tenantId: req.tenant.id };
  if (action) where.action = { contains: action };
  if (before && !isNaN(before.getTime())) where.createdAt = { lt: before };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.auditLog.count({ where: { tenantId: req.tenant.id } }),
  ]);

  // Distinct action list for the UI's filter dropdown — small surface, fast.
  const distinctActions = await prisma.auditLog.groupBy({
    by: ['action'],
    where: { tenantId: req.tenant.id },
    _count: { action: true },
    orderBy: { _count: { action: 'desc' } },
    take: 30,
  }).catch(() => []);

  res.json({
    logs: rows,
    total,
    actions: distinctActions.map((a) => ({ action: a.action, count: a._count?.action || 0 })),
  });
});

// Billing invoices history
router.get('/invoices', requirePermission('billing.read'), async (req, res) => {
  const list = await prisma.billingInvoice.findMany({
    where: { tenantId: req.tenant.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(list);
});

module.exports = router;
