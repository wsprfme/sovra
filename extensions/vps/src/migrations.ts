import type { Migration } from '@sovra/extension-api';

export const migrations: Migration[] = [
  {
    id: '001-init',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ${db.table('connection')} (
          id TEXT PRIMARY KEY,
          host TEXT NOT NULL,
          port INTEGER NOT NULL,
          username TEXT NOT NULL,
          cred_enc TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);
    },
  },
];
