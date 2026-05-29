import { SovraError } from '@sovrasdk/contracts';
import type { ExtensionContext, ExtensionRouter, SovraExtension } from '@sovrasdk/extension-api';
import { HostingService } from './hosting-service.js';
import { DomainService } from './domain-service.js';
import { CloudflareIntegration } from './cloudflare.js';
import { createCfApi, createCfTokenStore } from './cf-adapters.js';
import { migrations } from './migrations.js';
import type { SiteFile } from './manifest.js';

interface DeployBody {
  siteId?: string;
  files?: Array<{ path: string; contentBase64: string }>;
  domain?: string | null;
}

export function createWebHostingExtension(): SovraExtension {
  return {
    migrations,
    activate(ctx: ExtensionContext, router: ExtensionRouter): void {
      if (!ctx.storage || !ctx.proxy) {
        throw new SovraError('permission_denied', 'storage and proxy capabilities required');
      }
      const serverIp = ctx.env.SOVRA_SERVER_IP ?? '127.0.0.1';
      const coreUpstream = ctx.env.SOVRA_CORE_UPSTREAM ?? 'http://127.0.0.1:8787';

      const hosting = new HostingService(ctx.db, ctx.storage);
      const domains = new DomainService(ctx.db, ctx.proxy, serverIp, coreUpstream);
      const cf = new CloudflareIntegration(
        createCfApi(
          ctx.net ?? {
            async fetch() {
              throw new SovraError('permission_denied', 'net capability not granted');
            },
          },
        ),
        createCfTokenStore(ctx.db),
        ctx.secrets,
      );

      router.get('/sites', () => ({ status: 200, body: { sites: hosting.listSites() } }));

      router.post('/sites', (req) => {
        const body = req.body as { name?: string };
        const site = hosting.createSite(body.name ?? 'site');
        ctx.audit.record('site.create', 'ok', { id: site.id });
        return { status: 200, body: site };
      });

      router.get('/sites/:id/versions', (req) => {
        const id = req.params.id ?? req.query.id ?? '';
        return { status: 200, body: { versions: hosting.listVersions(id) } };
      });

      router.post('/sites/:id/deploy', async (req) => {
        const id = req.params.id ?? req.query.id ?? '';
        const body = req.body as DeployBody;
        const files: SiteFile[] = (body.files ?? []).map((f) => ({
          path: f.path,
          content: new Uint8Array(Buffer.from(f.contentBase64, 'base64')),
        }));
        const manifest = await hosting.deploy(id, files, body.domain ?? null);
        ctx.audit.record('site.deploy', 'ok', { id, version: manifest.version });
        return { status: 200, body: manifest };
      });

      router.post('/sites/:id/rollback', (req) => {
        const id = req.params.id ?? req.query.id ?? '';
        const body = req.body as { manifestId?: string };
        if (!body.manifestId) throw new SovraError('validation_error', 'manifestId required');
        hosting.rollback(id, body.manifestId);
        return { status: 200, body: { ok: true } };
      });

      router.get('/domains', () => ({ status: 200, body: { domains: domains.list() } }));

      router.post('/domains', (req) => {
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

      router.post('/domains/:name/verify', async (req) => {
        const name = req.params.name ?? req.query.name ?? '';
        const body = req.body as { dnsResolves?: boolean };
        const result = await domains.verify(name, body.dnsResolves ?? false);
        return { status: 200, body: result };
      });

      router.get('/cloudflare/status', () => ({
        status: 200,
        body: { connected: cf.isConnected() },
      }));

      router.post('/cloudflare/connect', async (req) => {
        const body = req.body as { token?: string };
        if (!body.token) throw new SovraError('validation_error', 'token required');
        const result = await cf.connect(body.token);
        ctx.audit.record('cloudflare.connect', 'ok', { zones: result.zones.length });
        return { status: 200, body: result };
      });

      router.host(async (req) => {
        const siteId = domains.siteForHost(req.host);
        if (!siteId) return null;
        const served = await hosting.serve(siteId, req.path);
        return {
          status: 200,
          body: served.content,
          headers: { 'content-type': served.mime },
        };
      });
    },
    deactivate(): void {},
  };
}
