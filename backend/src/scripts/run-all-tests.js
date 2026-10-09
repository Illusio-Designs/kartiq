// One command to run EVERYTHING and see the results:
//
//   cd backend && npm run test:all
//
// Sections (run in order; a failing section never stops the next one):
//   1. Backend syntax        every backend .js file compiles
//   2. API suite             the original suite (signup, auth, tenant isolation,
//                            plan limits, wallet, channels, rate limiting …),
//                            run against a temporary API server this script starts
//   3. Amazon shipping       FBA vs MFN, auto-booked courier, saved labels, cancel
//                            + un-ship, packing slips, bulk slips, bulk labels
//                            (real app + real database, FAKE Amazon — no money)
//   4. Frontend              TypeScript, ESLint (errors), unit tests
//
// Output: a summary in the terminal + a self-contained HTML report
// (backend/test-report/report.html) and report.json. Exit code 1 if anything fails.
//
// Needs MySQL (see backend/.env). Uses the configured database but only creates
// throw-away test tenants — it never touches existing tenants.
//
// Options:  --skip-frontend   skip section 4
//           --only=<n>        run only section n (1-4), e.g. --only=3

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');

const BACKEND = path.resolve(__dirname, '..', '..');
const FRONTEND = path.resolve(BACKEND, '..', 'frontend');
const OUT_DIR = path.join(BACKEND, 'test-report');
const args = process.argv.slice(2);
const skipFrontend = args.includes('--skip-frontend');
const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;
const want = (n) => !only || String(only) === String(n);

const strip = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
const ms = (t) => (t < 1000 ? `${t}ms` : `${(t / 1000).toFixed(1)}s`);
const C = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m` };

const report = { startedAt: new Date().toISOString(), sections: [] };

function runCmd(cmd, cmdArgs, opts = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(cmd, cmdArgs, { cwd: opts.cwd || BACKEND, env: { ...process.env, ...(opts.env || {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { out += '\n[run-all-tests] timed out'; child.kill('SIGKILL'); }, opts.timeout || 600000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, ms: Date.now() - t0 }); });
  });
}

// Turn a test script's stdout (lines like "3. Group name", "  ✓ ok", "  ✗ bad") into groups.
function parseChecks(output) {
  const groups = [];
  let cur = null;
  for (const raw of strip(output).split('\n')) {
    const g = raw.match(/^(\d+\.\s+.+?)\s*$/);
    if (g && !/^\s/.test(raw)) { cur = { name: g[1], checks: [] }; groups.push(cur); continue; }
    const c = raw.match(/^\s{2}([✓✗])\s+(.*\S)\s*$/);
    if (c) {
      if (!cur) { cur = { name: 'Checks', checks: [] }; groups.push(cur); }
      cur.checks.push({ name: c[2], pass: c[1] === '✓' });
    }
  }
  return groups;
}

const count = (groups) => groups.reduce((a, g) => { g.checks.forEach((c) => (c.pass ? a.pass++ : a.fail++)); return a; }, { pass: 0, fail: 0 });

function addSection(sec) {
  sec.pass = sec.groups.reduce((n, g) => n + g.checks.filter((c) => c.pass).length, 0);
  sec.fail = sec.groups.reduce((n, g) => n + g.checks.filter((c) => !c.pass).length, 0);
  sec.status = sec.error ? 'error' : sec.fail ? 'fail' : sec.skipped ? 'skipped' : 'pass';
  report.sections.push(sec);
  const icon = sec.status === 'pass' ? C.g('✓ PASS') : sec.status === 'skipped' ? C.y('– SKIP') : C.r('✗ FAIL');
  console.log(`${icon}  ${sec.title}  ${C.d(`${sec.pass} passed${sec.fail ? `, ${sec.fail} failed` : ''} · ${ms(sec.ms || 0)}`)}`);
  if (sec.error) console.log(C.r(`        ${sec.error}`));
  if (sec.note) console.log(C.d(`        ${sec.note}`));
  for (const g of sec.groups) for (const c of g.checks) if (!c.pass) console.log(C.r(`        ✗ [${g.name}] ${c.name}`));
}

function dbReachable() {
  return new Promise((resolve) => {
    try {
      const db = require('../utils/db');
      db.raw('select 1').then(() => db.destroy().then(() => resolve(true), () => resolve(true))).catch((e) => { db.destroy().catch(() => {}); resolve(e.message); });
    } catch (e) { resolve(e.message); }
  });
}

function waitHealthy(port, timeoutMs) {
  const end = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = () => {
      http.get({ hostname: 'localhost', port, path: '/health', timeout: 2000 }, (res) => { res.resume(); resolve(res.statusCode === 200); })
        .on('error', () => (Date.now() > end ? resolve(false) : setTimeout(tick, 1500)))
        .on('timeout', function () { this.destroy(); });
    };
    tick();
  });
}

// ── 1. Backend syntax ───────────────────────────────────────────────────────
async function backendSyntax() {
  const t0 = Date.now();
  const failures = [];
  let files = 0;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (e.name.endsWith('.js')) {
        files++;
        try { new vm.Script(require('module').wrap(fs.readFileSync(p, 'utf8').replace(/^#!.*/, '')), { filename: p }); } catch (err) { failures.push(`${path.relative(BACKEND, p)}: ${err.message}`); }
      }
    }
  })(path.join(BACKEND, 'src'));
  const groups = [{ name: '1. Every backend file compiles', checks: failures.length ? failures.map((f) => ({ name: f, pass: false })) : [{ name: `${files} files checked`, pass: true }] }];
  addSection({ title: '1. Backend syntax', groups, ms: Date.now() - t0 });
}

// ── 2. API suite (against a temporary server) ───────────────────────────────
async function apiSuite() {
  const PORT = 5099;
  const t0 = Date.now();
  const server = spawn(process.execPath, ['src/index.js'], {
    cwd: BACKEND, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), DISABLE_RATE_LIMIT: 'true', DISABLE_CRON: 'true', NODE_ENV: 'test' },
  });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  try {
    const up = await waitHealthy(PORT, 120000);
    if (!up) {
      return addSection({ title: '2. API suite', groups: [], error: `Test server did not start: ${strip(serverLog).trim().split('\n').slice(-3).join(' | ')}`, ms: Date.now() - t0 });
    }
    const r = await runCmd(process.execPath, ['src/scripts/test.js'], { env: { TEST_BASE_URL: `http://localhost:${PORT}/api/v1`, DISABLE_RATE_LIMIT: 'true' }, timeout: 300000 });
    const groups = parseChecks(r.out);
    const sec = { title: '2. API suite', groups, ms: Date.now() - t0, raw: strip(r.out).split('\n').filter((l) => /^\s{2}[✓✗]|^\d+\./.test(l)).join('\n') };
    if (!groups.length) sec.error = `No results parsed (exit ${r.code}): ${strip(r.out).trim().split('\n').slice(-2).join(' | ')}`;
    addSection(sec);
  } finally {
    server.kill('SIGTERM');
    setTimeout(() => server.kill('SIGKILL'), 3000).unref();
  }
}

// ── 3. Amazon shipping, labels, packing slips (fake Amazon) ─────────────────
async function amazonSuite() {
  const t0 = Date.now();
  const r = await runCmd(process.execPath, ['src/scripts/test.amazon-shipping.js'], { env: { TEST_PORT: '5098' }, timeout: 420000 });
  const groups = parseChecks(r.out);
  const sec = { title: '3. Amazon shipping, labels & packing slips', groups, ms: Date.now() - t0, note: 'Real app + real database; Amazon itself is faked (no real account, no money).' };
  if (!groups.length) sec.error = `No results parsed (exit ${r.code}): ${strip(r.out).trim().split('\n').slice(-2).join(' | ')}`;
  else if (r.code !== 0 && !count(groups).fail) sec.error = `Script exited with code ${r.code} before finishing: ${strip(r.out).trim().split('\n').slice(-2).join(' | ')}`;
  addSection(sec);
}

// ── 4. Frontend ─────────────────────────────────────────────────────────────
async function frontendChecks() {
  const t0 = Date.now();
  if (skipFrontend) return addSection({ title: '4. Frontend', groups: [], skipped: true, note: 'Skipped (--skip-frontend)', ms: 0 });
  if (!fs.existsSync(path.join(FRONTEND, 'node_modules'))) {
    return addSection({ title: '4. Frontend', groups: [], skipped: true, note: 'Skipped: run "npm install" in frontend/ first', ms: 0 });
  }
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const groups = [];

  const tsc = await runCmd(npx, ['tsc', '--noEmit'], { cwd: FRONTEND, timeout: 300000 });
  const tsErrors = (strip(tsc.out).match(/error TS\d+/g) || []).length;
  groups.push({ name: 'TypeScript', checks: tsc.code === 0
    ? [{ name: 'No type errors', pass: true }]
    : (strip(tsc.out).split('\n').filter((l) => /error TS/.test(l)).slice(0, 10).map((l) => ({ name: l.trim(), pass: false })).concat(tsErrors > 10 ? [{ name: `…and ${tsErrors - 10} more type errors`, pass: false }] : []))
        .concat(tsErrors === 0 ? [{ name: `tsc failed (exit ${tsc.code}) — run "npx tsc --noEmit" in frontend`, pass: false }] : []) });

  const lint = await runCmd(npx, ['eslint', '.', '--ext', '.ts,.tsx', '--format', 'json'], { cwd: FRONTEND, timeout: 300000 });
  let lintErrors = null; let lintWarnings = 0; const lintList = [];
  try {
    const j = JSON.parse(lint.out.slice(lint.out.indexOf('[')));
    lintErrors = j.reduce((n, f) => n + f.errorCount, 0); lintWarnings = j.reduce((n, f) => n + f.warningCount, 0);
    j.forEach((f) => f.messages.filter((m) => m.severity === 2).slice(0, 3).forEach((m) => lintList.push(`${path.relative(FRONTEND, f.filePath)}:${m.line} ${m.message}`)));
  } catch { /* unparsable: treated below */ }
  groups.push({ name: 'ESLint', checks: lintErrors === null
    ? [{ name: `ESLint did not produce a result (exit ${lint.code})`, pass: false }]
    : lintErrors === 0
      ? [{ name: `0 errors (${lintWarnings} warnings, not counted)`, pass: true }]
      : lintList.slice(0, 10).map((l) => ({ name: l, pass: false })) });

  const vt = await runCmd(npx, ['vitest', 'run'], { cwd: FRONTEND, timeout: 300000 });
  const m = strip(vt.out).match(/Tests\s+(?:(\d+) failed \| )?(\d+) passed/);
  const failed = m && m[1] ? Number(m[1]) : 0; const passedN = m ? Number(m[2]) : 0;
  const vChecks = [];
  for (let i = 0; i < passedN; i++) vChecks.push({ name: `unit test ${i + 1}`, pass: true });
  for (let i = 0; i < failed; i++) vChecks.push({ name: `unit test failed (see npm test in frontend)`, pass: false });
  if (!m) vChecks.push({ name: `Vitest produced no summary (exit ${vt.code})`, pass: false });
  groups.push({ name: 'Unit tests (vitest)', checks: vChecks.length > 6 ? [{ name: `${passedN} unit tests passed`, pass: !failed }, ...vChecks.filter((c) => !c.pass)] : vChecks });

  addSection({ title: '4. Frontend', groups, ms: Date.now() - t0 });
}

// ── Report ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function html() {
  const total = report.sections.reduce((a, s) => ({ pass: a.pass + s.pass, fail: a.fail + s.fail }), { pass: 0, fail: 0 });
  const ok = !report.sections.some((s) => s.status === 'fail' || s.status === 'error');
  const sec = report.sections.map((s) => `
    <section class="sec ${s.status}">
      <div class="sh"><span class="badge ${s.status}">${s.status === 'pass' ? 'PASS' : s.status === 'skipped' ? 'SKIP' : 'FAIL'}</span>
        <h2>${esc(s.title)}</h2><span class="meta">${s.pass} passed${s.fail ? ` · ${s.fail} failed` : ''} · ${ms(s.ms || 0)}</span></div>
      ${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}${s.error ? `<p class="err">${esc(s.error)}</p>` : ''}
      ${s.groups.map((g) => {
        const f = g.checks.filter((c) => !c.pass).length;
        return `<details ${f ? 'open' : ''}><summary class="${f ? 'bad' : 'good'}">${esc(g.name)} <em>${g.checks.length - f}/${g.checks.length}</em></summary>
          <ul>${g.checks.map((c) => `<li class="${c.pass ? 'p' : 'f'}"><b>${c.pass ? '✓' : '✗'}</b> ${esc(c.name)}</li>`).join('')}</ul></details>`;
      }).join('')}
    </section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kartriq test report</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#14181f;--mut:#667085;--line:#e4e7ec;--ok:#12805c;--okbg:#e6f6ef;--bad:#c0262d;--badbg:#fdecec;--skip:#9a6b00;--skipbg:#fff6dd}
@media(prefers-color-scheme:dark){:root{--bg:#0f1218;--card:#171b23;--ink:#e8ebf0;--mut:#98a2b3;--line:#2a303b;--okbg:#10291f;--badbg:#341618;--skipbg:#33290e;--ok:#4cc79a;--bad:#ff7b7f;--skip:#e9b949}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:920px;margin:0 auto;padding:24px 16px 56px}h1{margin:0 0 4px;font-size:24px}.sub{color:var(--mut);margin:0 0 18px}
.top{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 18px;min-width:130px}
.stat b{display:block;font-size:26px}.stat span{color:var(--mut);font-size:13px}.verdict{flex:1;min-width:220px;border-radius:12px;padding:14px 18px;font-weight:700;font-size:18px;display:flex;align-items:center}
.verdict.pass{background:var(--okbg);color:var(--ok)}.verdict.fail{background:var(--badbg);color:var(--bad)}
.sec{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin-bottom:14px;border-left-width:5px}.sec.pass{border-left-color:var(--ok)}.sec.fail,.sec.error{border-left-color:var(--bad)}.sec.skipped{border-left-color:var(--skip)}
.sh{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.sh h2{margin:0;font-size:17px;flex:1}.meta{color:var(--mut);font-size:13px}
.badge{font-size:11px;font-weight:800;letter-spacing:.06em;padding:3px 8px;border-radius:6px}.badge.pass{background:var(--okbg);color:var(--ok)}.badge.fail,.badge.error{background:var(--badbg);color:var(--bad)}.badge.skipped{background:var(--skipbg);color:var(--skip)}
.note{color:var(--mut);font-size:13px;margin:6px 0}.err{color:var(--bad);font-weight:600}
details{border-top:1px solid var(--line);padding:8px 0}summary{cursor:pointer;font-weight:600}summary em{font-style:normal;color:var(--mut);font-weight:400;margin-left:6px;font-size:13px}summary.bad{color:var(--bad)}
ul{list-style:none;padding:6px 0 0 4px;margin:0}li{padding:2px 0;font-size:14px}li.p b{color:var(--ok)}li.f{color:var(--bad)}li.f b{color:var(--bad)}
</style></head><body><main>
<h1>Kartriq test report</h1><p class="sub">${esc(new Date(report.startedAt).toLocaleString())} · took ${ms(report.durationMs || 0)}</p>
<div class="top"><div class="verdict ${ok ? 'pass' : 'fail'}">${ok ? '✓ Everything passed' : '✗ Something failed'}</div>
<div class="stat"><b>${total.pass}</b><span>checks passed</span></div><div class="stat"><b style="color:${total.fail ? 'var(--bad)' : 'inherit'}">${total.fail}</b><span>checks failed</span></div></div>
${sec}</main></body></html>`;
}

(async () => {
  const t0 = Date.now();
  console.log(`\n${C.b('Kartriq — run all tests')}\n`);
  const db = await dbReachable();
  if (db !== true) {
    console.log(C.r(`✗ Cannot reach the database: ${db}`));
    console.log('  Start MySQL and check backend/.env (DB_HOST / DB_USER / DB_PASSWORD / DB_NAME), then run again.\n');
    process.exit(1);
  }
  if (want(1)) await backendSyntax();
  if (want(2)) await apiSuite();
  if (want(3)) await amazonSuite();
  if (want(4)) await frontendChecks();

  report.durationMs = Date.now() - t0;
  const total = report.sections.reduce((a, s) => ({ pass: a.pass + s.pass, fail: a.fail + s.fail }), { pass: 0, fail: 0 });
  const bad = report.sections.some((s) => s.status === 'fail' || s.status === 'error');
  report.total = total; report.ok = !bad;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'report.html'), html());
  console.log(`\n${bad ? C.r(C.b('✗ SOMETHING FAILED')) : C.g(C.b('✓ ALL PASSED'))}  ${total.pass} checks passed, ${total.fail} failed · ${ms(report.durationMs)}`);
  console.log(`${C.d('Report:')} ${path.join(OUT_DIR, 'report.html')}\n`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('Runner crashed:', e); process.exit(1); });
