'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { VpsConnection } from '@/lib/vps-client';
import { addConnectionAction, fetchStatusAction, type VpsStatusResult } from '@/app/actions/vps';

export function VpsManager({ connections }: { connections: VpsConnection[] }) {
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, VpsStatusResult>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function add() {
    if (!host.trim() || !username.trim()) return;
    setError(null);
    startTransition(async () => {
      const r = await addConnectionAction({
        host: host.trim(),
        username: username.trim(),
        password: password || undefined,
      });
      if (!r.ok) setError(r.error);
      else {
        setHost('');
        setPassword('');
        router.refresh();
      }
    });
  }

  function check(id: string) {
    startTransition(async () => {
      const r = await fetchStatusAction(id);
      setStatuses((prev) => ({ ...prev, [id]: r }));
    });
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="stat-title">Add a server</div>
        <p className="muted" style={{ fontSize: '0.82rem', margin: '0.3rem 0 0.7rem' }}>
          Credentials are encrypted at rest with a key derived from this server&apos;s secret.
        </p>
        <div className="form-row">
          <input placeholder="host or IP" value={host} onChange={(e) => setHost(e.target.value)} />
          <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input
            placeholder="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="primary" disabled={pending} onClick={add}>
            Add
          </button>
        </div>
      </div>

      {connections.length === 0 ? (
        <div className="card muted">No servers connected yet.</div>
      ) : (
        connections.map((c) => (
          <div key={c.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="stat-title">
                  {c.username}@{c.host}:{c.port}
                </div>
                <div className="muted" style={{ fontSize: '0.8rem' }}>
                  Added {new Date(c.createdAt).toLocaleDateString()}
                </div>
              </div>
              <button disabled={pending} onClick={() => check(c.id)}>
                Refresh status
              </button>
            </div>
            {statuses[c.id] && (
              <div style={{ marginTop: '0.7rem' }}>
                {statuses[c.id]!.ok ? (
                  <pre className="vps-status">
                    {`uptime: ${statuses[c.id]!.status!.uptime}\nload:   ${statuses[c.id]!.status!.cpuLoad}\nmemory: ${statuses[c.id]!.status!.memory}\ndisk:   ${statuses[c.id]!.status!.disk}`}
                  </pre>
                ) : (
                  <div className="error">{statuses[c.id]!.error}</div>
                )}
              </div>
            )}
          </div>
        ))
      )}

      {error && <div className="error">{error}</div>}
    </div>
  );
}
