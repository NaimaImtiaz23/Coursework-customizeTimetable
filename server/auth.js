import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const digest = (value) => createHash('sha256').update(value).digest('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password, hash) {
  const [salt, stored] = hash.split(':');
  const key = await scrypt(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(stored, 'hex'));
}

export function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  const csrf = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(
    digest(token),
    userId,
    csrf,
    Date.now() + 7 * 86400000,
  );
  return { token, csrf };
}

export function getSession(db, req) {
  const cookie = (req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('session='));
  if (!cookie) return null;
  return db
    .prepare(
      `SELECT u.id, u.name, u.email, s.csrf, s.token_hash FROM sessions s
    JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`,
    )
    .get(digest(cookie.slice(8)), Date.now());
}
