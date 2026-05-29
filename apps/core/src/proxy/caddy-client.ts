export interface CaddyRoute {
  host: string;
  upstream: string;
}

export interface CaddyAdmin {
  setRoute(route: CaddyRoute): Promise<void>;
  removeRoute(host: string): Promise<void>;
  listRoutes(): Promise<CaddyRoute[]>;
}

export class CaddyAdminClient implements CaddyAdmin {
  constructor(
    private readonly adminUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private routeId(host: string): string {
    return `sovra-${host.replace(/[^a-z0-9]/gi, '_')}`;
  }

  async setRoute(route: CaddyRoute): Promise<void> {
    await this.removeRoute(route.host).catch(() => undefined);
    const config = {
      '@id': this.routeId(route.host),
      match: [{ host: [route.host] }],
      handle: [
        {
          handler: 'reverse_proxy',
          upstreams: [{ dial: route.upstream }],
        },
      ],
    };
    const res = await this.fetchImpl(`${this.adminUrl}/config/apps/http/servers/srv0/routes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      throw new Error(`caddy setRoute failed: ${res.status}`);
    }
  }

  async removeRoute(host: string): Promise<void> {
    const res = await this.fetchImpl(`${this.adminUrl}/id/${this.routeId(host)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`caddy removeRoute failed: ${res.status}`);
    }
  }

  async listRoutes(): Promise<CaddyRoute[]> {
    const res = await this.fetchImpl(`${this.adminUrl}/config/apps/http/servers/srv0/routes`, {
      method: 'GET',
    });
    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error(`caddy listRoutes failed: ${res.status}`);
    }
    const data = (await res.json()) as Array<{
      '@id'?: string;
      match?: Array<{ host?: string[] }>;
      handle?: Array<{ upstreams?: Array<{ dial?: string }> }>;
    }>;
    const routes: CaddyRoute[] = [];
    for (const r of data) {
      if (!r['@id']?.startsWith('sovra-')) continue;
      const host = r.match?.[0]?.host?.[0];
      const upstream = r.handle?.[0]?.upstreams?.[0]?.dial;
      if (host && upstream) routes.push({ host, upstream });
    }
    return routes;
  }
}
