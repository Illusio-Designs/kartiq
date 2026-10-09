const { Router } = require('express');
const prisma = require('../utils/prisma');
const db = require('../utils/db');
const settings = require('../services/settings.service');
const {
  authenticate, requireTenant, requirePermission, invalidateUserCache,
} = require('../middleware/auth.middleware');
const { audit } = require('../services/audit.service');

const router = Router();
router.use(authenticate, requireTenant);

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

// Usage snapshot for the current period — plain counts only (no plan limits).
router.get('/usage', requirePermission('billing.read'), async (req, res) => {
  const tenantId = req.tenant.id;
  const period = new Date().toISOString().slice(0, 7);

  // Load the full subscription row — req.subscription from auth middleware
  // only carries {id, status, currentPeriodEnd}, missing the auto-renew
  // fields. Hit the DB directly here so the API surfaces them.
  const fullSub = await prisma.subscription.findUnique({ where: { tenantId } });

  const [warehouses, products, users, roles, channels] = await Promise.all([
    prisma.warehouse.count({ where: { tenantId } }),
    prisma.product.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId } }),
    prisma.tenantRole.count({ where: { tenantId, isSystem: false } }),
    prisma.channel.count({ where: { tenantId, isActive: true } }),
  ]);

  const plan = req.plan || {};
  const subscription = req.subscription || {};

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
    used: {
      facilities: warehouses,
      skus: products,
      users,
      roles,
      channels,
    },
  });
});

// Change plan (upgrade/downgrade).
//   • Mid-cycle UPGRADES to a higher-priced plan must be paid through Razorpay
//     checkout (POST /payments/checkout) — this endpoint answers 402 for them.
//   • Downgrades, trial and free-plan changes apply immediately; the new price
//     is charged from the next renewal.
router.post('/subscription/change', requirePermission('billing.manage'), async (req, res) => {
  const { planCode, billingCycle } = req.body;
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

  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const daysRemaining = periodEnd
    ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / 86_400_000))
    : 0;
  const isPaidMidCycleUpgrade = newPrice > oldPrice && sub.status !== 'TRIALING' && daysRemaining > 0 && oldPrice > 0;
  if (isPaidMidCycleUpgrade) {
    return res.status(402).json({
      error: 'Upgrading to a higher-priced plan mid-cycle requires payment. Use checkout to upgrade.',
      useCheckout: true,
    });
  }

  const updated = await prisma.subscription.update({
    where: { tenantId: req.tenant.id },
    data: {
      planId: newPlan.id,
      billingCycle: newCycle,
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
      daysRemaining,
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
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
  const page = Math.max(1, Number(req.query.page) || 1);
  const skip = (page - 1) * limit;
  const action = String(req.query.action || '').trim();
  const before = req.query.before ? new Date(String(req.query.before)) : null;

  const where = { tenantId: req.tenant.id };
  if (action) where.action = { contains: action };
  if (before && !isNaN(before.getTime())) where.createdAt = { lt: before };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    // Total honours the action filter so the pager count matches the list.
    prisma.auditLog.count({ where }),
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
    page,
    limit,
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
