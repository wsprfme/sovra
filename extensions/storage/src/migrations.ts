import type { Migration } from '@sovra/extension-api';

export const migrations: Migration[] = [
  {
    id: '001-init',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ${db.table('folder')} (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ${db.table('folder')}_path_idx
          ON ${db.table('folder')}(path);
        CREATE TABLE IF NOT EXISTS ${db.table('file')} (
          id TEXT PRIMARY KEY,
          parent_path TEXT NOT NULL,
          name TEXT NOT NULL,
          cid TEXT NOT NULL,
          size INTEGER NOT NULL,
          mime TEXT NOT NULL,
          visibility TEXT NOT NULL,
          enc_meta TEXT,
          thumb_cid TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          trashed_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS ${db.table('file')}_parent_idx
          ON ${db.table('file')}(parent_path);
        CREATE TABLE IF NOT EXISTS ${db.table('album')} (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ${db.table('album_item')} (
          album_id TEXT NOT NULL,
          file_id TEXT NOT NULL,
          PRIMARY KEY (album_id, file_id)
        );
        CREATE TABLE IF NOT EXISTS ${db.table('share')} (
          token TEXT PRIMARY KEY,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          mode TEXT NOT NULL,
          allowed_identities TEXT NOT NULL DEFAULT '[]',
          wrapped_key TEXT,
          expires_at INTEGER,
          revoked INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );
      `);
    },
  },
];
