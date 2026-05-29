import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  authMode: text('auth_mode', { enum: ['password', 'keypair'] }).notNull(),
  passwordHash: text('password_hash'),
  pubkey: text('pubkey'),
  kdfParams: text('kdf_params'),
  createdAt: integer('created_at').notNull(),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => account.id),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const blob = sqliteTable('blob', {
  cid: text('cid').primaryKey(),
  byteSize: integer('byte_size').notNull(),
  refcount: integer('refcount').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const extension = sqliteTable('extension', {
  id: text('id').primaryKey(),
  version: text('version').notNull(),
  status: text('status', { enum: ['installed', 'enabled', 'disabled'] }).notNull(),
  permissions: text('permissions').notNull().default('[]'),
  manifest: text('manifest').notNull(),
  installedAt: integer('installed_at').notNull(),
});

export const extKv = sqliteTable(
  'ext_kv',
  {
    extId: text('ext_id').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.extId, t.key] }) }),
);

export const extMigration = sqliteTable(
  'ext_migration',
  {
    extId: text('ext_id').notNull(),
    migrationId: text('migration_id').notNull(),
    appliedAt: integer('applied_at').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.extId, t.migrationId] }) }),
);

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  action: text('action').notNull(),
  actor: text('actor').notNull(),
  ts: integer('ts').notNull(),
  result: text('result').notNull(),
  detail: text('detail'),
});

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const SCHEMA_VERSION = 2;

export const CREATE_STATEMENTS = `
CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
  auth_mode TEXT NOT NULL, password_hash TEXT, pubkey TEXT, kdf_params TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES account(id),
  token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blob (
  cid TEXT PRIMARY KEY, byte_size INTEGER NOT NULL,
  refcount INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS extension (
  id TEXT PRIMARY KEY, version TEXT NOT NULL, status TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]', manifest TEXT NOT NULL, installed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ext_kv (
  ext_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
  PRIMARY KEY (ext_id, key)
);
CREATE TABLE IF NOT EXISTS ext_migration (
  ext_id TEXT NOT NULL, migration_id TEXT NOT NULL, applied_at INTEGER NOT NULL,
  PRIMARY KEY (ext_id, migration_id)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, actor TEXT NOT NULL,
  ts INTEGER NOT NULL, result TEXT NOT NULL, detail TEXT
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;
