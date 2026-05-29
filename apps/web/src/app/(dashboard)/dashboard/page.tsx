import Link from 'next/link';
import { coreClient } from '@/lib/core-client';
import { Icon } from '@/components/Icon';

export const dynamic = 'force-dynamic';

export default async function DashboardHome() {
  const [{ extensions }, status] = await Promise.all([
    coreClient.listExtensions(),
    coreClient.status(),
  ]);
  const enabled = extensions.filter((e) => e.status === 'enabled');
  const installed = extensions.length;

  return (
    <div>
      <h1 className="page-title">Welcome to Sovra</h1>

      {!status.primaryDomain && (
        <div className="card notice" style={{ marginBottom: '1.2rem' }}>
          <strong>You are on a plain HTTP connection.</strong>
          <p className="muted" style={{ margin: '0.4rem 0 0' }}>
            Set a primary domain to move your dashboard onto HTTPS. Until then, avoid using Sovra on
            untrusted networks.
          </p>
        </div>
      )}

      {enabled.length === 0 ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Your platform is a blank canvas</h2>
          <p className="muted">
            Sovra ships as a bare kernel. Nothing runs until you install it. Add capabilities from
            the extension catalog — a private drive, photo galleries, static web hosting, remote
            server control, or anything the community builds.
          </p>
          <Link href="/extensions">
            <button className="primary" style={{ marginTop: '0.6rem' }}>
              Browse extensions
            </button>
          </Link>
        </div>
      ) : (
        <div className="grid-cards">
          {enabled.map((ext) => (
            <div key={ext.id} className="card stat-card">
              <div className="stat-icon">
                <Icon name={ext.nav[0]?.icon ?? 'puzzle'} size={22} />
              </div>
              <div>
                <div className="stat-title">{ext.name}</div>
                <div className="muted" style={{ fontSize: '0.82rem' }}>
                  {ext.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: '1.2rem' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="stat-title">Extensions</div>
            <div className="muted" style={{ fontSize: '0.85rem' }}>
              {enabled.length} enabled / {installed} installed
            </div>
          </div>
          <Link href="/extensions">
            <button>Manage</button>
          </Link>
        </div>
      </div>
    </div>
  );
}
