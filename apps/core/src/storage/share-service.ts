import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { SovraError, type ShareLink } from '@sovra/contracts';
import type { Db } from '../db/index.js';
import { shareLink } from '../db/schema.js';

export interface CreateShareInput {
  targetType: 'file' | 'album';
  targetId: string;
  mode: 'public' | 'restricted';
  allowedIdentities?: string[];
  expiresInSeconds?: number;
  wrappedKey?: string;
}

function rowToShare(row: typeof shareLink.$inferSelect): ShareLink {
  return {
    token: row.token,
    targetType: row.targetType,
    targetId: row.targetId,
    mode: row.mode,
    allowedIdentities: JSON.parse(row.allowedIdentities) as string[],
    expiresAt: row.expiresAt,
    revoked: row.revoked,
    createdAt: row.createdAt,
  };
}

export interface ResolvedShare {
  share: ShareLink;
  wrappedKey: string | null;
}

export class ShareService {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  create(input: CreateShareInput): ShareLink {
    const token = randomBytes(24).toString('base64url');
    const createdAt = this.now();
    const expiresAt =
      input.expiresInSeconds !== undefined ? createdAt + input.expiresInSeconds * 1000 : null;
    this.db
      .insert(shareLink)
      .values({
        token,
        targetType: input.targetType,
        targetId: input.targetId,
        mode: input.mode,
        allowedIdentities: JSON.stringify(input.allowedIdentities ?? []),
        wrappedKey: input.wrappedKey ?? null,
        expiresAt,
        revoked: false,
        createdAt,
      })
      .run();
    return rowToShare(this.db.select().from(shareLink).where(eq(shareLink.token, token)).get()!);
  }

  resolve(token: string, identity?: string): ResolvedShare {
    const row = this.db.select().from(shareLink).where(eq(shareLink.token, token)).get();
    if (!row) {
      throw new SovraError('not_found', 'share link not found');
    }
    if (row.revoked) {
      throw new SovraError('share_revoked', 'share link has been revoked');
    }
    if (row.expiresAt !== null && this.now() >= row.expiresAt) {
      throw new SovraError('share_expired', 'share link has expired');
    }
    if (row.mode === 'restricted') {
      const allowed = JSON.parse(row.allowedIdentities) as string[];
      if (!identity || !allowed.includes(identity)) {
        throw new SovraError('unauthorized', 'identity not permitted for this share');
      }
    }
    return { share: rowToShare(row), wrappedKey: row.wrappedKey };
  }

  revoke(token: string): void {
    const row = this.db.select().from(shareLink).where(eq(shareLink.token, token)).get();
    if (!row) throw new SovraError('not_found', 'share link not found');
    this.db.update(shareLink).set({ revoked: true }).where(eq(shareLink.token, token)).run();
  }
}
