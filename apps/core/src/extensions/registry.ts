import { and, eq } from 'drizzle-orm';
import {
  SovraError,
  type ExtensionManifest,
  type ExtensionRecord,
  type Permission,
} from '@sovra/contracts';
import type {
  ExtensionContext,
  ExtensionRouteHandler,
  ExtensionRouter,
  ScopedKv,
  SovraExtension,
  StorageCapability,
  ProxyCapability,
  NetCapability,
} from '@sovra/extension-api';
import type { Db } from '../db/index.js';
import { extension, extKv } from '../db/schema.js';
import { parseManifest } from './manifest.js';

export interface Capabilities {
  storage?: StorageCapability;
  proxy?: ProxyCapability;
  net?: NetCapability;
}

export interface LoadedRoute {
  method: 'get' | 'post' | 'delete';
  path: string;
  handler: ExtensionRouteHandler;
}

interface ActiveExtension {
  instance: SovraExtension;
  routes: LoadedRoute[];
}

export interface AuditSink {
  record(action: string, actor: string, result: string, detail?: Record<string, unknown>): void;
}

export type ExtensionFactory = (manifest: ExtensionManifest) => SovraExtension;

export class ExtensionRegistry {
  private active = new Map<string, ActiveExtension>();

  constructor(
    private readonly db: Db,
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
    return {
      id: manifest.id,
      version: manifest.version,
      status: 'installed',
      permissions: manifest.permissions,
      installedAt,
    };
  }

  list(): ExtensionRecord[] {
    return this.db
      .select()
      .from(extension)
      .all()
      .map((row) => ({
        id: row.id,
        version: row.version,
        status: row.status,
        permissions: JSON.parse(row.permissions) as Permission[],
        installedAt: row.installedAt,
      }));
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
    const router: ExtensionRouter = {
      get: (path, handler) => routes.push({ method: 'get', path, handler }),
      post: (path, handler) => routes.push({ method: 'post', path, handler }),
      delete: (path, handler) => routes.push({ method: 'delete', path, handler }),
    };

    let instance: SovraExtension;
    try {
      instance = factory(manifest);
      await instance.activate(ctx, router);
    } catch (cause) {
      this.audit.record('extension.enable', 'system', 'error', { id });
      throw new SovraError('extension_failure', `extension ${id} failed to activate`, {
        detail: { id },
        cause,
      });
    }

    this.active.set(id, { instance, routes });
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
    }
    this.audit.record('extension.uninstall', 'system', 'ok', { id, deleteData: !!options.deleteData });
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
  ): Promise<{ status: number; body: unknown }> {
    const a = this.active.get(id);
    if (!a) {
      throw new SovraError('not_found', `extension ${id} not enabled`);
    }
    const route = a.routes.find((r) => r.method === method && r.path === path);
    if (!route) {
      throw new SovraError('not_found', `route ${method.toUpperCase()} ${path} not found`);
    }
    try {
      return await route.handler(req);
    } catch (cause) {
      if (SovraError.is(cause)) throw cause;
      this.audit.record('extension.dispatch', id, 'error', { path });
      throw new SovraError('extension_failure', `extension ${id} handler failed`, {
        detail: { id, path },
        cause,
      });
    }
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
      kv,
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
