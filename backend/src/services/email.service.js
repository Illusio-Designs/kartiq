// Email seam — uses nodemailer when SMTP settings are present, otherwise
// logs to console. Config is loaded from PlatformSetting (smtp.*) with
// fallback to SMTP_* env vars.

const settings = require('./settings.service');

let cached = { transporter: null, fromKey: '' };

async function getTransport() {
  const [host, port, user, pass, from] = await Promise.all([
    settings.get('smtp.host'),
    settings.get('smtp.port'),
    settings.get('smtp.user'),
    settings.get('smtp.pass'),
    settings.get('smtp.from'),
  ]);
  const cacheKey = `${host}|${port}|${user}`;
  if (cached.transporter && cached.fromKey === cacheKey) {
    return { transporter: cached.transporter, from: from || 'Kartriq <no-reply@kartriq.com>' };
  }
  if (!host) return { transporter: null, from };
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port || 587),
      secure: Number(port) === 465,
      auth: user ? { user, pass } : undefined,
    });
    cached = { transporter, fromKey: cacheKey };
    return { transporter, from: from || 'Kartriq <no-reply@kartriq.com>' };
  } catch {
    console.warn('[email] nodemailer not installed — falling back to console stub');
    return { transporter: null, from };
  }
}

async function send({ to, subject, html, text }) {
  const { transporter, from } = await getTransport();
  if (!transporter) {
    console.log('\n[email:stub] ---------------------------------');
    console.log(`  from:    ${from || 'Kartriq'}`);
    console.log(`  to:      ${to}`);
    console.log(`  subject: ${subject}`);
    console.log(`  body:    ${text || html?.replace(/<[^>]+>/g, '').slice(0, 200)}`);
    console.log('[email:stub] ---------------------------------\n');
    return { stub: true };
  }
  return transporter.sendMail({ from, to, subject, html, text });
}

// ── Templates ──────────────────────────────────────────────────
const siteUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';

const wrap = (body) => `
<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
  <div style="background:linear-gradient(135deg,#10b981,#0d9488);color:white;padding:16px 20px;border-radius:12px;">
    <strong>Kartriq</strong>
  </div>
  <div style="padding:24px 4px;color:#0f172a;line-height:1.6;font-size:14px;">
    ${body}
  </div>
  <div style="color:#94a3b8;font-size:11px;border-top:1px solid #e2e8f0;padding-top:12px;">
    You're receiving this because you signed up to Kartriq.
  </div>
</div>`;

const sendWelcome = ({ to, name, businessName }) => send({
  to,
  subject: `Welcome to Kartriq, ${name}!`,
  html: wrap(`
    <h2 style="margin-top:0;">Welcome, ${name} 👋</h2>
    <p>Your tenant <strong>${businessName}</strong> is ready. You have a 14-day free trial — no credit card required.</p>
    <p><a href="${siteUrl()}/dashboard" style="background:#10b981;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;">Open dashboard</a></p>
  `),
});

const sendTrialEndingSoon = ({ to, name, daysLeft }) => send({
  to,
  subject: `Your Kartriq trial ends in ${daysLeft} days`,
  html: wrap(`
    <h2 style="margin-top:0;">${daysLeft} days left on your trial</h2>
    <p>Hi ${name}, upgrade now to keep your data and avoid service interruption.</p>
    <p><a href="${siteUrl()}/dashboard/billing" style="background:#10b981;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;">Upgrade plan</a></p>
  `),
});

const sendInvoicePaid = ({ to, name, invoiceNumber, amount, currency = 'INR' }) => send({
  to,
  subject: `Invoice ${invoiceNumber} paid — ${currency} ${amount}`,
  html: wrap(`
    <h2 style="margin-top:0;">Payment received</h2>
    <p>Hi ${name}, we've received your payment for invoice <strong>${invoiceNumber}</strong>.</p>
    <p>Amount: <strong>${currency} ${amount}</strong></p>
  `),
});

const sendPastDue = ({ to, name, graceDays }) => send({
  to,
  subject: 'Payment past due — action required',
  html: wrap(`
    <h2 style="margin-top:0;">Payment past due</h2>
    <p>Hi ${name}, your latest subscription payment failed. Please update your payment method within <strong>${graceDays} days</strong> to avoid suspension.</p>
    <p><a href="${siteUrl()}/dashboard/billing" style="background:#ef4444;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;">Update billing</a></p>
  `),
});

// Multi-stage dunning — escalates as more days elapse since the first failure.
// Stages: 1, 3, 7, 14 days past due. The 14-day reminder warns of imminent
// suspension; the actual suspension is performed by the billing job's
// suspendOverdueTenants step.
const sendDunningReminder = ({ to, name, daysPastDue, amountDue, currency = 'INR' }) => {
  const stage = daysPastDue >= 14 ? 'final' : daysPastDue >= 7 ? 'warning' : daysPastDue >= 3 ? 'reminder' : 'first';
  const headlines = {
    first:    'Quick reminder — payment failed',
    reminder: `Still pending after ${daysPastDue} days`,
    warning:  `Action required — ${daysPastDue} days past due`,
    final:    'Final notice — workspace will be suspended soon',
  };
  const accents = { first: '#f59e0b', reminder: '#f59e0b', warning: '#ef4444', final: '#ef4444' };
  return send({
    to,
    subject: headlines[stage],
    html: wrap(`
      <h2 style="margin-top:0;color:${accents[stage]};">${headlines[stage]}</h2>
      <p>Hi ${name}, we couldn't charge your card for ${currency} ${amountDue}.</p>
      ${stage === 'final'
        ? `<p><strong>Your workspace will be suspended in 24 hours</strong> unless we can collect payment. Update your card now to keep things running.</p>`
        : `<p>Please update your card to keep your workspace active.</p>`}
      <p><a href="${siteUrl()}/dashboard/billing" style="background:${accents[stage]};color:white;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;">Resolve now</a></p>
      <p style="color:#64748b;font-size:12px;margin-top:24px;">If you've already paid, you can ignore this email — our system will catch up shortly.</p>
    `),
  });
};

const sendPasswordReset = ({ to, name, resetUrl }) => send({
  to,
  subject: 'Reset your Kartriq password',
  html: wrap(`
    <h2 style="margin-top:0;">Reset your password</h2>
    <p>Hi ${name}, click the link below to choose a new password. The link expires in 60 minutes.</p>
    <p><a href="${resetUrl}" style="background:#10b981;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;">Reset password</a></p>
    <p style="color:#64748b;font-size:12px;">If you didn't request this, ignore this email — your password stays unchanged.</p>
  `),
});

const sendUserInvite = ({ to, inviterName, businessName, inviteUrl }) => send({
  to,
  subject: `${inviterName} invited you to ${businessName} on Kartriq`,
  html: wrap(`
    <h2 style="margin-top:0;">You're invited</h2>
    <p><strong>${inviterName}</strong> has invited you to join <strong>${businessName}</strong> on Kartriq. Click below to accept and set your password.</p>
    <p><a href="${inviteUrl}" style="background:#10b981;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;">Accept invite</a></p>
  `),
});

const sendPaymentFailed = ({ to, name, amount, currency = 'INR', reason, kind = 'subscription', cardLast4 }) => {
  const target = 'subscription renewal';
  const cardLine = cardLast4 ? `card ending <strong>${cardLast4}</strong>` : 'saved card';
  return send({
    to,
    subject: `Payment to Kartriq failed`,
    html: wrap(`
      <h2 style="margin-top:0;">Payment failed</h2>
      <p>Hi ${name}, we couldn't charge your ${cardLine} ${amount ? `for <strong>${currency} ${amount}</strong>` : ''} (${target}).</p>
      ${reason ? `<p style="background:#fef2f2;border-left:3px solid #ef4444;padding:10px 12px;color:#991b1b;font-size:13px;border-radius:0 6px 6px 0;"><strong>Reason from your bank:</strong> ${reason}</p>` : ''}
      <p>We'll retry automatically with a backoff schedule, but you can fix this now to skip the wait:</p>
      <p><a href="${siteUrl()}/dashboard/billing" style="background:#ef4444;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;">Update payment method</a></p>
      <p style="color:#64748b;font-size:12px;margin-top:24px;">If you've already fixed it, you can ignore this email — the next retry will pick up the change.</p>
    `),
  });
};

// Sent when a saved card has failed too many times in a row and we've
// stopped retrying it. The user MUST add a fresh card to resume.
const sendCardDeactivated = ({ to, name, cardLast4, failureCount, kind = 'subscription' }) => send({
  to,
  subject: 'We stopped retrying your saved card',
  html: wrap(`
    <h2 style="margin-top:0;color:#ef4444;">Saved card disabled</h2>
    <p>Hi ${name}, after <strong>${failureCount} failed attempts</strong> we stopped trying to charge your ${cardLast4 ? `card ending <strong>${cardLast4}</strong>` : 'saved card'} for subscription renewal.</p>
    <p>This usually means the card has expired, the bank has revoked it, or there were repeatedly insufficient funds. To restore service, add a fresh card from the billing page:</p>
    <p><a href="${siteUrl()}/dashboard/billing" style="background:#ef4444;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;">Add a new card</a></p>
    <p style="color:#64748b;font-size:12px;margin-top:24px;">Until then, your account will be suspended once the grace period ends.</p>
  `),
});

const sendTicketReply = ({ to, name, ticketSubject, ticketUrl, replyPreview }) => send({
  to,
  subject: `Re: ${ticketSubject}`,
  html: wrap(`
    <h2 style="margin-top:0;">New reply on your ticket</h2>
    <p>Hi ${name}, support has replied to <strong>${ticketSubject}</strong>:</p>
    <blockquote style="border-left:3px solid #10b981;background:#f0fdf4;padding:12px 16px;border-radius:0 8px 8px 0;color:#065f46;font-size:13px;margin:12px 0;">
      ${replyPreview}
    </blockquote>
    <p><a href="${ticketUrl}" style="background:#10b981;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;">View ticket</a></p>
  `),
});

module.exports = {
  send,
  sendWelcome,
  sendTrialEndingSoon,
  sendInvoicePaid,
  sendPastDue,
  sendDunningReminder,
  sendPasswordReset,
  sendUserInvite,
  sendPaymentFailed,
  sendCardDeactivated,
  sendTicketReply,
};
