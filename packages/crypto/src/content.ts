import { blake3 } from '@noble/hashes/blake3';
import type { EncMeta } from '@sovra/contracts';
import { fromBase64, toBase64 } from './encoding.js';

const IV_LEN = 12;
export const DEFAULT_CHUNK_SIZE = 65536;

function ab(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy;
}

function deriveConvergentKey(plaintext: Uint8Array): Uint8Array {
  return blake3(plaintext, { dkLen: 32 });
}

function deriveConvergentIv(plaintext: Uint8Array): Uint8Array {
  return blake3(plaintext, { context: 'sovra-content-iv', dkLen: IV_LEN });
}

async function importAesKey(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', ab(raw), { name: 'AES-GCM' }, false, usages);
}

async function aesEncrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await importAesKey(key, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ab(iv) }, cryptoKey, ab(data));
  return new Uint8Array(ct);
}

async function aesDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await importAesKey(key, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ab(iv) }, cryptoKey, ab(data));
  return new Uint8Array(pt);
}

export interface EncryptedContent {
  ciphertext: Uint8Array;
  encMeta: EncMeta;
}

export async function encryptContent(
  plaintext: Uint8Array,
  contentKey: Uint8Array,
): Promise<EncryptedContent> {
  const fileKey = deriveConvergentKey(plaintext);

  const contentIv = deriveConvergentIv(plaintext);
  const ciphertext = await aesEncrypt(fileKey, contentIv, plaintext);

  const keyIv = deriveConvergentIv(fileKey);
  const wrapped = await aesEncrypt(contentKey, keyIv, fileKey);
  const wrappedKey = toBase64(keyIv) + ':' + toBase64(wrapped);

  return {
    ciphertext,
    encMeta: {
      algo: 'AES-256-GCM',
      iv: toBase64(contentIv),
      wrappedKey,
      chunkSize: DEFAULT_CHUNK_SIZE,
    },
  };
}

async function unwrapFileKey(wrappedKey: string, contentKey: Uint8Array): Promise<Uint8Array> {
  const [keyIvB64, wrappedB64] = wrappedKey.split(':');
  if (!keyIvB64 || !wrappedB64) {
    throw new Error('malformed wrappedKey');
  }
  return aesDecrypt(contentKey, fromBase64(keyIvB64), fromBase64(wrappedB64));
}

export async function decryptContent(
  ciphertext: Uint8Array,
  encMeta: EncMeta,
  contentKey: Uint8Array,
): Promise<Uint8Array> {
  const fileKey = await unwrapFileKey(encMeta.wrappedKey, contentKey);
  return aesDecrypt(fileKey, fromBase64(encMeta.iv), ciphertext);
}

export async function exportShareKey(encMeta: EncMeta, contentKey: Uint8Array): Promise<string> {
  const fileKey = await unwrapFileKey(encMeta.wrappedKey, contentKey);
  return toBase64(fileKey);
}

export async function decryptWithShareKey(
  ciphertext: Uint8Array,
  encMeta: EncMeta,
  shareKeyB64: string,
): Promise<Uint8Array> {
  const fileKey = fromBase64(shareKeyB64);
  return aesDecrypt(fileKey, fromBase64(encMeta.iv), ciphertext);
}
