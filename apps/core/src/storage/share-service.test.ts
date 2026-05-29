import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { SovraError } from '@sovra/contracts';
import { openDatabase, type DbHandle } from '../db/index.js';
import { ShareService } from './share-service.js';

let handle: DbHandle;

beforeEach(() => {
  handle = openDatabase(':memory:');
});
afterEach(() => handle.close());

describe('ShareService', () => {
  it('public share resolves without identity', () => {
    const s = new ShareService(handle.db);
    const link = s.create({ targetType: 'file', targetId: 'f1', mode: 'public' });
    expect(s.resolve(link.token).share.targetId).toBe('f1');
  });

  it('restricted share requires an allowed identity', () => {
    const s = new ShareService(handle.db);
    const link = s.create({
      targetType: 'file',
      targetId: 'f1',
      mode: 'restricted',
      allowedIdentities: ['alice'],
    });
    expect(() => s.resolve(link.token)).toThrow(SovraError);
    expect(() => s.resolve(link.token, 'bob')).toThrow(SovraError);
    expect(s.resolve(link.token, 'alice').share.mode).toBe('restricted');
  });

  it('expired share is rejected', () => {
    let now = 1000;
    const s = new ShareService(handle.db, () => now);
    const link = s.create({ targetType: 'file', targetId: 'f1', mode: 'public', expiresInSeconds: 10 });
    now += 11_000;
    expect(() => s.resolve(link.token)).toMatchObject;
    try {
      s.resolve(link.token);
      expect.unreachable();
    } catch (e) {
      expect((e as SovraError).code).toBe('share_expired');
    }
  });

  it('revoked share is rejected', () => {
    const s = new ShareService(handle.db);
    const link = s.create({ targetType: 'file', targetId: 'f1', mode: 'public' });
    s.revoke(link.token);
    try {
      s.resolve(link.token);
      expect.unreachable();
    } catch (e) {
      expect((e as SovraError).code).toBe('share_revoked');
    }
  });

  it('carries wrapped key for public share of private file', () => {
    const s = new ShareService(handle.db);
    const link = s.create({
      targetType: 'file',
      targetId: 'f1',
      mode: 'public',
      wrappedKey: 'share-key-material',
    });
    expect(s.resolve(link.token).wrappedKey).toBe('share-key-material');
  });
});
