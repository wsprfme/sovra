import { randomBytes } from 'node:crypto';
import { SovraError } from '@sovrasdk/contracts';
import type { ScopedDb } from '@sovrasdk/extension-api';
import type { CreateShareInput, ShareLink } from './types.js';

interface ShareRow {
  token: string;
  target_type: 'file' | 'album';
  target_id: string;
  mode: 'public' | 'restricted';
  allowed_identities: string;
  wrapped_key: string | null;
  expires_at: number | null;
  revoked: number;
  created_at: number;
}

function rowToShare(row: ShareRow): ShareLink {
  return {
    token: row.token,
    targetType: row.target_type,
    targetId: row.target_id,
    mode: row.mode,
    allowedIdentities: JSON.parse(row.allowed_identities) as string[],
    expiresAt: row.expires_at,
    revoked: row.revoked === 1,
    createdAt: row.created_at,
  };
}

export interface ResolvedShare {
  share: ShareLink;
  wrappedKey: string | null;
}

export class ShareService {
  private readonly shares: string;

  constructor(
    private readonly db: ScopedDb,
    private readonly now: () => number = Date.now,
  ) {
    this.shares = db.table('share');
  }

  create(input: CreateShareInput): ShareLink {
    const token = randomBytes(24).toString('base64url');
    const createdAt = this.now();
    const expiresAt =
      input.expiresInSeconds !== undefined ? createdAt + input.expiresInSeconds * 1000 : null;
    this.db.run(
      `INSERT INTO ${this.shares}
        (token, target_type, target_id, mode, allowed_identities, wrapped_key, expires_at, revoked, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        token,
        input.targetType,
        input.targetId,
        input.mode,
        JSON.stringify(input.allowedIdentities ?? []),
        input.wrappedKey ?? null,
        expiresAt,
        createdAt,
      ],
    );
    return rowToShare(this.requireRow(token));
  }

  private requireRow(token: string): ShareRow {
    const row = this.db.get<ShareRow>(`SELECT * FROM ${this.shares} WHERE token = ?`, [token]);
    if (!row) throw new SovraError('not_found', 'share link not found');
    return row;
  }

  resolve(token: string, identity?: string): ResolvedShare {
    const row = this.requireRow(token);
    if (row.revoked === 1) {
      throw new SovraError('share_revoked', 'share link has been revoked');
    }
    if (row.expires_at !== null && this.now() >= row.expires_at) {
      throw new SovraError('share_expired', 'share link has expired');
    }
    if (row.mode === 'restricted') {
      const allowed = JSON.parse(row.allowed_identities) as string[];
      if (!identity || !allowed.includes(identity)) {
        throw new SovraError('unauthorized', 'identity not permitted for this share');
      }
    }
    return { share: rowToShare(row), wrappedKey: row.wrapped_key };
  }

  revoke(token: string): void {
    this.requireRow(token);
    this.db.run(`UPDATE ${this.shares} SET revoked = 1 WHERE token = ?`, [token]);
  }
}
