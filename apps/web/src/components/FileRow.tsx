'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FileEntry } from '@/lib/core-client';
import { trashFileAction, createShareAction } from '@/app/actions/storage';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileRow({ file }: { file: FileEntry }) {
  const [pending, startTransition] = useTransition();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onTrash() {
    startTransition(async () => {
      const r = await trashFileAction(file.id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function onShare() {
    startTransition(async () => {
      const r = await createShareAction({ targetType: 'file', targetId: file.id, mode: 'public' });
      if (!r.ok) setError(r.error);
      else if (r.token) setShareUrl(`${window.location.origin}/s/${r.token}`);
    });
  }

  return (
    <tr>
      <td>{file.name}</td>
      <td>{formatSize(file.size)}</td>
      <td>
        <span className="badge">{file.visibility}</span>
      </td>
      <td>
        <div className="row">
          <button onClick={onShare} disabled={pending}>
            Share
          </button>
          <button className="danger" onClick={onTrash} disabled={pending}>
            Trash
          </button>
        </div>
        {shareUrl && (
          <div className="muted" style={{ fontSize: '0.78rem', marginTop: '0.3rem' }}>
            {shareUrl}
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </td>
    </tr>
  );
}
