import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { SCHEMA_VERSION } from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

export interface DbHandle {
  db: Db;
  raw: Database.Database;
  close: () => void;
}

export function openDatabase(path: string): DbHandle {
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.exec(schema.CREATE_STATEMENTS);

  const existing = raw
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get('schema_version') as { value: string } | undefined;
  if (!existing) {
    raw
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
      .run('schema_version', String(SCHEMA_VERSION));
  }

  const db = drizzle(raw, { schema });
  return { db, raw, close: () => raw.close() };
}

export function getSchemaVersion(handle: DbHandle): number {
  const row = handle.raw
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get('schema_version') as { value: string } | undefined;
  return row ? Number(row.value) : 0;
}

export { schema, SCHEMA_VERSION };
