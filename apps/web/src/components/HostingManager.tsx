'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteEntry, DomainEntry } from '@/lib/hosting-client';
import { createSiteAction, registerDomainAction } from '@/app/actions/hosting';

interface Props {
  sites: SiteEntry[];
  domains: DomainEntry[];
  cloudflareConnected: boolean;
}

export function HostingManager({ sites, domains, cloudflareConnected }: Props) {
  const [siteName, setSiteName] = useState('');
  const [domainName, setDomainName] = useState('');
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [behindCf, setBehindCf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function addSite() {
    if (!siteName.trim()) return;
    setError(null);
    startTransition(async () => {
      const r = await createSiteAction(siteName.trim());
      if (!r.ok) setError(r.error);
      else {
        setSiteName('');
        router.refresh();
      }
    });
  }

  function addDomain() {
    if (!domainName.trim() || !siteId) return;
    setError(null);
    startTransition(async () => {
      const r = await registerDomainAction({ name: domainName.trim(), siteId, behindCloudflare: behindCf });
      if (!r.ok) setError(r.error);
      else {
        setDomainName('');
        router.refresh();
      }
    });
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="stat-title">Sites</div>
        <div className="form-row" style={{ marginTop: '0.7rem' }}>
          <input
            placeholder="my-site"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
          />
          <button className="primary" disabled={pending} onClick={addSite}>
            Create site
          </button>
        </div>
        {sites.length > 0 && (
          <div className="table-responsive" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="muted">{s.id}</td>
                    <td className="muted">{new Date(s.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="stat-title">Custom domains</div>
        <div className="muted" style={{ fontSize: '0.82rem', margin: '0.3rem 0 0.7rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <span>Cloudflare:</span>
          <span className="cf-indicator">
            <span className={`cf-dot ${cloudflareConnected ? 'connected' : ''}`} />
            <span>{cloudflareConnected ? 'connected' : 'not connected'}</span>
          </span>
        </div>
        <div className="form-row">
          <input
            placeholder="example.com"
            value={domainName}
            onChange={(e) => setDomainName(e.target.value)}
          />
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="row" style={{ gap: '0.4rem', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={behindCf}
              onChange={(e) => setBehindCf(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span className="muted">Behind Cloudflare</span>
          </label>
          <button className="primary" disabled={pending || sites.length === 0} onClick={addDomain}>
            Add domain
          </button>
        </div>
        {domains.length > 0 && (
          <div className="table-responsive" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Status</th>
                  <th>TLS</th>
                </tr>
              </thead>
              <tbody>
                {domains.map((d) => (
                  <tr key={d.name}>
                    <td>{d.name}</td>
                    <td>
                      <span className={`badge ${d.status === 'active' ? 'enabled' : ''}`}>{d.status}</span>
                    </td>
                    <td className="muted">{d.tlsStrategy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
