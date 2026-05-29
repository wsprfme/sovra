'use client';

import { encryptContent, decryptContent, type EncMeta } from '@sovra/crypto';

const KEY_STORAGE = 'sovra_content_key';

export function storeContentKey(keyB64: string): void {
  sessionStorage.setItem(KEY_STORAGE, keyB64);
}

export function hasContentKey(): boolean {
  return sessionStorage.getItem(KEY_STORAGE) !== null;
}

function getContentKey(): Uint8Array {
  const b64 = sessionStorage.getItem(KEY_STORAGE);
  if (!b64) throw new Error('content key unavailable; please re-authenticate');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function deriveAndStoreKey(password: string): Promise<void> {
  const enc = new TextEncoder();
  const salt = enc.encode('sovra-content-key-v1');
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    baseKey,
    256,
  );
  const keyB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  storeContentKey(keyB64);
}

export async function encryptForUpload(
  plaintext: Uint8Array,
): Promise<{ ciphertext: Uint8Array; encMeta: EncMeta }> {
  return encryptContent(plaintext, getContentKey());
}

export async function decryptDownloaded(
  ciphertext: Uint8Array,
  encMeta: EncMeta,
): Promise<Uint8Array> {
  return decryptContent(ciphertext, encMeta, getContentKey());
}
