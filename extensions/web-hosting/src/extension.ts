import type { ExtensionContext, ExtensionRouter, SovraExtension } from '@sovra/extension-api';
import type { Db, ContentStore, ProxyController } from '@sovra/core';
import { HostingService } from './hosting-service.js';
import { DomainService } from './domain-service.js';

export interface WebHostingDeps {
  db: Db;
  store: ContentStore;
  proxy: ProxyController;
  serverIp: string;
  coreUpstream: string;
}

export function createWebHostingExtension(deps: WebHostingDeps): SovraExtension {
  const hosting = new HostingService(deps.db, deps.store);
  const domains = new DomainService(deps.db, deps.proxy, deps.serverIp, deps.coreUpstream);

  return {
    activate(ctx: ExtensionContext, router: ExtensionRouter): void {
      router.post('/sites', async (req) => {
        const body = req.body as { name?: string };
        const site = hosting.createSite(body.name ?? 'site');
        ctx.audit.record('site.create', 'ok', { id: site.id });
        return { status: 200, body: site };
      });

      router.get('/sites/:id/versions', async (req) => {
        const id = req.query.id ?? '';
        return { status: 200, body: { versions: hosting.listVersions(id) } };
      });

      router.post('/domains', async (req) => {
        const body = req.body as {
          name?: string;
          siteId?: string;
          behindCloudflare?: boolean;
          cloudflareActive?: boolean;
        };
        const result = domains.register({
          name: body.name ?? '',
          siteId: body.siteId ?? '',
          behindCloudflare: body.behindCloudflare,
          cloudflareActive: body.cloudflareActive,
        });
        ctx.audit.record('domain.register', 'ok', { domain: body.name });
        return { status: 200, body: result };
      });
    },
    deactivate(): void {},
  };
}
