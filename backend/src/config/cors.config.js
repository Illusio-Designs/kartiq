// CORS configuration — environment-aware.
//
// Production allow-list comes from the CORS_ALLOWED_ORIGINS env var
// (comma-separated) so adding a new domain doesn't need a code push.
// Falls back to the canonical production origins when unset.
//
// Dev mode allows the usual local ports plus Expo's tunnel pattern so
// device testing works without disabling CORS.

require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

const PROD_DEFAULTS = [
  'https://kartriq.com',
  'https://www.kartriq.com',
  'https://app.kartriq.com',
  'https://kartriq.vercel.app',
];

const DEV_DEFAULTS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8081',
  'http://localhost:8082',
  // Expo Web preview
  'http://localhost:19006',
];

function parseEnvList() {
  return (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const fromEnv = parseEnvList();

const origins = isProd
  ? (fromEnv.length ? fromEnv : PROD_DEFAULTS)
  : [...DEV_DEFAULTS, ...fromEnv];

// Origin checker — accepts the static list AND a dynamic regex for Vercel
// preview URLs (e.g. https://kartriq-git-feature-foo-illusio.vercel.app)
// so feature branches don't need to be added one-by-one. Mobile (Expo)
// requests from a real device have no Origin header — those are allowed
// via the leading `!origin` short-circuit.
const VERCEL_PREVIEW_RE = /^https:\/\/kartriq(-[a-z0-9-]+)?\.vercel\.app$/i;

// Expo developer surfaces — Metro bundler, Web preview, tunnel URLs,
// and LAN-IP testing. Allowed against PROD as well so a dev can run
// the mobile app pointed at api.kartriq.com without flipping env
// vars. The risk surface is narrow: an attacker would have to be
// running a malicious page on localhost / the same Wi-Fi LAN AND
// the victim would need an active session cookie on api.kartriq.com,
// which we don't issue cross-origin anyway (we use bearer JWTs in
// the Authorization header, not cookies).
const EXPO_DEV_RE = new RegExp(
  '^(' + [
    // Metro / Expo Web on localhost (any port)
    'http://localhost(:\\d+)?',
    'http://127\\.0\\.0\\.1(:\\d+)?',
    // LAN-IP testing — 10.x, 172.16-31.x, 192.168.x
    'http://10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(:\\d+)?',
    'http://172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}(:\\d+)?',
    'http://192\\.168\\.\\d{1,3}\\.\\d{1,3}(:\\d+)?',
    // Expo tunnel domains (any subdomain)
    'https://[a-z0-9-]+\\.exp\\.direct',
    'https://[a-z0-9-]+\\.exp\\.host',
  ].join('|') + ')$',
  'i'
);

function originFn(origin, callback) {
  if (!origin) return callback(null, true);
  if (origins.includes(origin)) return callback(null, true);
  if (isProd && VERCEL_PREVIEW_RE.test(origin)) return callback(null, true);
  if (EXPO_DEV_RE.test(origin)) return callback(null, true);
  return callback(new Error(`Origin not allowed by CORS: ${origin}`));
}

module.exports = {
  origin: originFn,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-tenant-id',
    // Device-class hint for the single-session login guard (web vs mobile)
    'X-Client-Type',
    'x-client-type',
    // Added with the idempotency middleware
    'Idempotency-Key',
    'idempotency-key',
  ],
  maxAge: 86400,
};
