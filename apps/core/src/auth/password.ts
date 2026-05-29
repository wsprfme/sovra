import { argon2id } from '@noble/hashes/argon2';
import { randomBytes } from 'node:crypto';

interface StoredHash {
  algo: 'argon2id';
  m: number;
  t: number;
  p: number;
  salt: string;
  hash: string;
}

const PARAMS = { m: 19456, t: 2, p: 1 };
const HASH_LEN = 32;

function b64(b: Uint8Array): string {
  return Buffer.from(b).toString('base64');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function hashPassword(password: string): string {
  const salt = new Uint8Array(randomBytes(16));
  const hash = argon2id(new TextEncoder().encode(password), salt, {
    ...PARAMS,
    dkLen: HASH_LEN,
  });
  const stored: StoredHash = {
    algo: 'argon2id',
    m: PARAMS.m,
    t: PARAMS.t,
    p: PARAMS.p,
    salt: b64(salt),
    hash: b64(hash),
  };
  return JSON.stringify(stored);
}

export function verifyPassword(password: string, stored: string): boolean {
  let parsed: StoredHash;
  try {
    parsed = JSON.parse(stored) as StoredHash;
  } catch {
    return false;
  }
  if (parsed.algo !== 'argon2id') return false;
  const salt = new Uint8Array(Buffer.from(parsed.salt, 'base64'));
  const computed = argon2id(new TextEncoder().encode(password), salt, {
    m: parsed.m,
    t: parsed.t,
    p: parsed.p,
    dkLen: HASH_LEN,
  });
  return timingSafeEqual(b64(computed), parsed.hash);
}
