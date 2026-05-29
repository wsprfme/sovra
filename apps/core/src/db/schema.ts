import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

export const folder = sqliteTable(
  'folder',
  {
    id: text('id').primaryKey(),
    path: text('path').notNull(),
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({ pathIdx: uniqueIndex('folder_path_idx').on(t.path) }),
);

export const fileObject = sqliteTable('file_object', {
  id: text('id').primaryKey(),
  parentPath: text('parent_path').notNull(),
  name: text('name').notNull(),
  cid: text('cid').notNull(),
  size: integer('size').notNull(),
  mime: text('mime').notNull(),
  visibility: text('visibility', { enum: ['public', 'private'] }).notNull(),
  encMeta: text('enc_meta'),
  thumbCid: text('thumb_cid'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  trashedAt: integer('trashed_at'),
});

export const album = sqliteTable('album', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const albumItem = sqliteTable(
  'album_item',
  {
    albumId: text('album_id')
      .notNull()
      .references(() => album.id),
    fileObjectId: text('file_object_id')
      .notNull()
      .references(() => fileObject.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.albumId, t.fileObjectId] }) }),
);

export const shareLink = sqliteTable('share_link', {
  token: text('token').primaryKey(),
  targetType: text('target_type', { enum: ['file', 'album'] }).notNull(),
  targetId: text('target_id').notNull(),
  mode: text('mode', { enum: ['public', 'restricted'] }).notNull(),
  allowedIdentities: text('allowed_identities').notNull().default('[]'),
  wrappedKey: text('wrapped_key'),
  expiresAt: integer('expires_at'),
  revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
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

export const site = sqliteTable('site', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  activeManifestId: text('active_manifest_id'),
  createdAt: integer('created_at').notNull(),
});

export const siteManifest = sqliteTable('site_manifest', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  version: integer('version').notNull(),
  manifestText: text('manifest_text').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const domain = sqliteTable('domain', {
  name: text('name').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => site.id),
  status: text('status', { enum: ['pending', 'active'] }).notNull(),
  tlsStrategy: text('tls_strategy', {
    enum: ['http-01', 'dns-01', 'cloudflare-origin'],
  }).notNull(),
  verifiedAt: integer('verified_at'),
});

export const cfIntegration = sqliteTable('cf_integration', {
  accountId: text('account_id').primaryKey(),
  tokenEnc: text('token_enc').notNull(),
  zones: text('zones').notNull().default('[]'),
});

export const vpsConnection = sqliteTable('vps_connection', {
  id: text('id').primaryKey(),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  username: text('username').notNull(),
  credEnc: text('cred_enc').notNull(),
  createdAt: integer('created_at').notNull(),
});

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

export const SCHEMA_VERSION = 1;

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
CREATE TABLE IF NOT EXISTS folder (
  id TEXT PRIMARY KEY, path TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS folder_path_idx ON folder(path);
CREATE TABLE IF NOT EXISTS file_object (
  id TEXT PRIMARY KEY, parent_path TEXT NOT NULL, name TEXT NOT NULL, cid TEXT NOT NULL,
  size INTEGER NOT NULL, mime TEXT NOT NULL, visibility TEXT NOT NULL,
  enc_meta TEXT, thumb_cid TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  trashed_at INTEGER
);
CREATE TABLE IF NOT EXISTS album (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS album_item (
  album_id TEXT NOT NULL REFERENCES album(id),
  file_object_id TEXT NOT NULL REFERENCES file_object(id),
  PRIMARY KEY (album_id, file_object_id)
);
CREATE TABLE IF NOT EXISTS share_link (
  token TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
  mode TEXT NOT NULL, allowed_identities TEXT NOT NULL DEFAULT '[]', wrapped_key TEXT,
  expires_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS extension (
  id TEXT PRIMARY KEY, version TEXT NOT NULL, status TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]', manifest TEXT NOT NULL, installed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ext_kv (
  ext_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
  PRIMARY KEY (ext_id, key)
);
CREATE TABLE IF NOT EXISTS site (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, active_manifest_id TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS site_manifest (
  id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES site(id),
  version INTEGER NOT NULL, manifest_text TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS domain (
  name TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES site(id),
  status TEXT NOT NULL, tls_strategy TEXT NOT NULL, verified_at INTEGER
);
CREATE TABLE IF NOT EXISTS cf_integration (
  account_id TEXT PRIMARY KEY, token_enc TEXT NOT NULL, zones TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS vps_connection (
  id TEXT PRIMARY KEY, host TEXT NOT NULL, port INTEGER NOT NULL,
  username TEXT NOT NULL, cred_enc TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, actor TEXT NOT NULL,
  ts INTEGER NOT NULL, result TEXT NOT NULL, detail TEXT
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;
