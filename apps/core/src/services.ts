import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDatabase, type DbHandle } from './db/index.js';
import { ContentStore } from './storage/content-store.js';
import { StorageService } from './storage/storage-service.js';
import { ShareService } from './storage/share-service.js';
import { AuditLogger } from './audit/index.js';
import { AuthService } from './auth/index.js';
import { ExtensionRegistry } from './extensions/registry.js';
import { CaddyAdminClient, ProxyController, RegistryDomainAuthorizer } from './proxy/index.js';
import { BackupService } from './backup/index.js';
import type { CoreConfig } from './config.js';

export interface Services {
  config: CoreConfig;
  dbHandle: DbHandle;
  store: ContentStore;
  storage: StorageService;
  shares: ShareService;
  audit: AuditLogger;
  auth: AuthService;
  extensions: ExtensionRegistry;
  proxy: ProxyController;
  backup: BackupService;
  close: () => void;
}

export function createServices(config: CoreConfig): Services {
  mkdirSync(dirname(config.dbPath), { recursive: true });
  mkdirSync(config.contentDir, { recursive: true });

  const dbHandle = openDatabase(config.dbPath);
  const store = new ContentStore(dbHandle.db, config.contentDir);
  const storage = new StorageService(dbHandle.db, store, config.quotaBytes);
  const shares = new ShareService(dbHandle.db);
  const audit = new AuditLogger(dbHandle.db);
  const auth = new AuthService(dbHandle.db);
  const authorizer = new RegistryDomainAuthorizer();
  const caddy = new CaddyAdminClient(config.caddyAdminUrl);
  const proxy = new ProxyController(caddy, authorizer);
  const extensions = new ExtensionRegistry(
    dbHandle.db,
    {
      storage: {
        put: (content) => store.put(content),
        get: (cid) => store.get(cid),
      },
    },
    { record: (action, actor, result, detail) => audit.record(action, actor, result, detail) },
  );

  const backup = new BackupService(
    { dbPath: config.dbPath, contentDir: config.contentDir },
    () => extensions.list().map((e) => e.id),
  );

  return {
    config,
    dbHandle,
    store,
    storage,
    shares,
    audit,
    auth,
    extensions,
    proxy,
    backup,
    close: () => dbHandle.close(),
  };
}
