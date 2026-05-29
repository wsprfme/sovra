import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  encryptContent,
  decryptContent,
  exportShareKey,
  decryptWithShareKey,
} from './content.js';
import { toBase64 } from './encoding.js';

function randomKey(): Uint8Array {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  return k;
}

describe('content encryption (AES-256-GCM, convergent)', () => {
  it('property: decrypt(encrypt(x)) === x', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 0, maxLength: 4096 }), async (bytes) => {
        const contentKey = randomKey();
        const { ciphertext, encMeta } = await encryptContent(bytes, contentKey);
        const out = await decryptContent(ciphertext, encMeta, contentKey);
        expect(toBase64(out)).toBe(toBase64(bytes));
      }),
      { numRuns: 50 },
    );
  });

  it('identical plaintext yields identical ciphertext (dedup-friendly)', async () => {
    const contentKey = randomKey();
    const data = new TextEncoder().encode('the same file contents');
    const a = await encryptContent(data, contentKey);
    const b = await encryptContent(data, contentKey);
    expect(toBase64(a.ciphertext)).toBe(toBase64(b.ciphertext));
  });

  it('never exposes the raw content key in persisted metadata', async () => {
    const contentKey = randomKey();
    const data = new TextEncoder().encode('secret');
    const { encMeta } = await encryptContent(data, contentKey);
    expect(encMeta.wrappedKey).not.toContain(toBase64(contentKey));
  });

  it('wrong content key fails to decrypt', async () => {
    const data = new TextEncoder().encode('secret');
    const { ciphertext, encMeta } = await encryptContent(data, randomKey());
    await expect(decryptContent(ciphertext, encMeta, randomKey())).rejects.toBeTruthy();
  });

  it('share key allows decryption without the owner content key', async () => {
    const contentKey = randomKey();
    const data = new TextEncoder().encode('shared photo bytes');
    const { ciphertext, encMeta } = await encryptContent(data, contentKey);

    const shareKey = await exportShareKey(encMeta, contentKey);
    const out = await decryptWithShareKey(ciphertext, encMeta, shareKey);
    expect(toBase64(out)).toBe(toBase64(data));
    expect(shareKey).not.toBe(toBase64(contentKey));
  });
});
