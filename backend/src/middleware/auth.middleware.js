const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const { isSessionActive } = require('../services/session.service');


// ── In-process cache for permissions/plan to avoid hitting DB on every req
const ctxCache = new Map(); // userId -> { ts, ctx }
// Short TTL so role/permission changes propagate quickly; critical actions
// (logout, role change, deactivate) call invalidateUserCache() to be safe.
const TTL_MS = 10 * 1000;

async function loadUserContext(userId, { byEmail = false } = {}) {
  const cacheKey = byEmail ? `email:${userId}` : userId;
  const cached = ctxCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.ctx;

  const user = await prisma.user.findUnique({
    where: byEmail ? { email: userId } : { id: userId },
    include: {
      tenant: { include: { subscription: { include: { plan: true } } } },
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  });
  if (!user) return null;

  const permissions = new Set();
  for (const ur of user.roles) {
    for (const rp of ur.role.permissions) permissions.add(rp.permission.code);
  }
  // Platform admin gets a wildcard
  if (user.isPlatformAdmin) permissions.add('*');

  const plan = user.tenant?.subscription?.plan || null;

  const ctx = {
    user: {
      id: user.id, email: user.email, name: user.name, phone: user.phone,
      role: user.role, isPlatformAdmin: user.isPlatformAdmin,
      tenantId: user.tenantId,
    },
    tenant: user.tenant ? {
      id: user.tenant.id, slug: user.tenant.slug, status: user.tenant.status,
      businessName: user.tenant.businessName, gstin: user.tenant.gstin, isDemo: !!user.tenant.isDemo,
    } : null,
    plan: plan ? {
      id: plan.id, code: plan.code, name: plan.name,
      features: plan.features || {},
    } : null,
    subscription: user.tenant?.subscription ? {
      id: user.tenant.subscription.id,
      status: user.tenant.subscription.status,
      currentPeriodEnd: user.tenant.subscription.currentPeriodEnd,
    } : null,
    permissions,
  };
  ctxCache.set(cacheKey, { ts: Date.now(), ctx });
  return ctx;
}

function invalidateUserCache(userId) { ctxCache.delete(userId); }

// ── Impersonation: platform admins can scope a request to any tenant by
// sending x-tenant-id. This reloads the tenant + plan + subscription and
// keeps their wildcard permissions so they see the full tenant UI.
async function applyImpersonation(req) {
  const impersonateId = req.headers['x-tenant-id'];
  if (!impersonateId || !req.user?.isPlatformAdmin) return;

  const tenant = await prisma.tenant.findUnique({
    where: { id: String(impersonateId) },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant) return;

  req.tenant = {
    id: tenant.id,
    slug: tenant.slug,
    status: tenant.status,
    businessName: tenant.businessName,
    gstin: tenant.gstin, isDemo: !!tenant.isDemo,
  };
  const plan = tenant.subscription?.plan || null;
  req.plan = plan ? {
    id: plan.id, code: plan.code, name: plan.name,
    features: plan.features || {},
  } : null;
  req.subscription = tenant.subscription ? {
    id: tenant.subscription.id,
    status: tenant.subscription.status,
    currentPeriodEnd: tenant.subscription.currentPeriodEnd,
  } : null;
  req.impersonating = true;
}

// ── Authenticate: verify JWT, load tenant + permissions
// Dev auth bypass — STRICT whitelist: only in explicit dev/test envs
const DEV_AUTH_ENABLED =
  process.env.DEV_AUTH_BYPASS === 'true' &&
  (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test');

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  // Step 1 — resolve who the caller claims to be. A failure to verify the JWT
  // is a genuine auth error (401). Dev bypass ("dev:<email>") skips the JWT.
  let lookup; // { value, byEmail }
  if (DEV_AUTH_ENABLED && token.startsWith('dev:')) {
    lookup = { value: token.slice(4).trim().toLowerCase(), byEmail: true };
  } else {
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    // Single-session-per-device-class guard: if this token carries a session id,
    // it must still be the active session for its device class. When the account
    // signs in again on the same kind of device, that login supersedes this one.
    if (decoded.sid) {
      const active = await isSessionActive(decoded.sid, decoded.id);
      if (!active) {
        return res.status(401).json({
          error: 'You were signed out because your account signed in on another device.',
          code: 'SESSION_SUPERSEDED',
        });
      }
    }
    req.sessionId = decoded.sid || null;
    lookup = { value: decoded.id, byEmail: false };
  }

  // Step 2 — load the user context. A DB / server failure here is TRANSIENT
  // (503), not an auth failure. Returning 401 (as this used to) wrongly logged
  // users out on every refresh whenever the database hiccupped — a real problem
  // on shared hosts with tight MySQL connection limits.
  try {
    const ctx = await loadUserContext(lookup.value, { byEmail: lookup.byEmail });
    if (!ctx) {
      return res.status(401).json({
        error: lookup.byEmail ? `Dev user not found: ${lookup.value}` : 'User no longer exists',
      });
    }
    req.user = ctx.user;
    req.tenant = ctx.tenant;
    req.plan = ctx.plan;
    req.subscription = ctx.subscription;
    req.permissions = ctx.permissions;
    await applyImpersonation(req);
    next();
  } catch (err) {
    console.error('[authenticate] context load failed:', err?.code || '', err?.message || err);
    res.status(503).json({ error: 'Service temporarily unavailable — please retry.' });
  }
};

// ── Legacy coarse role check (kept for back-compat)
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || (!req.user.isPlatformAdmin && !roles.includes(req.user.role))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

// ── New RBAC permission check
const requirePermission = (...needed) => (req, res, next) => {
  if (!req.permissions) return res.status(401).json({ error: 'Not authenticated' });
  if (req.permissions.has('*')) return next();
  for (const code of needed) {
    if (req.permissions.has(code)) return next();
  }
  return res.status(403).json({
    error: 'Permission denied',
    required: needed,
  });
};

// ── Plan-feature gate (e.g. requireFeature('purchaseManagement'))
const requireFeature = (...flags) => (req, res, next) => {
  if (req.user?.isPlatformAdmin) return next();
  const features = req.plan?.features || {};
  for (const f of flags) {
    const v = features[f];
    if (!v) {
      return res.status(402).json({
        error: 'Feature not included in your plan',
        feature: f,
        currentPlan: req.plan?.code || null,
        upgradeTo: 'PROFESSIONAL_OR_ENTERPRISE',
      });
    }
  }
  next();
};

// ── Tenant scope guard: tenantId must exist for non-platform-admin requests
// Also enforces: suspended tenants blocked, expired trials blocked (except
// billing routes so tenants can still upgrade).
const BILLING_PATHS = ['/api/v1/billing', '/api/v1/plans', '/api/v1/auth'];
const isBillingPath = (req) => BILLING_PATHS.some((p) => req.originalUrl.startsWith(p));

const requireTenant = (req, res, next) => {
  // Platform admins bypass the tenant status/trial gates ONLY while impersonating
  // a tenant (x-tenant-id populates req.tenant). Without a selected tenant they
  // have no tenant context, so fall through to the 403 below instead of letting
  // tenant-scoped controllers dereference a null req.tenant (previously a 500).
  if (req.user?.isPlatformAdmin && req.tenant?.id) return next();
  if (!req.tenant?.id) return res.status(403).json({ error: 'No tenant context' });
  if (req.tenant.status === 'SUSPENDED' || req.tenant.status === 'CANCELLED' || req.tenant.status === 'DELETED') {
    return res.status(402).json({ error: `Tenant ${req.tenant.status.toLowerCase()}` });
  }
  // Trial expired: allow billing routes so tenants can upgrade, block everything else
  if (req.subscription?.status === 'TRIALING' && req.subscription?.currentPeriodEnd) {
    const expired = new Date(req.subscription.currentPeriodEnd) < new Date();
    if (expired && !isBillingPath(req)) {
      return res.status(402).json({
        error: 'Trial expired',
        upgradeUrl: '/dashboard/billing',
      });
    }
  }
  if (req.subscription?.status === 'PAST_DUE' && !isBillingPath(req)) {
    return res.status(402).json({ error: 'Subscription past due', upgradeUrl: '/dashboard/billing' });
  }
  next();
};

// ── Platform-only (SaaS admin portal)
const requirePlatformAdmin = (req, res, next) => {
  if (!req.user?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Platform admin only' });
  }
  next();
};

// ── Tenant-scoped Prisma helper: builds {tenantId} filter automatically
function scopeWhere(req, where = {}) {
  if (req.user?.isPlatformAdmin && !req.tenant?.id) return where;
  return { ...where, tenantId: req.tenant.id };
}

module.exports = {
  authenticate,
  authorize,
  requirePermission,
  requireFeature,
  requireTenant,
  requirePlatformAdmin,
  scopeWhere,
  invalidateUserCache,
};
