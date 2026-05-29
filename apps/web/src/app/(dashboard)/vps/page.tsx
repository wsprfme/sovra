import { coreClient } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

export default async function VpsPage() {
  const { extensions } = await coreClient.listExtensions();
  const ext = extensions.find((e) => e.id === 'vps');
  const enabled = ext?.status === 'enabled';

  return (
    <div>
      <h1 className="page-title">VPS Control</h1>
      {!enabled ? (
        <div className="card muted">
          The VPS extension is not enabled. Enable it from the Extensions page to manage external
          servers over SSH: status, services, and an interactive console.
        </div>
      ) : (
        <div className="card">
          <p className="muted">
            Add SSH connections to control your servers. Credentials are encrypted with a key derived
            from your identity and never stored in plaintext.
          </p>
        </div>
      )}
    </div>
  );
}
