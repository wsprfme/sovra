'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadFile } from '@/lib/upload-client';
import { hasContentKey, isCryptoAvailable } from '@/lib/browser-crypto';

interface Props {
  parentPath: string;
  defaultVisibility?: 'public' | 'private';
  accept?: string;
}

export function Uploader({ parentPath, defaultVisibility = 'private', accept }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);

    let visibility = defaultVisibility;
    if (visibility === 'private' && (!isCryptoAvailable() || !hasContentKey())) {
      if (!isCryptoAvailable()) {
        visibility = 'public';
      } else {
        setError('Encryption key not available in this session. Please sign out and back in.');
        return;
      }
    }

    setBusy(true);
    try {
      for (const file of files) {
        await uploadFile({ file, parentPath, visibility });
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" multiple accept={accept} onChange={onChange} hidden />
      <button className="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Uploading…' : 'Upload'}
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
