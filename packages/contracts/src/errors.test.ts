import { describe, expect, it } from 'vitest';
import {
  SovraError,
  makeError,
  sovraErrorSchema,
  isRetryableCode,
  ERROR_CODES,
} from './errors.js';

describe('SovraError', () => {
  it('serializes to a valid structured error shape', () => {
    const err = makeError('not_found', 'File missing', { id: 'x' });
    const json = err.toJSON();
    expect(() => sovraErrorSchema.parse(json)).not.toThrow();
    expect(json.code).toBe('not_found');
    expect(json.detail).toEqual({ id: 'x' });
    expect(typeof json.ts).toBe('number');
  });

  it('round-trips through fromJSON', () => {
    const original = new SovraError('quota_exceeded', 'over limit', { ts: 1234 });
    const restored = SovraError.fromJSON(original.toJSON());
    expect(restored.code).toBe('quota_exceeded');
    expect(restored.message).toBe('over limit');
    expect(restored.ts).toBe(1234);
  });

  it('classifies retryable vs non-retryable codes', () => {
    expect(new SovraError('rate_limited', 'slow down').retryable).toBe(true);
    expect(new SovraError('internal_error', 'boom').retryable).toBe(true);
    expect(new SovraError('unauthorized', 'no').retryable).toBe(false);
    expect(isRetryableCode('not_found')).toBe(false);
  });

  it('is detectable via static is()', () => {
    expect(SovraError.is(makeError('internal_error', 'x'))).toBe(true);
    expect(SovraError.is(new Error('plain'))).toBe(false);
  });

  it('rejects unknown error codes', () => {
    expect(() =>
      sovraErrorSchema.parse({ code: 'made_up', message: 'x', ts: 0 }),
    ).toThrow();
  });

  it('exposes a non-empty canonical code list', () => {
    expect(ERROR_CODES.length).toBeGreaterThan(0);
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
