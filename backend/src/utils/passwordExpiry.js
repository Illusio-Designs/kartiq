// Passwords expire after PASSWORD_MAX_AGE_DAYS (default 365; 0 = never).
// Amazon DPP asks for rotation at least yearly. Accounts with no password
// (Google-only, pending invites) never expire.
const maxAgeDays = () => {
  const n = Number(process.env.PASSWORD_MAX_AGE_DAYS);
  return Number.isFinite(n) && n >= 0 && process.env.PASSWORD_MAX_AGE_DAYS !== undefined && process.env.PASSWORD_MAX_AGE_DAYS !== '' ? n : 365;
};

function passwordExpired(user, now = new Date()) {
  const days = maxAgeDays();
  if (!days || !user?.password) return false;
  const changed = user.passwordChangedAt ? new Date(user.passwordChangedAt) : null;
  if (!changed || Number.isNaN(changed.getTime())) return false;
  return now.getTime() - changed.getTime() > days * 86400000;
}

const EXPIRED_MESSAGE = 'Your password has expired. Use "Forgot password" to set a new one.';

module.exports = { passwordExpired, maxAgeDays, EXPIRED_MESSAGE };
