// Local click-through demo — the SAME demo sandbox that runs on the live site
// (Admin → Demo mode), started on your machine:
//
//   cd backend && npm run demo:amazon-shipping
//
// Boots the real backend with demo mode ON, then creates (or resets) the demo
// seller. The seller starts with just a warehouse; you do the rest in the web
// app (cd frontend && npm run dev): connect the fake Amazon channel, pull the
// catalog, sync orders, confirm & get a label, print. No Amazon account, no
// real money. Needs MySQL (see backend/.env). Ctrl+C to stop.

process.env.PORT = process.env.PORT || '5001';
process.env.DISABLE_CRON = 'true';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.DEMO_MODE_ENABLED = 'true';

const EMAIL = process.env.DEMO_EMAIL || 'demo-seller@kartriq.test';
const PASSWORD = process.env.DEMO_PASSWORD || 'demo12345678';

(async () => {
  require('../index'); // boots the app (migrations + seed on first run)
  const http = require('http');
  const up = () => new Promise((r) => http.get({ hostname: 'localhost', port: process.env.PORT, path: '/health', timeout: 2000 }, (x) => { x.resume(); r(x.statusCode === 200); }).on('error', () => r(false)));
  for (let i = 0; i < 180 && !(await up()); i++) await new Promise((r) => setTimeout(r, 1000));

  const demo = require('../services/demo.service');
  const status = await demo.getDemoStatus();
  let how;
  if (status.exists) { await demo.resetDemo(); how = 'reset to the very start'; }
  else { await demo.setupDemo({ email: EMAIL, password: PASSWORD }); how = 'created'; }

  const line = '─'.repeat(66);
  console.log(`\n${line}\n  DEMO ${how.toUpperCase()} — fake Amazon, no real money\n${line}`);
  console.log(`  Web app:   cd frontend && npm run dev   →  http://localhost:3000`);
  console.log(`  Login:     ${status.exists ? status.tenant.loginEmail : EMAIL}  /  ${status.exists ? '(your demo password)' : PASSWORD}`);
  console.log(`\n  The journey (start to finish):`);
  console.log(`   1. Channels → "Amazon" → Connect → "Authorize with Amazon" → click Authorize`);
  console.log(`      on the fake Amazon page.`);
  console.log(`   2. Channel page → Pull Catalog "Pull now"  → 3 products + stock arrive.`);
  console.log(`   3. Channel page → Sync Orders "Sync now"   → 6 orders arrive (1 FBA, 5 you ship).`);
  console.log(`   4. Orders → open a DEMO MFN order → "Confirm & get shipping label" → it is SHIPPED.`);
  console.log(`   5. Print label / Download / Cancel label · Print packing slip.`);
  console.log(`   6. Orders list → tick several → "Confirm & get labels" (one PDF) · bulk packing slips.`);
  console.log(`   7. Order ending MFN5-ERR fails on purpose (see the error + Try again). FBA needs no label.`);
  console.log(`${line}\n  Ctrl+C to stop.\n`);
})().catch((e) => { console.error('DEMO FAILED:', e); process.exit(1); });
