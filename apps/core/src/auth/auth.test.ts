import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { openDatabase, type DbHandle } from '../db/index.js';
import { AuthService } from './index.js';
import { hashPassword, verifyPassword } from './password.js';
import { LockoutTracker } from './lockout.js';
import { SovraError } from '@sovra/contracts';

let handle: DbHandle;
let auth: AuthService;

beforeEach(() => {
  handle = openDatabase(':memory:');
  auth = new AuthService(handle.db);
});

afterEach(() => handle.close());

function bytesToHex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex');
}

describe('password auth', () => {
  it('hashes and verifies passwords without storing plaintext', () => {
    const stored = hashPassword('s3cret-pass');
    expect(stored).not.toContain('s3cret-pass');
    expect(verifyPassword('s3cret-pass', stored)).toBe(true);
    expect(verifyPassword('wrong', stored)).toBe(false);
  });

  it('creates account and logs in', () => {
    auth.createAccount({ username: 'admin', authMode: 'password', password: 'longpassword' });
    const token = auth.loginWithPassword('admin', 'longpassword', '1.1.1.1');
    expect(typeof token).toBe('string');
    expect(auth.requireSession(token)).toBeTruthy();
  });

  it('rejects wrong password and short passwords', () => {
    expect(() =>
      auth.createAccount({ username: 'admin', authMode: 'password', password: 'short' }),
    ).toThrow(SovraError);
    auth.createAccount({ username: 'admin', authMode: 'password', password: 'longpassword' });
    expect(() => auth.loginWithPassword('admin', 'nope', '1.1.1.1')).toThrow(SovraError);
  });
});

describe('keypair auth', () => {
  it('verifies a valid signature and rejects a forged one', () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);
    auth.createAccount({ username: 'admin', authMode: 'keypair', pubkey: bytesToHex(pub) });

    const challenge = 'login-challenge-123';
    const sig = ed25519.sign(new TextEncoder().encode(challenge), priv);
    const token = auth.loginWithSignature('admin', challenge, bytesToHex(sig), '1.1.1.1');
    expect(auth.requireSession(token)).toBeTruthy();

    expect(() =>
      auth.loginWithSignature('admin', challenge, bytesToHex(sig).replace(/.$/, '0'), '1.1.1.1'),
    ).toThrow(SovraError);
  });
});

describe('sessions', () => {
  it('rejects operations without a valid session', () => {
    expect(() => auth.requireSession(undefined)).toThrow(SovraError);
    expect(() => auth.requireSession('bogus')).toThrow(SovraError);
  });

  it('revokes a session', () => {
    auth.createAccount({ username: 'admin', authMode: 'password', password: 'longpassword' });
    const token = auth.loginWithPassword('admin', 'longpassword', '1.1.1.1');
    auth.sessions.revoke(token);
    expect(() => auth.requireSession(token)).toThrow(SovraError);
  });
});

describe('brute-force lockout', () => {
  it('locks a source after repeated failures and resets on success', () => {
    let now = 1000;
    const lockout = new LockoutTracker({ maxAttempts: 3, windowMs: 60000, lockMs: 60000 }, () => now);
    const a = new AuthService(handle.db, { lockout });
    a.createAccount({ username: 'admin', authMode: 'password', password: 'longpassword' });

    for (let i = 0; i < 3; i++) {
      expect(() => a.loginWithPassword('admin', 'wrong', 'attacker')).toThrow();
    }
    try {
      a.loginWithPassword('admin', 'longpassword', 'attacker');
      expect.unreachable('should be locked');
    } catch (e) {
      expect((e as SovraError).code).toBe('auth_locked');
    }

    now += 61000;
    expect(a.loginWithPassword('admin', 'longpassword', 'attacker')).toBeTruthy();
  });
});
