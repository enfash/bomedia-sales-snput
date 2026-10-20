// Creates the private receipt bucket on the project named with --confirm-project. Reads and creates only: it never changes, empties or deletes a bucket,
// and it never makes one public. If the bucket already exists with different settings it stops and says so. Safe to repeat.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export class ReceiptBucketError extends Error {}

const NAME = 'expense-receipts';
const LIMIT = 1048576;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function ensureReceiptBucket({ ref, confirmedRef, key, fetcher = fetch }) {
  if (!/^[a-z0-9]{20}$/.test(String(confirmedRef ?? ''))) throw new ReceiptBucketError('Give the 20-character Project ID with --confirm-project.');
  if (confirmedRef !== ref) throw new ReceiptBucketError('The confirmed Project ID is not the project in SUPABASE_PROJECT_REF. Nothing was changed.');
  if (!key) throw new ReceiptBucketError('SUPABASE_STORAGE_KEY is missing.');
  if (key.startsWith('eyJ')) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch { throw new ReceiptBucketError('The storage key is not valid.'); }
    if (claims.role !== 'service_role' || claims.ref !== ref) throw new ReceiptBucketError('The storage key does not belong to this project.');
  } else if (!key.startsWith('sb_secret_')) throw new ReceiptBucketError('A server-only secret key (sb_secret_…) is required.');
  const url = `https://${ref}.supabase.co/storage/v1`;
  const headers = { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
  const read = async () => { const r = await fetcher(`${url}/bucket/${NAME}`, { headers }); return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }; };
  let created = false;
  let found = await read();
  if (!found.ok) {
    if (found.status !== 404 && String(found.body.statusCode) !== '404') throw new ReceiptBucketError('Could not check storage. Confirm the storage key belongs to this project.');
    const made = await fetcher(`${url}/bucket`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: NAME, name: NAME, public: false, file_size_limit: LIMIT, allowed_mime_types: TYPES }) });
    if (!made.ok) throw new ReceiptBucketError('The bucket could not be created.');
    created = true;
    found = await read();
  }
  const types = [...(found.body.allowed_mime_types ?? [])].sort().join(',');
  if (!found.ok || found.body.public !== false || Number(found.body.file_size_limit) !== LIMIT || types !== [...TYPES].sort().join(',')) {
    throw new ReceiptBucketError('A bucket with this name exists with different settings (it must be private, 1 MB, jpeg/png/webp). Nothing was changed; review it in the dashboard.');
  }
  return { bucket: NAME, created, public: false, maxBytes: LIMIT, types: TYPES, project: ref };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [flag, confirmedRef, ...extra] = process.argv.slice(2);
  try {
    if (flag !== '--confirm-project' || extra.length) throw new ReceiptBucketError('Usage: --confirm-project <project-ref>');
    console.log(JSON.stringify(await ensureReceiptBucket({ ref: process.env.SUPABASE_PROJECT_REF, confirmedRef, key: process.env.SUPABASE_STORAGE_KEY }), null, 2));
  } catch (error) {
    console.error(error instanceof ReceiptBucketError ? error.message : 'Receipt storage setup failed. Check the configuration.');
    process.exitCode = 1;
  }
}
