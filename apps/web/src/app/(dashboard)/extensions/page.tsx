import { coreClient } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

export default async function ExtensionsPage() {
  const { extensions } = await coreClient.listExtensions();

  return (
    <div>
      <h1 className="page-title">Extensions</h1>
      {extensions.length === 0 ? (
        <div className="card muted">
          No extensions installed. First-party extensions (Web Hosting, VPS) can be installed from
          the catalog once published.
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Extension</th>
                <th>Version</th>
                <th>Status</th>
                <th>Permissions</th>
              </tr>
            </thead>
            <tbody>
              {extensions.map((ext) => (
                <tr key={ext.id}>
                  <td>{ext.id}</td>
                  <td>{ext.version}</td>
                  <td>
                    <span className={`badge ${ext.status === 'enabled' ? 'enabled' : ''}`}>
                      {ext.status}
                    </span>
                  </td>
                  <td className="muted">{ext.permissions.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
