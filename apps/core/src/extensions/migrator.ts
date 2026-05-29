import { and, eq } from 'drizzle-orm';
import { SovraError } from '@sovrasdk/contracts';
import type { Migration, ScopedDb } from '@sovrasdk/extension-api';
import type { Db } from '../db/index.js';
import { extMigration } from '../db/schema.js';

export function runMigrations(
  db: Db,
  scoped: ScopedDb,
  extId: string,
  migrations: Migration[],
  now: () => number = Date.now,
): string[] {
  const applied: string[] = [];
  for (const migration of migrations) {
    const already = db
      .select()
      .from(extMigration)
      .where(and(eq(extMigration.extId, extId), eq(extMigration.migrationId, migration.id)))
      .get();
    if (already) continue;

    try {
      if (typeof migration.up === 'string') {
        scoped.exec(migration.up);
      } else {
        migration.up(scoped);
      }
    } catch (cause) {
      throw new SovraError('extension_failure', `migration ${migration.id} failed for ${extId}`, {
        detail: { id: extId, migration: migration.id },
        cause,
      });
    }

    db.insert(extMigration)
      .values({ extId, migrationId: migration.id, appliedAt: now() })
      .run();
    applied.push(migration.id);
  }
  return applied;
}
