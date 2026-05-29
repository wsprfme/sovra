import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CaddyAdminClient } from './caddy-client.js';
import { RegistryDomainAuthorizer, ProxyController } from './index.js';

function mockCaddy() {
  const calls: Array<{ method: string; url: string; body?: string }> = [];
  const store = new Map<string, unknown>();
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body as string });
    if (method === 'POST') {
      const body = JSON.parse(init!.body as string);
      store.set(body['@id'], body);
      return new Response('', { status: 200 });
    }
    if (method === 'DELETE') {
      const id = url.split('/id/')[1];
      if (id && store.has(id)) {
        store.delete(id);
        return new Response('', { status: 200 });
      }
      return new Response('', { status: 404 });
    }
    return new Response(JSON.stringify([...store.values()]), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('CaddyAdminClient', () => {
  it('sets and lists a route', async () => {
    const { fetchImpl } = mockCaddy();
    const client = new CaddyAdminClient('http://caddy:2019', fetchImpl);
    await client.setRoute({ host: 'example.com', upstream: '127.0.0.1:8080' });
    const routes = await client.listRoutes();
    expect(routes).toEqual([{ host: 'example.com', upstream: '127.0.0.1:8080' }]);
  });

  it('removes a route', async () => {
    const { fetchImpl } = mockCaddy();
    const client = new CaddyAdminClient('http://caddy:2019', fetchImpl);
    await client.setRoute({ host: 'a.com', upstream: 'x:1' });
    await client.removeRoute('a.com');
    expect(await client.listRoutes()).toHaveLength(0);
  });
});

describe('domain authorization (on-demand TLS ask)', () => {
  it('property: TLS issued only for active domains', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.domain(), { maxLength: 6 }),
        fc.domain(),
        (active, probe) => {
          const auth = new RegistryDomainAuthorizer();
          auth.reset(active);
          const expected = active.map((d) => d.toLowerCase()).includes(probe.toLowerCase());
          expect(auth.isActive(probe)).toBe(expected);
        },
      ),
    );
  });

  it('controller binds and unbinds domains affecting authorization', async () => {
    const { fetchImpl } = mockCaddy();
    const controller = new ProxyController(
      new CaddyAdminClient('http://caddy:2019', fetchImpl),
      new RegistryDomainAuthorizer(),
    );
    expect(controller.authorizeTls('site.com')).toBe(false);
    await controller.bindDomain('site.com', '127.0.0.1:8080');
    expect(controller.authorizeTls('site.com')).toBe(true);
    await controller.unbindDomain('site.com');
    expect(controller.authorizeTls('site.com')).toBe(false);
  });
});
