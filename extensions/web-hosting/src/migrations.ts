import type { Migration } from '@sovrasdk/extension-api';

export const migrations: Migration[] = [
  {
    id: '001-init',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ${db.table('site')} (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          active_manifest_id TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ${db.table('site_manifest')} (
          id TEXT PRIMARY KEY,
          site_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          manifest_text TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ${db.table('site_manifest')}_site_idx
          ON ${db.table('site_manifest')}(site_id);
        CREATE TABLE IF NOT EXISTS ${db.table('domain')} (
          name TEXT PRIMARY KEY,
          site_id TEXT NOT NULL,
          status TEXT NOT NULL,
          tls_strategy TEXT NOT NULL,
          verified_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS ${db.table('cf_integration')} (
          id TEXT PRIMARY KEY,
          token_enc TEXT NOT NULL,
          zones TEXT NOT NULL DEFAULT '[]'
        );
      `);
    },
  },
];
