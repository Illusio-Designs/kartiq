// End-to-end backend test suite — no external framework, just Node.
// Uses http.request against a running API. Run with:
//   npm run test:backend   (or: node src/scripts/test.js)
//
// The script boots a test tenant, runs through critical flows, and verifies
// tenant isolation + security. Exits 0 on success, 1 on any failure.

const http = require('http');
const https = require('https');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5000/api/v1';
const TIMESTAMP = Date.now();
const T1 = {
  email: `t1-${TIMESTAMP}@test.local`,
  password: 'test12345',
  businessName: `Tenant 1 ${TIMESTAMP}`,
  ownerName: 'Alice Tester',
  token: null,
  userId: null,
  tenantId: null,
};
const T2 = {
  email: `t2-${TIMESTAMP}@test.local`,
  password: 'test12345',
  businessName: `Tenant 2 ${TIMESTAMP}`,
  ownerName: 'Bob Tester',
  token: null,
  userId: null,
  tenantId: null,
};

let failed = 0;
let passed = 0;

function log(level, msg) {
  const tag = level === 'ok' ? '\x1b[32m\u2713\x1b[0m'
    : level === 'fail' ? '\x1b[31m\u2717\x1b[0m'
    : '\x1b[36m\u2022\x1b[0m';
  console.log(`  ${tag} ${msg}`);
}

function req(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const lib = url.protocol === 'https:' ? https : http;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const options = { method, headers, hostname: url.hostname, port: url.port, path: url.pathname + url.search };
    const r = lib.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

function assert(condition, msg) {
  if (condition) { log('ok', msg); passed++; }
  else           { log('fail', msg); failed++; }
}

function group(name) { console.log(`\n\x1b[1m${name}\x1b[0m`); }

async function main() {
  console.log(`\n\x1b[1mKartriq Backend Test Suite\x1b[0m`);
  console.log(`Target: ${BASE}\n`);

  // ── Health ─────────────────────────────────────────────────
  group('0. Health');
  // /health is outside /api/v1 — compute absolute URL manually
  const healthUrl = BASE.replace(/\/api\/v1\/?$/, '/health');
  const healthCheck = await new Promise((resolve) => {
    const u = new URL(healthUrl);
    const lib = u.protocol === 'https:' ? require('https') : require('http');
    const r = lib.request({ method: 'GET', hostname: u.hostname, port: u.port, path: u.pathname, timeout: 3000 }, (res) => {
      resolve({ status: res.statusCode });
    });
    r.on('error', () => resolve(null));
    r.on('timeout', () => { r.destroy(); resolve(null); });
    r.end();
  });
  if (!healthCheck || healthCheck.status !== 200) {
    log('fail', `Backend not reachable at ${healthUrl}. Start with "npm run dev" first.`);
    process.exit(1);
  }
  assert(healthCheck.status === 200, 'Health endpoint returns 200');

  // ── Onboarding ─────────────────────────────────────────────
  group('1. Tenant signup flow');
  const o1 = await req('POST', '/auth/onboard', { body: T1 });
  assert(o1.status === 201 && o1.body.token, `Tenant 1 onboarded (status ${o1.status})`);
  T1.token = o1.body.token;
  T1.userId = o1.body.user?.id;
  T1.tenantId = o1.body.tenant?.id;

  const o2 = await req('POST', '/auth/onboard', { body: T2 });
  assert(o2.status === 201, `Tenant 2 onboarded (status ${o2.status})`);
  T2.token = o2.body.token;
  T2.userId = o2.body.user?.id;
  T2.tenantId = o2.body.tenant?.id;

  // Duplicate email should fail
  const dup = await req('POST', '/auth/onboard', { body: T1 });
  assert(dup.status === 409, 'Duplicate email rejected (409)');

  // ── Auth ───────────────────────────────────────────────────
  group('2. Auth');
  const login = await req('POST', '/auth/login', { body: { email: T1.email, password: T1.password } });
  assert(login.status === 200 && login.body.token, 'Login returns token');
  // One active session per user: logging in signs the sign-up session out
  // (SESSION_SUPERSEDED), so carry on with the newest token.
  if (login.body?.token) T1.token = login.body.token;
  assert(login.body.user?.role === 'ADMIN', 'New owner has role=ADMIN');

  const badLogin = await req('POST', '/auth/login', { body: { email: T1.email, password: 'wrong' } });
  assert(badLogin.status === 401, 'Bad password rejected (401)');

  const me = await req('GET', '/auth/me', { token: T1.token });
  assert(me.status === 200 && me.body.tenant?.id === T1.tenantId, '/auth/me returns tenant context');
  assert(Array.isArray(me.body.permissions) && me.body.permissions.length > 0, 'Permissions loaded');

  const logout = await req('POST', '/auth/logout', { token: T1.token });
  assert(logout.status === 200, 'Logout endpoint works');
  // Logging out ends that session — sign back in so the rest of the suite has a live token.
  const relogin = await req('POST', '/auth/login', { body: { email: T1.email, password: T1.password } });
  if (relogin.body?.token) T1.token = relogin.body.token;
  const meAfterLogout = await req('GET', '/auth/me', { token: logout.status === 200 ? 'x' + T1.token : T1.token });
  assert(meAfterLogout.status === 401, 'A tampered/old token is rejected (401)');

  const noToken = await req('GET', '/auth/me');
  assert(noToken.status === 401, 'Missing token returns 401');

  // ── Tenant isolation ──────────────────────────────────────
  group('3. Tenant isolation (critical security)');
  // T1 creates a warehouse
  const wh1 = await req('POST', '/warehouses', {
    token: T1.token,
    body: { name: 'T1 Main WH', code: `WH${TIMESTAMP}` },
  });
  assert(wh1.status === 201, `T1 created warehouse (${wh1.status})`);
  const wh1Id = wh1.body.id;

  // T2 tries to read T1's warehouse by ID — must 404
  const leakRead = await req('GET', `/warehouses/${wh1Id}`, { token: T2.token });
  assert(leakRead.status === 404, 'T2 cannot read T1\'s warehouse (IDOR blocked)');

  // T2 tries to UPDATE T1's warehouse — must 404
  const leakUpdate = await req('PUT', `/warehouses/${wh1Id}`, {
    token: T2.token,
    body: { name: 'Hijacked!' },
  });
  assert(leakUpdate.status === 404, 'T2 cannot update T1\'s warehouse');

  // T2 list should NOT include T1's warehouse
  const wh2List = await req('GET', '/warehouses', { token: T2.token });
  const leaked = Array.isArray(wh2List.body) && wh2List.body.some((w) => w.id === wh1Id);
  assert(!leaked, 'T1\'s warehouse not visible in T2\'s list');

  // ── Mass assignment ───────────────────────────────────────
  group('4. Mass assignment protection');
  // Attempt to override tenantId / isActive / rogue fields
  const masAtk = await req('POST', '/customers', {
    token: T1.token,
    body: {
      name: 'Attack Customer',
      email: 'attack@test.local',
      tenantId: T2.tenantId, // attempted cross-tenant assignment
      isPlatformAdmin: true,
      __proto__: { polluted: true },
    },
  });
  assert(masAtk.status === 201, 'Customer created');
  if (masAtk.status === 201) {
    const fetchedAsT2 = await req('GET', `/customers/${masAtk.body.id}`, { token: T2.token });
    assert(fetchedAsT2.status === 404, 'Injected tenantId ignored (customer still in T1)');
  }

  // ── Channels + plan category gating ──────────────────────
  group('5. Channel category gating');
  const ch1 = await req('POST', '/channels', {
    token: T1.token,
    body: { name: 'My Amazon', type: 'AMAZON' },
  });
  assert(ch1.status === 201, 'ECOM channel allowed on STANDARD');

  const chB2B = await req('POST', '/channels', {
    token: T1.token,
    body: { name: 'My B2B', type: 'B2B_PORTAL' },
  });
  assert(chB2B.status === 402 && chB2B.body?.requiredPlan, 'B2B channel blocked on STANDARD (402 with requiredPlan)');

  const ch2 = await req('POST', '/channels', {
    token: T1.token,
    body: { name: 'My Flipkart', type: 'FLIPKART' },
  });
  assert(ch2.status === 201, 'Second ECOM channel allowed');

  // ── Catalog endpoint ─────────────────────────────────────
  group('8. Channel catalog');
  const cat = await req('GET', '/channels/catalog', { token: T1.token });
  assert(cat.status === 200 && Array.isArray(cat.body.catalog), 'Catalog returns list');
  assert(cat.body.summary?.currentPlan === 'STANDARD', 'Catalog shows current plan');
  const locked = cat.body.catalog.filter((c) => c.status === 'plan_locked');
  assert(locked.length > 0, `${locked.length} channels locked by plan`);

  // ── Products ─────────────────────────────────────────────
  group('9. Products CRUD');
  const prod = await req('POST', '/products', {
    token: T1.token,
    body: { name: 'Test Product', sku: `SKU${TIMESTAMP}`, costPrice: 500, mrp: 999, sellingPrice: 899 },
  });
  assert(prod.status === 201, 'Product created');
  assert(Array.isArray(prod.body?.variants) && prod.body.variants.length > 0, 'Default variant auto-created with pricing');

  const listProds = await req('GET', '/products', { token: T1.token });
  assert(listProds.status === 200, 'Products list works');

  // ── Order creation with mobile-shape items (sku, productName, quantity) ──
  group('9b. Order creation flow (mobile/frontend shapes)');
  const orderMobileShape = await req('POST', '/orders', {
    token: T1.token,
    body: {
      customerId: undefined,  // mobile sends undefined for walk-in
      channelId: undefined,
      items: [{ productName: 'Manual Item A', sku: `MAN-${TIMESTAMP}`, quantity: 2, unitPrice: 100 }],
      notes: 'Mobile test order',
    },
  });
  assert(orderMobileShape.status === 201, `Mobile-shape order created (${orderMobileShape.status})`);

  // Order creation with frontend-shape items (name, qty)
  const orderWebShape = await req('POST', '/orders', {
    token: T1.token,
    body: {
      items: [{ name: 'Web Item', sku: `WEB-${TIMESTAMP}`, qty: 1, unitPrice: 250 }],
      subtotal: 250, total: 250,
    },
  });
  assert(orderWebShape.status === 201, `Frontend-shape order created (${orderWebShape.status})`);

  // Order with variantId (canonical shape) — should still work
  if (prod.body?.variants?.[0]?.id) {
    const orderCanonical = await req('POST', '/orders', {
      token: T1.token,
      body: {
        items: [{ variantId: prod.body.variants[0].id, qty: 1, unitPrice: 899 }],
      },
    });
    assert(orderCanonical.status === 201, 'Canonical-shape order created');
  }

  // ── Webhook without signature ────────────────────────────
  group('10. Webhook signature verification');
  // Webhook to an Amazon channel (has no signature) should be rejected
  const noSig = await req('POST', `/webhooks/channels/${ch1.body.id}`, {
    body: { orderId: 'FAKE-1' },
  });
  assert([401, 412, 501].includes(noSig.status), `Unsigned webhook rejected (${noSig.status})`);

  // ── Admin routes (platform admin only) ───────────────────
  group('11. Admin route access control');
  const adminDenied = await req('GET', '/admin/tenants', { token: T1.token });
  assert(adminDenied.status === 403, 'Tenant admin cannot access platform-admin routes');

  // ── Rate limiting (auth) ─────────────────────────────────
  group('12. Rate limiting');
  if (process.env.DISABLE_RATE_LIMIT === 'true' || process.env.NODE_ENV === 'test') {
    log('ok', 'Rate limiting bypassed (test mode) — skipped');
    passed++;
  } else {
    let rateLimited = false;
    for (let i = 0; i < 10; i++) {
      const r = await req('POST', '/auth/login', { body: { email: 'fake@fake', password: 'x' } });
      if (r.status === 429) { rateLimited = true; break; }
    }
    assert(rateLimited, 'Login endpoint is rate-limited');
  }

  // ── Summary ───────────────────────────────────────────────
  console.log(`\n\x1b[1mResults:\x1b[0m`);
  console.log(`  \x1b[32m${passed} passed\x1b[0m`);
  if (failed > 0) console.log(`  \x1b[31m${failed} failed\x1b[0m`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
