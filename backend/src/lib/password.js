import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEYLEN = 32;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEYLEN).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  if (!salt || !hash || typeof password !== 'string') return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}
