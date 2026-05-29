'use client';

import { encryptForUpload } from './browser-crypto';
import { withRetry } from './retry';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export interface UploadParams {
  file: File;
  parentPath: string;
  visibility?: 'public' | 'private';
}

export async function uploadFile(params: UploadParams): Promise<void> {
  const raw = new Uint8Array(await params.file.arrayBuffer());
  const visibility = params.visibility ?? 'private';

  let contentBase64: string;
  let encMeta: unknown = null;
  if (visibility === 'private') {
    const { ciphertext, encMeta: meta } = await encryptForUpload(raw);
    contentBase64 = toBase64(ciphertext);
    encMeta = meta;
  } else {
    contentBase64 = toBase64(raw);
  }

  await withRetry(
    async () => {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          parentPath: params.parentPath,
          name: params.file.name,
          mime: params.file.type || 'application/octet-stream',
          visibility,
          contentBase64,
          encMeta,
        }),
      });
      if (!res.ok) {
        const err = new Error(`upload failed: ${res.status}`);
        (err as { status?: number }).status = res.status;
        throw err;
      }
    },
    {
      isRetryable: (e) => {
        const status = (e as { status?: number }).status;
        return status === undefined || status >= 500 || status === 429;
      },
    },
  );
}
