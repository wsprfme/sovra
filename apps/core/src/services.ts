import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDatabase, type DbHandle } from './db/index.js';
import { ContentStore } from './storage/content-store.js';
import { AuditLogger } from './audit/index.js';
import { AuthService } from './auth/index.js';
import { ExtensionRegistry } from './extensions/registry.js';
import { ExtensionHost } from './extensions/host.js';
import { CaddyAdminClient, ProxyController, RegistryDomainAuthorizer } from './proxy/index.js';
import { BackupService } from './backup/index.js';
import type { CoreConfig } from './config.js';

export interface Services {
  config: CoreConfig;
  dbHandle: DbHandle;
  store: ContentStore;
  audit: AuditLogger;
  auth: AuthService;
  extensions: ExtensionHost;
  proxy: ProxyController;
  backup: BackupService;
  close: () => void;
}

export function createServices(config: CoreConfig): Services {
  mkdirSync(dirname(config.dbPath), { recursive: true });
  mkdirSync(config.contentDir, { recursive: true });

  const dbHandle = openDatabase(config.dbPath);
  const store = new ContentStore(dbHandle.db, config.contentDir);
  const audit = new AuditLogger(dbHandle.db);
  const auth = new AuthService(dbHandle.db);
  const authorizer = new RegistryDomainAuthorizer();
  const caddy = new CaddyAdminClient(config.caddyAdminUrl);
  const proxy = new ProxyController(caddy, authorizer);

  const registry = new ExtensionRegistry(
    dbHandle.db,
    dbHandle.raw,
    {
      storage: {
        put: (content) => store.put(content),
        get: (cid) => store.get(cid),
        has: (cid) => store.has(cid),
        release: (cid) => store.release(cid),
      },
      proxy: {
        bindDomain: (host, upstream) => proxy.bindDomain(host, upstream),
        unbindDomain: (host) => proxy.unbindDomain(host),
        authorizeDomain: (host) => proxy.authorizeTls(host),
      },
      net: {
        async fetch(url, init) {
          const res = await fetch(url, init as RequestInit | undefined);
          return { status: res.status, body: await res.text() };
        },
      },
      env: {
        SOVRA_SERVER_IP: config.serverIp,
        SOVRA_PRIMARY_DOMAIN: config.primaryDomain,
        SOVRA_CORE_UPSTREAM: config.coreUpstream,
        SOVRA_QUOTA_BYTES: String(config.quotaBytes),
      },
      secretsKey: config.internalToken,
    },
    { record: (action, actor, result, detail) => audit.record(action, actor, result, detail) },
  );
  const extensions = new ExtensionHost(registry);

  const backup = new BackupService(
    { dbPath: config.dbPath, contentDir: config.contentDir },
    () => extensions.list().map((e) => e.id),
  );

  return {
    config,
    dbHandle,
    store,
    audit,
    auth,
    extensions,
    proxy,
    backup,
    close: () => dbHandle.close(),
  };
}
