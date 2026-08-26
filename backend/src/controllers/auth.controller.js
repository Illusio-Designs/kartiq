const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { OAuth2Client } = require('google-auth-library');
const prisma = require('../utils/prisma');
const { sendWelcome } = require('../services/email.service');
const { notifyAdmins, notifyTenant } = require('../services/notifications.service');
const { issueSessionToken } = require('../services/session.service');

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Google Identity Services verifier
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function issueJwt(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId || null,
      isPlatformAdmin: !!user.isPlatformAdmin,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    provider: user.provider,
    tenantId: user.tenantId || null,
    isPlatformAdmin: !!user.isPlatformAdmin,
    mfaEnabled: !!user.mfaEnabled,
  };
}

const register = async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) { res.status(409).json({ error: 'Email already in use' }); return; }

    const hashed = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: { ...data, password: hashed, provider: 'LOCAL', role: 'STAFF' },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    res.status(201).json({ message: 'User created', user });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
    res.status(500).json({ error: 'Registration failed' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    // Soft-deleted users have deletedAt set + isActive=0 + scrubbed email so
    // findUnique by the original email won't match anyway, but we double-check
    // both flags to defend against any future code path that drifts.
    if (!user || !user.isActive || user.deletedAt) { res.status(401).json({ error: 'Invalid credentials' }); return; }

    if (!user.password) {
      res.status(401).json({
        error: `This account uses ${user.provider} sign-in. Please continue with ${user.provider}.`,
      });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) { res.status(401).json({ error: 'Invalid credentials' }); return; }

    // 2FA challenge — if MFA is enabled, return a short-lived "mfa token"
    // that the frontend exchanges for a real session JWT after submitting a
    // valid TOTP code at /auth/2fa/login.
    if (user.mfaEnabled) {
      const mfaToken = jwt.sign(
        { id: user.id, mfaPending: true },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      res.json({ mfaRequired: true, mfaToken });
      return;
    }

    const token = await issueSessionToken(user, req);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ error: err.errors }); return; }
    res.status(500).json({ error: 'Login failed' });
  }
};

// ── Google OAuth ───────────────────────────────────────────────────────────
// Frontend uses Google Identity Services to get an ID token (JWT), then POSTs
// it here. We verify the token against Google's public keys, and create or
// find the matching user in our database, then issue our own app JWT.
//
// Body: { credential: "<google ID token>" }
const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing Google credential' });

    if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.includes('your_google')) {
      return res.status(500).json({
        error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID in backend/.env',
      });
    }

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    const { sub: providerId, email, name, picture, email_verified } = payload;

    // Find existing user by providerId first, then by email
    let user = await prisma.user.findFirst({
      where: { provider: 'GOOGLE', providerId },
    });

    if (!user) {
      // Check if a LOCAL user already exists for this email — link accounts
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        user = await prisma.user.update({
          where: { id: existing.id },
          data: {
            provider: 'GOOGLE',
            providerId,
            avatar: picture || existing.avatar,
            emailVerified: email_verified || existing.emailVerified,
          },
        });
      } else {
        // Create a new user
        user = await prisma.user.create({
          data: {
            email,
            name: name || email.split('@')[0],
            avatar: picture || null,
            provider: 'GOOGLE',
            providerId,
            emailVerified: !!email_verified,
            role: 'STAFF',
            password: null,
          },
        });
      }
    }

    // Google looks the user up by providerId (line above) which is preserved
    // through soft-delete, so we have to explicitly reject deletedAt here.
    if (!user.isActive || user.deletedAt) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    const token = await issueSessionToken(user, req);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('Google auth error:', err.message);
    if (err.message?.includes('Token used too late') || err.message?.includes('Wrong recipient')) {
      return res.status(401).json({ error: 'Invalid or expired Google token' });
    }
    res.status(500).json({ error: 'Google sign-in failed', details: err.message });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, email: true, phone: true, role: true, avatar: true, provider: true,
        tenantId: true, isPlatformAdmin: true, createdAt: true,
      },
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({
      ...user,
      tenant: req.tenant,
      plan: req.plan,
      subscription: req.subscription,
      permissions: req.permissions ? Array.from(req.permissions) : [],
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

// ── Self-serve onboarding: SaaS founder/business-user signs up ──
// Creates User + Tenant + system roles + trial subscription on Standard
const onboardSchema = z.object({
  ownerName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  businessName: z.string().min(2),
  phone: z.string().optional(),
  gstin: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  country: z.string().optional(),
  planCode: z.enum(['STANDARD', 'PROFESSIONAL', 'BUSINESS', 'ENTERPRISE']).optional(),
  // Optional `?ref=CODE` from the referral program. Bad codes don't fail
  // the signup — they're silently ignored by referrals.recordSignup.
  referralCode: z.string().max(32).optional(),
});

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
}

const onboardBusiness = async (req, res) => {
  try {
    const data = onboardSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const planCode = data.planCode || 'STANDARD';
    const plan = await prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    // Generate unique slug
    let base = slugify(data.businessName) || 'tenant';
    let slug = base, i = 1;
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${base}-${i++}`;
    }

    const trialEnds = new Date(); trialEnds.setDate(trialEnds.getDate() + 14);
    const periodEnd = new Date(trialEnds);

    const hashed = await bcrypt.hash(data.password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug,
          businessName: data.businessName,
          ownerEmail: data.email,
          ownerName: data.ownerName,
          phone: data.phone,
          gstin: data.gstin,
          industry: data.industry,
          companySize: data.companySize,
          country: data.country || 'IN',
          status: 'TRIAL',
          trialEndsAt: trialEnds,
        },
      });

      // Provision system roles for this tenant
      const allPerms = await tx.permission.findMany();
      const allCodes = allPerms.map(p => p.code);
      const permByCode = Object.fromEntries(allPerms.map(p => [p.code, p.id]));

      const roleTemplates = [
        { code: 'ADMIN',      name: 'Admin',      perms: allCodes },
        { code: 'MANAGER',    name: 'Manager',    perms: allCodes.filter(c => !c.startsWith('billing.') && !c.startsWith('roles.') && !c.endsWith('.delete')) },
        { code: 'STAFF',      name: 'Staff',      perms: allCodes.filter(c => c.endsWith('.read') || ['orders.create','orders.fulfill','inventory.adjust','shipments.create'].includes(c)) },
        { code: 'ACCOUNTANT', name: 'Accountant', perms: allCodes.filter(c => c.startsWith('invoices.') || c.startsWith('reports.') || ['orders.read','purchases.read','billing.read'].includes(c)) },
      ];

      let adminRoleId = null;
      for (const tpl of roleTemplates) {
        const role = await tx.tenantRole.create({
          data: { tenantId: tenant.id, code: tpl.code, name: tpl.name, isSystem: true },
        });
        if (tpl.code === 'ADMIN') adminRoleId = role.id;
        for (const code of tpl.perms) {
          const pid = permByCode[code];
          if (pid) await tx.rolePermission.create({ data: { roleId: role.id, permissionId: pid } });
        }
      }

      const user = await tx.user.create({
        data: {
          email: data.email,
          name: data.ownerName,
          password: hashed,
          role: 'ADMIN',
          tenantId: tenant.id,
          provider: 'LOCAL',
          emailVerified: false,
        },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: adminRoleId } });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: 'TRIALING',
          billingCycle: 'MONTHLY',
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
          trialEndsAt: trialEnds,
        },
      });

      return { tenant, user };
    });

    const token = await issueSessionToken(result.user, req);
    sendWelcome({
      to: result.user.email,
      name: result.user.name,
      businessName: result.tenant.businessName,
    }).catch((e) => console.error('[welcome email]', e.message));

    // Founder inbox — every new signup
    notifyAdmins({
      type: 'tenant.signup',
      category: 'signup',
      severity: 'success',
      title: `New signup: ${result.tenant.businessName}`,
      body: `${result.user.email}${data.industry ? ` · ${data.industry}` : ''}${data.companySize ? ` · ${data.companySize}` : ''} · plan ${planCode}`,
      link: `/admin/tenants`,
      metadata: { tenantId: result.tenant.id, plan: planCode, source: data.referralCode ? 'referral' : 'direct' },
    });
    // Tenant inbox — first-run welcome message
    notifyTenant(result.tenant.id, {
      type: 'tenant.welcome',
      category: 'system',
      severity: 'info',
      title: `Welcome to Kartriq, ${result.user.name?.split(' ')[0] || 'there'} 👋`,
      body: 'Your 14-day trial is active. Start by adding products, connecting a sales channel, or inviting your team.',
      link: '/dashboard',
      metadata: { trialEndsAt: trialEnds.toISOString() },
    });

    // Record the inbound referral, if any. Unknown / self-referred / invalid
    // codes are ignored by the service so the signup itself never fails.
    if (data.referralCode) {
      try {
        const referrals = require('../services/referrals.service');
        await referrals.recordSignup({
          referredTenantId: result.tenant.id,
          code: data.referralCode,
        });
      } catch (e) {
        console.warn('[referral] recordSignup failed:', e.message);
      }
    }

    res.status(201).json({
      token,
      user: publicUser(result.user),
      tenant: { id: result.tenant.id, slug: result.tenant.slug, businessName: result.tenant.businessName },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('Onboard error:', err);
    res.status(500).json({ error: 'Onboarding failed', details: err.message });
  }
};

module.exports = { register, login, googleAuth, getMe, onboardBusiness };
