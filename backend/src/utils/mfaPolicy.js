// Required MFA for admin accounts (Amazon DPP: MFA for privileged access).
// On by default in production; elsewhere opt in with REQUIRE_ADMIN_MFA=true.
// REQUIRE_ADMIN_MFA=false switches it off explicitly.
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

function mfaRequired() {
  const v = process.env.REQUIRE_ADMIN_MFA;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

const isAdminUser = (u) => !!u && (!!u.isPlatformAdmin || ADMIN_ROLES.has(u.role));

// True when this user must enrol in MFA before using the app.
const needsMfaSetup = (u) => mfaRequired() && isAdminUser(u) && !u.mfaEnabled;

// Endpoints an un-enrolled admin may still call (relative to /auth).
const ALLOWED = ['/me', '/2fa/setup', '/2fa/verify', '/logout'];
const pathAllowed = (req) => {
  const p = (req.originalUrl || '').split('?')[0].replace(/\/+$/, '');
  return ALLOWED.some((a) => p.endsWith(`/auth${a}`)) && req.method !== 'DELETE';
};

module.exports = { mfaRequired, isAdminUser, needsMfaSetup, pathAllowed, ADMIN_ROLES };
