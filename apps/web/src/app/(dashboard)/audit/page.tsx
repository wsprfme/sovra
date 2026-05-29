import { coreClient } from '@/lib/core-client';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const { entries } = await coreClient.listAudit();

  return (
    <div>
      <h1 className="page-title">Audit Log</h1>
      {entries.length === 0 ? (
        <div className="card muted">No activity recorded yet.</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td className="muted">{new Date(e.ts).toLocaleString()}</td>
                  <td>{e.action}</td>
                  <td>{e.actor}</td>
                  <td>
                    <span className={`badge ${e.result === 'ok' ? 'enabled' : ''}`}>{e.result}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
