import { argon2id } from '@noble/hashes/argon2';
import { utf8 } from './encoding.js';

export interface KdfParams {
  algo: 'argon2id';
  m: number;
  t: number;
  p: number;
  saltB64: string;
}

const DEFAULT_PARAMS: Omit<KdfParams, 'saltB64'> = {
  algo: 'argon2id',
  m: 19456,
  t: 2,
  p: 1,
};

const KEY_LEN = 32;

export function generateSalt(length = 16): Uint8Array {
  const salt = new Uint8Array(length);
  crypto.getRandomValues(salt);
  return salt;
}

export function deriveKey(password: string, params: KdfParams): Uint8Array {
  const salt = Uint8Array.from(atob(params.saltB64), (c) => c.charCodeAt(0));
  return argon2id(utf8(password), salt, {
    m: params.m,
    t: params.t,
    p: params.p,
    dkLen: KEY_LEN,
  });
}

export function newKdfParams(saltB64: string): KdfParams {
  return { ...DEFAULT_PARAMS, saltB64 };
}
