// storage.service — thin object-storage abstraction for user-uploaded media
// (currently: order/packing videos for VMS).
//
// Kartriq stores the *reference* (a URL) to a video, never the bytes in the DB.
// The client uploads the file straight to object storage (S3 / Cloudinary / a
// signed URL) and sends us the resulting URL + metadata. All this module has to
// do server-side is DELETE the object again when retention expires.
//
// Drivers:
//   • s3     — deletes via the AWS SDK when STORAGE_DRIVER=s3 and the SDK +
//              bucket env are present.
//   • noop   — default. We drop our DB row and best-effort forget the object;
//              wiring a real bucket later needs no code change here.
//
// This keeps the feature shippable today (URL-reference model) while leaving a
// single, obvious seam to plug production storage into.

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DRIVER = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
const BUCKET = process.env.STORAGE_BUCKET || '';
const REGION = process.env.STORAGE_REGION || process.env.AWS_REGION || 'ap-south-1';
// Where the `local` driver writes files, and the public base the app serves
// them from (index.js mounts express.static on PUBLIC_BASE).
const LOCAL_DIR = process.env.STORAGE_LOCAL_DIR || path.join(process.cwd(), 'uploads');
const PUBLIC_BASE = '/uploads';

// Lazily load the S3 client so the AWS SDK is never a hard dependency.
let _s3 = null;
function s3Client() {
  if (_s3) return _s3;
  try {
    // Optional dep — only present if the deployment opts into S3 storage.
    const { S3Client } = require('@aws-sdk/client-s3');
    _s3 = new S3Client({ region: REGION });
    return _s3;
  } catch {
    return null;
  }
}

// Extension for a given video mime, so stored files keep a sensible suffix.
const EXT_BY_MIME = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'video/x-matroska': 'mkv', 'video/3gpp': '3gp', 'video/x-msvideo': 'avi',
};
function extForMime(mime) { return EXT_BY_MIME[String(mime || '').toLowerCase()] || 'mp4'; }

// Store raw bytes and return { url, storageKey, sizeBytes }. `url` is what the
// browser loads; `storageKey` is what deleteObject() later removes.
//   • local — writes under LOCAL_DIR/order-videos, served at PUBLIC_BASE.
//   • s3    — PutObject into BUCKET; url is the public S3 URL.
async function putObject({ buffer, mime, prefix = 'order-videos' }) {
  const ext = extForMime(mime);
  const name = `${randomUUID()}.${ext}`;
  const key = `${prefix}/${name}`;

  if (DRIVER === 's3') {
    const client = s3Client();
    if (!client || !BUCKET) throw new Error('S3 storage is not configured (missing SDK or STORAGE_BUCKET)');
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: mime }));
    const base = process.env.STORAGE_PUBLIC_URL || `https://${BUCKET}.s3.${REGION}.amazonaws.com`;
    return { url: `${base}/${key}`, storageKey: key, sizeBytes: buffer.length };
  }

  // local driver (default)
  const dir = path.join(LOCAL_DIR, prefix);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, buffer);
  return { url: `${PUBLIC_BASE}/${key}`, storageKey: filePath, sizeBytes: buffer.length };
}

// Best-effort delete of a stored object. Never throws — retention must still
// drop the DB row even if the object is already gone or storage is unreachable.
// Returns { deleted, driver, reason? } for logging.
async function deleteObject(storageKey) {
  if (!storageKey) return { deleted: false, driver: DRIVER, reason: 'no-key' };

  if (DRIVER === 'local') {
    try {
      if (fs.existsSync(storageKey)) fs.unlinkSync(storageKey);
      return { deleted: true, driver: 'local' };
    } catch (e) {
      return { deleted: false, driver: 'local', reason: e.message };
    }
  }

  if (DRIVER === 's3') {
    const client = s3Client();
    if (!client || !BUCKET) {
      return { deleted: false, driver: 's3', reason: 'sdk-or-bucket-missing' };
    }
    try {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: storageKey }));
      return { deleted: true, driver: 's3' };
    } catch (e) {
      return { deleted: false, driver: 's3', reason: e.message };
    }
  }

  // noop driver — nothing to physically remove (URL points at external/dev
  // storage). The caller still removes the DB row.
  return { deleted: false, driver: 'noop', reason: 'noop-driver' };
}

module.exports = { putObject, deleteObject, extForMime, STORAGE_DRIVER: DRIVER };
