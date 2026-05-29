import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type DbHandle } from '../db/index.js';
import { AuditLogger } from './index.js';

let handle: DbHandle;

beforeEach(() => {
  handle = openDatabase(':memory:');
});
afterEach(() => handle.close());

describe('AuditLogger', () => {
  it('records entries and lists them newest-first', () => {
    let now = 1000;
    const log = new AuditLogger(handle.db, () => now);
    log.record('login', 'admin', 'ok');
    now += 10;
    log.record('extension.install', 'admin', 'ok', { id: 'web-hosting' });
    const entries = log.list();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.action).toBe('extension.install');
    expect(entries[1]!.action).toBe('login');
  });

  it('filters by action', () => {
    const log = new AuditLogger(handle.db);
    log.record('login', 'admin', 'ok');
    log.record('login', 'admin', 'fail');
    log.record('share.create', 'admin', 'ok');
    expect(log.list({ action: 'login' })).toHaveLength(2);
  });

  it('redacts secret values', () => {
    const log = new AuditLogger(handle.db);
    log.record('cf.connect', 'admin', 'ok', { token: 'super-secret', zone: 'example.com' });
    const entry = log.list()[0]!;
    expect(entry.detail!.token).toBe('[redacted]');
    expect(entry.detail!.zone).toBe('example.com');
  });
});
