import { desc, eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { auditLog } from '../db/schema.js';

const SECRET_KEYS = new Set(['password', 'token', 'key', 'secret', 'cred', 'wrappedKey', 'tokenEnc']);

function redact(detail: Record<string, unknown> | undefined): string | null {
  if (!detail) return null;
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    safe[k] = SECRET_KEYS.has(k) ? '[redacted]' : v;
  }
  return JSON.stringify(safe);
}

export interface AuditEntry {
  action: string;
  actor: string;
  ts: number;
  result: string;
  detail: Record<string, unknown> | null;
}

export class AuditLogger {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  record(action: string, actor: string, result: string, detail?: Record<string, unknown>): void {
    this.db
      .insert(auditLog)
      .values({ action, actor, ts: this.now(), result, detail: redact(detail) })
      .run();
  }

  list(options: { action?: string; limit?: number } = {}): AuditEntry[] {
    const limit = options.limit ?? 100;
    const rows = options.action
      ? this.db
          .select()
          .from(auditLog)
          .where(eq(auditLog.action, options.action))
          .orderBy(desc(auditLog.ts))
          .limit(limit)
          .all()
      : this.db.select().from(auditLog).orderBy(desc(auditLog.ts)).limit(limit).all();
    return rows.map((r) => ({
      action: r.action,
      actor: r.actor,
      ts: r.ts,
      result: r.result,
      detail: r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : null,
    }));
  }
}
