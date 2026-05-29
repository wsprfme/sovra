import type Database from 'better-sqlite3';
import { SovraError } from '@sovrasdk/contracts';
import type { ScopedDb } from '@sovrasdk/extension-api';

const TABLE_TOKEN = /^[a-z][a-z0-9_]*$/;

export function tablePrefix(extId: string): string {
  return `ext_${extId.replace(/-/g, '_')}_`;
}

export function createScopedDb(raw: Database.Database, extId: string): ScopedDb {
  const prefix = tablePrefix(extId);

  const table = (name: string): string => {
    if (!TABLE_TOKEN.test(name)) {
      throw new SovraError('validation_error', `invalid table name ${name}`);
    }
    return `${prefix}${name}`;
  };

  return {
    table,
    exec(sql: string): void {
      raw.exec(sql);
    },
    run(sql: string, params: unknown[] = []) {
      const info = raw.prepare(sql).run(...(params as never[]));
      return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
    },
    all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
      return raw.prepare(sql).all(...(params as never[])) as T[];
    },
    get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
      return raw.prepare(sql).get(...(params as never[])) as T | undefined;
    },
    transaction<T>(fn: () => T): T {
      return raw.transaction(fn)();
    },
  };
}
