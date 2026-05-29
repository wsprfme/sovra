import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openDatabase,
  type DbHandle,
  ContentStore,
  ProxyController,
  CaddyAdminClient,
  RegistryDomainAuthorizer,
  schema,
} from '@sovra/core';
import { eq } from 'drizzle-orm';
import { SovraError } from '@sovra/contracts';
import { DomainService } from './domain-service.js';
import { HostingService } from './hosting-service.js';

let handle: DbHandle;
let dir: string;
let proxy: ProxyController;
let domains: DomainService;
let hosting: HostingService;

function mockProxy(): ProxyController {
  const store = new Map<string, unknown>();
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'POST') {
      const body = JSON.parse(init!.body as string);
      store.set(body['@id'], body);
      return new Response('', { status: 200 });
    }
    if (method === 'DELETE') return new Response('', { status: 200 });
    return new Response(JSON.stringify([...store.values()]), { status: 200 });
  }) as unknown as typeof fetch;
  return new ProxyController(
    new CaddyAdminClient('http://caddy:2019', fetchImpl),
    new RegistryDomainAuthorizer(),
  );
}

beforeEach(async () => {
  handle = openDatabase(':memory:');
  dir = await mkdtemp(join(tmpdir(), 'sovra-dom-'));
  const store = new ContentStore(handle.db, dir);
  hosting = new HostingService(handle.db, store);
  proxy = mockProxy();
  domains = new DomainService(handle.db, proxy, '203.0.113.5', '127.0.0.1:8787');
});

afterEach(async () => {
  handle.close();
  await rm(dir, { recursive: true, force: true });
});

describe('custom domain registration', () => {
  it('registers as pending with DNS instructions and activates on verify', async () => {
    const { id } = hosting.createSite('site');
    const reg = domains.register({ name: 'example.com', siteId: id });
    expect(reg.domain.status).toBe('pending');
    expect(reg.dns.type).toBe('A');
    expect(reg.dns.value).toBe('203.0.113.5');
    expect(proxy.authorizeTls('example.com')).toBe(false);

    const verified = await domains.verify('example.com', true);
    expect(verified.status).toBe('active');
    expect(proxy.authorizeTls('example.com')).toBe(true);
  });

  it('rejects a domain already mapped to another site (domain_conflict)', async () => {
    const a = hosting.createSite('a');
    const b = hosting.createSite('b');
    domains.register({ name: 'shared.com', siteId: a.id });
    try {
      domains.register({ name: 'shared.com', siteId: b.id });
      expect.unreachable();
    } catch (e) {
      expect((e as SovraError).code).toBe('domain_conflict');
    }
  });

  it('chooses dns-01 when behind active Cloudflare, http-01 otherwise', () => {
    const { id } = hosting.createSite('site');
    const direct = domains.register({ name: 'direct.com', siteId: id });
    expect(direct.domain.tlsStrategy).toBe('http-01');
    const cf = domains.register({
      name: 'cf.com',
      siteId: id,
      behindCloudflare: true,
      cloudflareActive: true,
    });
    expect(cf.domain.tlsStrategy).toBe('dns-01');
  });

  it('retargets a domain without changing verification', async () => {
    const a = hosting.createSite('a');
    const b = hosting.createSite('b');
    domains.register({ name: 'site.com', siteId: a.id });
    await domains.verify('site.com', true);
    const retargeted = domains.retarget('site.com', b.id);
    expect(retargeted.siteId).toBe(b.id);
    expect(retargeted.status).toBe('active');
    const row = handle.db.select().from(schema.domain).where(eq(schema.domain.name, 'site.com')).get();
    expect(row!.verifiedAt).not.toBeNull();
  });
});
