import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { SovraError } from '@sovra/contracts';
import type { Db } from '../db/index.js';
import { session } from '../db/schema.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SessionInfo {
  id: string;
  accountId: string;
}

export class SessionManager {
  constructor(
    private readonly db: Db,
    private readonly ttlMs: number = SESSION_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  issue(accountId: string): string {
    const token = randomBytes(32).toString('base64url');
    const id = randomBytes(16).toString('hex');
    const t = this.now();
    this.db
      .insert(session)
      .values({
        id,
        accountId,
        tokenHash: hashToken(token),
        expiresAt: t + this.ttlMs,
        createdAt: t,
      })
      .run();
    return token;
  }

  validate(token: string): SessionInfo {
    const row = this.db.select().from(session).where(eq(session.tokenHash, hashToken(token))).get();
    if (!row) {
      throw new SovraError('unauthorized', 'invalid session');
    }
    if (row.expiresAt <= this.now()) {
      this.db.delete(session).where(eq(session.id, row.id)).run();
      throw new SovraError('unauthorized', 'session expired');
    }
    return { id: row.id, accountId: row.accountId };
  }

  revoke(token: string): void {
    this.db.delete(session).where(eq(session.tokenHash, hashToken(token))).run();
  }
}
