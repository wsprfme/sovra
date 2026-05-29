import { coreClient } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

export default async function HostingPage() {
  const { extensions } = await coreClient.listExtensions();
  const ext = extensions.find((e) => e.id === 'web-hosting');
  const enabled = ext?.status === 'enabled';

  return (
    <div>
      <h1 className="page-title">Web Hosting</h1>
      {!enabled ? (
        <div className="card muted">
          The Web Hosting extension is not enabled. Enable it from the Extensions page to host static
          sites with custom domains and automatic TLS.
        </div>
      ) : (
        <div className="card">
          <p className="muted">
            Deploy static sites by uploading a build directory. Each site can be mapped to a custom
            domain with automatic HTTPS via Caddy on-demand TLS, including Cloudflare-fronted domains.
          </p>
          <p className="muted">Site management UI is provided by the extension panel.</p>
        </div>
      )}
    </div>
  );
}
