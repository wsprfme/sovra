'use client';

import { useEffect, useState } from 'react';
import type { FileEntry } from '@/lib/core-client';
import { decryptDownloaded } from '@/lib/browser-crypto';

export function PhotoTile({ photo }: { photo: FileEntry }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;

    async function load() {
      try {
        const res = await fetch(`/api/blob/${photo.cid}`);
        if (!res.ok) throw new Error('fetch failed');
        const cipher = new Uint8Array(await res.arrayBuffer());
        let bytes: Uint8Array = cipher;
        if (photo.visibility === 'private' && photo.encMeta) {
          bytes = await decryptDownloaded(cipher, photo.encMeta);
        }
        if (revoked) return;
        const ab = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(ab).set(bytes);
        const blob = new Blob([ab], { type: photo.mime });
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!revoked) setError(true);
      }
    }
    void load();

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.cid, photo.mime, photo.visibility, photo.encMeta]);

  return (
    <div className="tile">
      <div
        style={{
          aspectRatio: '1 / 1',
          background: 'var(--surface-2)',
          borderRadius: '6px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={photo.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span className="muted" style={{ fontSize: '0.75rem' }}>
            {error ? 'Failed' : 'Decrypting…'}
          </span>
        )}
      </div>
      <div className="name" style={{ marginTop: '0.5rem' }}>
        {photo.name}
      </div>
    </div>
  );
}
