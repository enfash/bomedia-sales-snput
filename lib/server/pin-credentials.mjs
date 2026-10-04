// Node/server only. Never import into a client component or expose encoded hashes.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP's 32 MiB scrypt option: N=2^15, r=8, p=3.
// Fixed parameters during verification prevent hostile hashes requesting huge work.
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const prefix = 'scrypt$32768$8$3';
const format = /^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{64})$/;
const validInput = value => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 512;

/** @returns {Promise<Buffer>} */
function derive(value, salt) {
  return new Promise((resolve, reject) => {
    scrypt(value, salt, 32, parameters, (error, key) => error ? reject(error) : resolve(key));
  });
}
export async function hashPin(value) {
  if (!validInput(value)) throw new Error('A nonempty bounded PIN is required');
  const salt = randomBytes(16);
  const key = await derive(value, salt);
  try { return `${prefix}$${salt.toString('hex')}$${key.toString('hex')}`; }
  finally { key.fill(0); }
}
export async function verifyPin(value, encoded) {
  if (!validInput(value) || typeof encoded !== 'string') return false;
  const match = format.exec(encoded);
  if (!match) return false;
  const actual = await derive(value, Buffer.from(match[1], 'hex'));
  const expected = Buffer.from(match[2], 'hex');
  try { return timingSafeEqual(actual, expected); }
  finally { actual.fill(0); expected.fill(0); }
}
