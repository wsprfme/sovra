'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogListing } from '@/lib/core-client';
import {
  installExtensionAction,
  enableExtensionAction,
  disableExtensionAction,
  uninstallExtensionAction,
} from '@/app/actions/extensions';
import { Icon } from './Icon';

const PERMISSION_LABELS: Record<string, string> = {
  'storage:read': 'Read your stored files',
  'storage:write': 'Store and modify files',
  'proxy:manage': 'Manage domains and routing',
  'net:outbound:http': 'Make outbound HTTP requests',
  'net:outbound:dns': 'Manage DNS records',
  'net:outbound:ssh': 'Connect to servers over SSH',
};

export function ExtensionCard({ entry }: { entry: CatalogListing }) {
  const { manifest, status } = entry;
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function act(fn: () => Promise<{ ok: boolean; error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else router.refresh();
      setConfirming(false);
    });
  }

  const icon = manifest.contributes?.nav?.[0]?.icon ?? 'puzzle';

  return (
    <div className="card ext-card">
      <div className="ext-head">
        <div className="stat-icon">
          <Icon name={icon} size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="stat-title">{manifest.name}</div>
            <span className={`badge ${status === 'enabled' ? 'enabled' : ''}`}>{status}</span>
          </div>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            {manifest.description}
          </div>
          <div className="muted" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
            v{manifest.version} · {manifest.author || 'Unknown'}
          </div>
        </div>
      </div>

      {(status === 'available' || confirming) && manifest.permissions.length > 0 && (
        <div className="ext-perms">
          <div className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.3rem' }}>
            Permissions requested
          </div>
          <ul className="perm-list">
            {manifest.permissions.map((p) => (
              <li key={p}>
                <Icon name="shield" size={14} />
                <span>{PERMISSION_LABELS[p] ?? p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row ext-actions">
        {status === 'available' && (
          <button className="primary" disabled={pending} onClick={() => act(() => installExtensionAction(manifest.id))}>
            Install
          </button>
        )}

        {status === 'disabled' && !confirming && (
          <button className="primary" disabled={pending} onClick={() => setConfirming(true)}>
            Enable
          </button>
        )}
        {status === 'disabled' && confirming && (
          <>
            <button
              className="primary"
              disabled={pending}
              onClick={() => act(() => enableExtensionAction(manifest.id, manifest.permissions))}
            >
              Approve & enable
            </button>
            <button disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        )}

        {status === 'enabled' && (
          <button disabled={pending} onClick={() => act(() => disableExtensionAction(manifest.id))}>
            Disable
          </button>
        )}

        {(status === 'disabled' || status === 'installed') && !confirming && (
          <button
            className="danger"
            disabled={pending}
            onClick={() => act(() => uninstallExtensionAction(manifest.id, false))}
          >
            Uninstall
          </button>
        )}
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
