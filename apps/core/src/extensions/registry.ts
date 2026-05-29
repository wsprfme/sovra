import type Database from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import {
  SovraError,
  type ExtensionManifest,
  type ExtensionRecord,
  type Permission,
} from '@sovrasdk/contracts';
import type {
  ExtensionContext,
  ExtensionRouteHandler,
  ExtensionRouter,
  HostHandler,
  HostRequest,
  ScopedKv,
  SovraExtension,
  StorageCapability,
  ProxyCapability,
  NetCapability,
} from '@sovrasdk/extension-api';
import type { Db } from '../db/index.js';
import { extension, extKv, extMigration } from '../db/schema.js';
import { parseManifest } from './manifest.js';
import { createScopedDb, tablePrefix } from './scoped-db.js';
import { runMigrations } from './migrator.js';
import { createSecrets } from './secrets.js';

export interface Capabilities {
  storage?: StorageCapability;
  proxy?: ProxyCapability;
  net?: NetCapability;
  env?: Record<string, string>;
  secretsKey: string;
}

export interface LoadedRoute {
  method: 'get' | 'post' | 'delete';
  path: string;
  segments: string[];
  handler: ExtensionRouteHandler;
  public: boolean;
}

function matchRoute(
  route: LoadedRoute,
  method: string,
  path: string,
): Record<string, string> | null {
  if (route.method !== method) return null;
  const actual = path.split('/').filter((s) => s.length > 0);
  if (actual.length !== route.segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < route.segments.length; i += 1) {
    const seg = route.segments[i]!;
    const val = actual[i]!;
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = decodeURIComponent(val);
    } else if (seg !== val) {
      return null;
    }
  }
  return params;
}

interface ActiveExtension {
  instance: SovraExtension;
  routes: LoadedRoute[];
  hostHandlers: HostHandler[];
}

export interface AuditSink {
  record(action: string, actor: string, result: string, detail?: Record<string, unknown>): void;
}

export type ExtensionFactory = (manifest: ExtensionManifest) => SovraExtension;

function rowToRecord(row: {
  id: string;
  version: string;
  status: 'installed' | 'enabled' | 'disabled';
  permissions: string;
  manifest: string;
  installedAt: number;
}): ExtensionRecord {
  const manifest = JSON.parse(row.manifest) as ExtensionManifest;
  return {
    id: row.id,
    name: manifest.name,
    version: row.version,
    description: manifest.description,
    author: manifest.author,
    status: row.status,
    permissions: JSON.parse(row.permissions) as Permission[],
    nav: manifest.contributes?.nav ?? [],
    installedAt: row.installedAt,
  };
}

export class ExtensionRegistry {
  private active = new Map<string, ActiveExtension>();

  constructor(
    private readonly db: Db,
    private readonly raw: Database.Database,
    private readonly capabilities: Capabilities,
    private readonly audit: AuditSink,
  ) {}

  install(manifestInput: unknown): ExtensionRecord {
    const manifest = parseManifest(manifestInput);
    const existing = this.db.select().from(extension).where(eq(extension.id, manifest.id)).get();
    if (existing) {
      throw new SovraError('validation_error', `extension ${manifest.id} already installed`);
    }
    const installedAt = Date.now();
    this.db
      .insert(extension)
      .values({
        id: manifest.id,
        version: manifest.version,
        status: 'disabled',
        permissions: JSON.stringify(manifest.permissions),
        manifest: JSON.stringify(manifest),
        installedAt,
      })
      .run();
    this.audit.record('extension.install', 'system', 'ok', { id: manifest.id });
    return rowToRecord({
      id: manifest.id,
      version: manifest.version,
      status: 'installed',
      permissions: JSON.stringify(manifest.permissions),
      manifest: JSON.stringify(manifest),
      installedAt,
    });
  }

  get(id: string): ExtensionRecord | undefined {
    const row = this.db.select().from(extension).where(eq(extension.id, id)).get();
    return row ? rowToRecord(row) : undefined;
  }

  list(): ExtensionRecord[] {
    return this.db.select().from(extension).all().map(rowToRecord);
  }

  getManifest(id: string): ExtensionManifest {
    const row = this.db.select().from(extension).where(eq(extension.id, id)).get();
    if (!row) throw new SovraError('not_found', `extension ${id} not installed`);
    return JSON.parse(row.manifest) as ExtensionManifest;
  }

  async enable(id: string, factory: ExtensionFactory, approvedPermissions: Permission[]): Promise<void> {
    const row = this.db.select().from(extension).where(eq(extension.id, id)).get();
    if (!row) throw new SovraError('not_found', `extension ${id} not installed`);
    const manifest = JSON.parse(row.manifest) as ExtensionManifest;

    const requested = new Set(manifest.permissions);
    for (const p of requested) {
      if (!approvedPermissions.includes(p)) {
        throw new SovraError('permission_denied', `permission ${p} not approved for ${id}`, {
          detail: { id, permission: p },
        });
      }
    }

    const ctx = this.buildContext(id, requested);
    const routes: LoadedRoute[] = [];
    const hostHandlers: HostHandler[] = [];
    const seg = (p: string): string[] => p.split('/').filter((s) => s.length > 0);
    const add = (
      method: 'get' | 'post' | 'delete',
      path: string,
      handler: ExtensionRouteHandler,
      isPublic: boolean,
    ): void => {
      routes.push({ method, path, segments: seg(path), handler, public: isPublic });
    };
    const router: ExtensionRouter = {
      get: (path, handler) => add('get', path, handler, false),
      post: (path, handler) => add('post', path, handler, false),
      delete: (path, handler) => add('delete', path, handler, false),
      public: {
        get: (path, handler) => add('get', path, handler, true),
        post: (path, handler) => add('post', path, handler, true),
        delete: (path, handler) => add('delete', path, handler, true),
      },
      host: (handler) => hostHandlers.push(handler),
    };

    let instance: SovraExtension;
    try {
      instance = factory(manifest);
      if (instance.migrations && instance.migrations.length > 0) {
        runMigrations(this.db, ctx.db, id, instance.migrations);
      }
      await instance.activate(ctx, router);
    } catch (cause) {
      this.audit.record('extension.enable', 'system', 'error', { id });
      if (SovraError.is(cause)) throw cause;
      throw new SovraError('extension_failure', `extension ${id} failed to activate`, {
        detail: { id },
        cause,
      });
    }

    this.active.set(id, { instance, routes, hostHandlers });
    this.db.update(extension).set({ status: 'enabled' }).where(eq(extension.id, id)).run();
    this.audit.record('extension.enable', 'system', 'ok', { id });
  }

  async disable(id: string): Promise<void> {
    const a = this.active.get(id);
    if (a) {
      try {
        await a.instance.deactivate();
      } catch {
        this.audit.record('extension.disable', 'system', 'deactivate_error', { id });
      }
      this.active.delete(id);
    }
    this.db.update(extension).set({ status: 'disabled' }).where(eq(extension.id, id)).run();
    this.audit.record('extension.disable', 'system', 'ok', { id });
  }

  async uninstall(id: string, options: { deleteData?: boolean } = {}): Promise<void> {
    await this.disable(id);
    this.db.delete(extension).where(eq(extension.id, id)).run();
    if (options.deleteData) {
      this.db.delete(extKv).where(eq(extKv.extId, id)).run();
      this.dropExtensionTables(id);
      this.db.delete(extMigration).where(eq(extMigration.extId, id)).run();
    }
    this.audit.record('extension.uninstall', 'system', 'ok', { id, deleteData: !!options.deleteData });
  }

  private dropExtensionTables(id: string): void {
    const prefix = tablePrefix(id);
    const tables = this.raw
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE ?`)
      .all(`${prefix}%`) as Array<{ name: string }>;
    for (const t of tables) {
      this.raw.exec(`DROP TABLE IF EXISTS "${t.name}"`);
    }
  }

  isEnabled(id: string): boolean {
    return this.active.has(id);
  }

  routesFor(id: string): LoadedRoute[] {
    return this.active.get(id)?.routes ?? [];
  }

  async dispatch(
    id: string,
    method: 'get' | 'post' | 'delete',
    path: string,
    req: Parameters<ExtensionRouteHandler>[0],
    options: { allowPublicOnly?: boolean } = {},
  ): Promise<{ status: number; body: unknown }> {
    const a = this.active.get(id);
    if (!a) {
      throw new SovraError('not_found', `extension ${id} not enabled`);
    }
    let matched: { route: LoadedRoute; params: Record<string, string> } | null = null;
    for (const route of a.routes) {
      const params = matchRoute(route, method, path);
      if (params) {
        matched = { route, params };
        break;
      }
    }
    if (!matched) {
      throw new SovraError('not_found', `route ${method.toUpperCase()} ${path} not found`);
    }
    if (options.allowPublicOnly && !matched.route.public) {
      throw new SovraError('unauthorized', `route ${method.toUpperCase()} ${path} is not public`);
    }
    try {
      return await matched.route.handler({ ...req, params: { ...req.params, ...matched.params } });
    } catch (cause) {
      if (SovraError.is(cause)) throw cause;
      this.audit.record('extension.dispatch', id, 'error', { path });
      throw new SovraError('extension_failure', `extension ${id} handler failed`, {
        detail: { id, path },
        cause,
      });
    }
  }

  async hostDispatch(
    req: HostRequest,
  ): Promise<{ status: number; body: unknown; headers?: Record<string, string> } | null> {
    for (const [id, active] of this.active) {
      for (const handler of active.hostHandlers) {
        try {
          const result = await handler(req);
          if (result) return result;
        } catch (cause) {
          this.audit.record('extension.host', id, 'error', { host: req.host });
          if (SovraError.is(cause)) throw cause;
          throw new SovraError('extension_failure', `extension ${id} host handler failed`, {
            detail: { id, host: req.host },
            cause,
          });
        }
      }
    }
    return null;
  }

  private buildContext(id: string, permissions: Set<Permission>): ExtensionContext {
    const has = (p: Permission) => permissions.has(p);
    const db = this.db;

    const kv: ScopedKv = {
      get(key) {
        const row = db
          .select()
          .from(extKv)
          .where(and(eq(extKv.extId, id), eq(extKv.key, key)))
          .get();
        return row?.value;
      },
      set(key, value) {
        db.insert(extKv)
          .values({ extId: id, key, value })
          .onConflictDoUpdate({ target: [extKv.extId, extKv.key], set: { value } })
          .run();
      },
      delete(key) {
        db.delete(extKv).where(and(eq(extKv.extId, id), eq(extKv.key, key))).run();
      },
      list() {
        return db
          .select()
          .from(extKv)
          .where(eq(extKv.extId, id))
          .all()
          .map((r) => ({ key: r.key, value: r.value }));
      },
    };

    const ctx: ExtensionContext = {
      id,
      permissions,
      env: { ...(this.capabilities.env ?? {}) },
      db: createScopedDb(this.raw, id),
      kv,
      secrets: createSecrets(this.capabilities.secretsKey, id),
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      audit: {
        record: (action, result, detail) =>
          this.audit.record(`ext:${id}:${action}`, id, result, detail),
      },
    };

    return {
      ...ctx,
      ...(has('storage:read') || has('storage:write') ? { storage: this.capabilities.storage } : {}),
      ...(has('proxy:manage') ? { proxy: this.capabilities.proxy } : {}),
      ...(has('net:outbound:http') || has('net:outbound:dns') || has('net:outbound:ssh')
        ? { net: this.capabilities.net }
        : {}),
    };
  }
}
