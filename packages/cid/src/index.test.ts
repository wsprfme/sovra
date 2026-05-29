import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeCid, isValidCid, verifyContent, assertContent } from './index.js';
import { SovraError } from '@sovra/contracts';

describe('CID content addressing', () => {
  it('produces a syntactically valid CID', () => {
    const cid = computeCid(new Uint8Array([1, 2, 3]));
    expect(isValidCid(cid)).toBe(true);
  });

  it('property: identical bytes yield identical CID', () => {
    fc.assert(
      fc.property(fc.uint8Array(), (bytes) => {
        expect(computeCid(bytes)).toBe(computeCid(Uint8Array.from(bytes)));
      }),
    );
  });

  it('property: different bytes yield different CID', () => {
    fc.assert(
      fc.property(fc.uint8Array(), fc.uint8Array(), (a, b) => {
        fc.pre(Buffer.compare(Buffer.from(a), Buffer.from(b)) !== 0);
        expect(computeCid(a)).not.toBe(computeCid(b));
      }),
    );
  });

  it('property: verifyContent matches only the originating bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1 }), (bytes) => {
        const cid = computeCid(bytes);
        expect(verifyContent(cid, bytes)).toBe(true);
        const tampered = Uint8Array.from(bytes);
        tampered[0] = (tampered[0]! ^ 0xff) & 0xff;
        expect(verifyContent(cid, tampered)).toBe(false);
      }),
    );
  });

  it('rejects invalid CID strings', () => {
    expect(isValidCid('nope')).toBe(false);
    expect(isValidCid('b3-XYZ')).toBe(false);
    expect(verifyContent('nope', new Uint8Array())).toBe(false);
  });

  it('assertContent throws content_corrupted on mismatch', () => {
    const cid = computeCid(new Uint8Array([1, 2, 3]));
    expect(() => assertContent(cid, new Uint8Array([1, 2, 3]))).not.toThrow();
    try {
      assertContent(cid, new Uint8Array([9, 9, 9]));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(SovraError.is(e)).toBe(true);
      expect((e as SovraError).code).toBe('content_corrupted');
    }
  });
});
