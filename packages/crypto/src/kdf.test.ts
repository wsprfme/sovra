import { describe, expect, it } from 'vitest';
import { deriveKey, generateSalt, newKdfParams } from './kdf.js';
import { toBase64 } from './encoding.js';

describe('Argon2id KDF', () => {
  it('derives a 32-byte key deterministically for same password+salt', () => {
    const params = newKdfParams(toBase64(generateSalt()));
    const a = deriveKey('correct horse battery staple', params);
    const b = deriveKey('correct horse battery staple', params);
    expect(a.length).toBe(32);
    expect(toBase64(a)).toBe(toBase64(b));
  });

  it('produces different keys for different passwords', () => {
    const params = newKdfParams(toBase64(generateSalt()));
    const a = deriveKey('password-one', params);
    const b = deriveKey('password-two', params);
    expect(toBase64(a)).not.toBe(toBase64(b));
  });

  it('produces different keys for different salts', () => {
    const a = deriveKey('same-password', newKdfParams(toBase64(generateSalt())));
    const b = deriveKey('same-password', newKdfParams(toBase64(generateSalt())));
    expect(toBase64(a)).not.toBe(toBase64(b));
  });
});
