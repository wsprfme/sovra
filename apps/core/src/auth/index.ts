import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { SovraError, type AuthMode } from '@sovrasdk/contracts';
import type { Db } from '../db/index.js';
import { account } from '../db/schema.js';
import { hashPassword, verifyPassword } from './password.js';
import { verifySignature } from './keypair.js';
import { SessionManager } from './session.js';
import { LockoutTracker } from './lockout.js';

export interface CreateAccountInput {
  username: string;
  authMode: AuthMode;
  password?: string;
  pubkey?: string;
}

export class AuthService {
  readonly sessions: SessionManager;
  private readonly lockout: LockoutTracker;

  constructor(
    private readonly db: Db,
    options: { sessions?: SessionManager; lockout?: LockoutTracker } = {},
  ) {
    this.sessions = options.sessions ?? new SessionManager(db);
    this.lockout = options.lockout ?? new LockoutTracker();
  }

  hasAccount(): boolean {
    return this.db.select().from(account).get() !== undefined;
  }

  createAccount(input: CreateAccountInput): string {
    if (this.hasAccount()) {
      throw new SovraError('validation_error', 'an account already exists');
    }
    const id = randomBytes(16).toString('hex');
    const createdAt = Date.now();

    if (input.authMode === 'password') {
      if (!input.password || input.password.length < 8) {
        throw new SovraError('validation_error', 'password must be at least 8 characters');
      }
      const salt = randomBytes(16).toString('base64');
      this.db
        .insert(account)
        .values({
          id,
          username: input.username,
          authMode: 'password',
          passwordHash: hashPassword(input.password),
          pubkey: null,
          kdfParams: JSON.stringify({ algo: 'argon2id', m: 19456, t: 2, p: 1, saltB64: salt }),
          createdAt,
        })
        .run();
    } else {
      if (!input.pubkey) {
        throw new SovraError('validation_error', 'pubkey required for keypair mode');
      }
      this.db
        .insert(account)
        .values({
          id,
          username: input.username,
          authMode: 'keypair',
          passwordHash: null,
          pubkey: input.pubkey,
          kdfParams: null,
          createdAt,
        })
        .run();
    }
    return id;
  }

  loginWithPassword(username: string, password: string, source: string): string {
    if (this.lockout.isLocked(source)) {
      throw new SovraError('auth_locked', 'too many attempts, try again later');
    }
    const row = this.db.select().from(account).where(eq(account.username, username)).get();
    if (!row || row.authMode !== 'password' || !row.passwordHash) {
      this.lockout.recordFailure(source);
      throw new SovraError('unauthorized', 'invalid credentials');
    }
    if (!verifyPassword(password, row.passwordHash)) {
      this.lockout.recordFailure(source);
      throw new SovraError('unauthorized', 'invalid credentials');
    }
    this.lockout.recordSuccess(source);
    return this.sessions.issue(row.id);
  }

  loginWithSignature(
    username: string,
    challenge: string,
    signatureHex: string,
    source: string,
  ): string {
    if (this.lockout.isLocked(source)) {
      throw new SovraError('auth_locked', 'too many attempts, try again later');
    }
    const row = this.db.select().from(account).where(eq(account.username, username)).get();
    if (!row || row.authMode !== 'keypair' || !row.pubkey) {
      this.lockout.recordFailure(source);
      throw new SovraError('unauthorized', 'invalid credentials');
    }
    const ok = verifySignature(row.pubkey, new TextEncoder().encode(challenge), signatureHex);
    if (!ok) {
      this.lockout.recordFailure(source);
      throw new SovraError('unauthorized', 'invalid signature');
    }
    this.lockout.recordSuccess(source);
    return this.sessions.issue(row.id);
  }

  requireSession(token: string | undefined): string {
    if (!token) {
      throw new SovraError('unauthorized', 'missing session');
    }
    return this.sessions.validate(token).accountId;
  }
}

export { hashPassword, verifyPassword, verifySignature, SessionManager, LockoutTracker };
