import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { SovraError, type ExtensionManifest } from '@sovra/contracts';
import type { SovraExtension } from '@sovra/extension-api';
import { openDatabase, type DbHandle } from '../db/index.js';
import { ExtensionRegistry, type AuditSink } from './registry.js';

let handle: DbHandle;
let registry: ExtensionRegistry;
const auditEntries: Array<{ action: string; result: string }> = [];

const audit: AuditSink = {
  record: (action, _actor, result) => auditEntries.push({ action, result }),
};

const validManifest: ExtensionManifest = {
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  engineVersion: '^0.1.0',
  permissions: ['storage:read'],
  contributes: { apiNamespace: 'demo', uiPanels: [] },
};

beforeEach(() => {
  handle = openDatabase(':memory:');
  auditEntries.length = 0;
  registry = new ExtensionRegistry(
    handle.db,
    {
      storage: {
        put: async () => 'b3-' + 'a'.repeat(64),
        get: async () => new Uint8Array(),
      },
    },
    audit,
  );
});

afterEach(() => handle.close());

describe('extension manifest validation', () => {
  it('rejects an invalid manifest', () => {
    try {
      registry.install({ id: 'Bad Id', name: '', version: 'x' });
      expect.unreachable();
    } catch (e) {
      expect((e as SovraError).code).toBe('invalid_extension_manifest');
    }
  });
});

describe('extension lifecycle', () => {
  it('installs as disabled and lists it', () => {
    const rec = registry.install(validManifest);
    expect(rec.status).toBe('installed');
    const list = registry.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe('disabled');
  });

  it('requires explicit permission approval before enabling', async () => {
    registry.install(validManifest);
    const factory = (): SovraExtension => ({ activate() {}, deactivate() {} });
    await expect(registry.enable('demo', factory, [])).rejects.toMatchObject({
      code: 'permission_denied',
    });
    await registry.enable('demo', factory, ['storage:read']);
    expect(registry.isEnabled('demo')).toBe(true);
  });

  it('injects only approved capabilities', async () => {
    registry.install(validManifest);
    let sawStorage = false;
    let sawProxy = true;
    const factory = (): SovraExtension => ({
      activate(ctx) {
        sawStorage = ctx.storage !== undefined;
        sawProxy = ctx.proxy !== undefined;
      },
      deactivate() {},
    });
    await registry.enable('demo', factory, ['storage:read']);
    expect(sawStorage).toBe(true);
    expect(sawProxy).toBe(false);
  });

  it('disables and uninstalls', async () => {
    registry.install(validManifest);
    const factory = (): SovraExtension => ({ activate() {}, deactivate() {} });
    await registry.enable('demo', factory, ['storage:read']);
    await registry.disable('demo');
    expect(registry.isEnabled('demo')).toBe(false);
    await registry.uninstall('demo');
    expect(registry.list()).toHaveLength(0);
  });
});

describe('failure isolation', () => {
  it('isolates an extension that throws on activate', async () => {
    registry.install(validManifest);
    const factory = (): SovraExtension => ({
      activate() {
        throw new Error('boom');
      },
      deactivate() {},
    });
    await expect(registry.enable('demo', factory, ['storage:read'])).rejects.toMatchObject({
      code: 'extension_failure',
    });
    expect(registry.isEnabled('demo')).toBe(false);
  });

  it('isolates a handler that throws at dispatch time', async () => {
    registry.install(validManifest);
    const factory = (): SovraExtension => ({
      activate(_ctx, router) {
        router.get('/boom', () => {
          throw new Error('handler exploded');
        });
      },
      deactivate() {},
    });
    await registry.enable('demo', factory, ['storage:read']);
    await expect(
      registry.dispatch('demo', 'get', '/boom', { params: {}, query: {}, body: null, headers: {} }),
    ).rejects.toMatchObject({ code: 'extension_failure' });
  });

  it('scoped kv stores and retrieves per-extension values', async () => {
    registry.install(validManifest);
    const factory = (): SovraExtension => ({
      activate(ctx, router) {
        ctx.kv.set('greeting', 'hello');
        router.get('/g', () => ({ status: 200, body: ctx.kv.get('greeting') }));
      },
      deactivate() {},
    });
    await registry.enable('demo', factory, ['storage:read']);
    const res = await registry.dispatch('demo', 'get', '/g', {
      params: {},
      query: {},
      body: null,
      headers: {},
    });
    expect(res.body).toBe('hello');
  });
});
