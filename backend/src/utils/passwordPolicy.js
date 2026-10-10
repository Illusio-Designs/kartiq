// One password rule for the whole app (Amazon's security questionnaire asks for
// 12+ characters with special characters). Applied when a password is CREATED or
// CHANGED; existing passwords keep working until their owner next changes them.
//
// PASSWORD_MIN_LENGTH can raise (not lower) the minimum, e.g. for a stricter customer.

const { z } = require('zod');

const MIN = Math.max(12, Number(process.env.PASSWORD_MIN_LENGTH) || 12);
const MAX = 128;

const RULE_TEXT = `Password must be at least ${MIN} characters and include an upper-case letter, a lower-case letter, a number and a special character`;

// Returns a plain-language problem, or null when the password is acceptable.
function passwordProblem(pw) {
  const s = String(pw ?? '');
  if (s.length < MIN) return `Password must be at least ${MIN} characters`;
  if (s.length > MAX) return 'Password is too long';
  if (!/[a-z]/.test(s)) return 'Password needs a lower-case letter';
  if (!/[A-Z]/.test(s)) return 'Password needs an upper-case letter';
  if (!/\d/.test(s)) return 'Password needs a number';
  if (!/[^A-Za-z0-9]/.test(s)) return 'Password needs a special character (for example ! @ # $ %)';
  return null;
}

const passwordSchema = z.string().superRefine((v, ctx) => {
  const p = passwordProblem(v);
  if (p) ctx.addIssue({ code: z.ZodIssueCode.custom, message: p });
});

module.exports = { passwordProblem, passwordSchema, PASSWORD_MIN: MIN, RULE_TEXT };
