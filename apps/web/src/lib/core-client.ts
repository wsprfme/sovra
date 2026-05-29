import 'server-only';
import { cookies } from 'next/headers';
import { SovraError, type SovraErrorShape } from '@sovra/contracts';

const CORE_URL = process.env.SOVRA_CORE_URL ?? 'http://127.0.0.1:8787';
const INTERNAL_TOKEN = process.env.SOVRA_INTERNAL_TOKEN ?? '';
export const SESSION_COOKIE = 'sovra_session';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  withSession?: boolean;
  query?: Record<string, string>;
}

async function call<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-sovra-internal': INTERNAL_TOKEN,
  };

  if (options.withSession !== false) {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) headers['x-sovra-session'] = token;
  }

  const url = new URL(path, CORE_URL);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    let shape: SovraErrorShape | null = null;
    try {
      shape = (await res.json()) as SovraErrorShape;
    } catch {
      shape = null;
    }
    if (shape?.code) throw SovraError.fromJSON(shape);
    throw new SovraError('internal_error', `core request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const coreClient = {
  status: () => call<{ hasAccount: boolean; schemaVersion: number }>('/internal/status', { withSession: false }),
  setup: (body: { username: string; authMode: string; password?: string; pubkey?: string }) =>
    call<{ accountId: string }>('/internal/setup', { method: 'POST', body, withSession: false }),
  login: (body: { username: string; password?: string; challenge?: string; signature?: string }) =>
    call<{ token: string }>('/internal/login', { method: 'POST', body, withSession: false }),
  logout: (token: string) =>
    call<{ ok: boolean }>('/internal/logout', { method: 'POST', body: { token }, withSession: false }),
  listFiles: (path: string) =>
    call<{ files: FileEntry[] }>('/internal/files', { query: { path } }),
  moveFile: (id: string, parentPath: string) =>
    call<FileEntry>(`/internal/files/${id}/move`, { method: 'POST', body: { parentPath } }),
  trashFile: (id: string) => call<{ ok: boolean }>(`/internal/files/${id}/trash`, { method: 'POST' }),
  restoreFile: (id: string) => call<FileEntry>(`/internal/files/${id}/restore`, { method: 'POST' }),
  createAlbum: (name: string) =>
    call<{ id: string; name: string }>('/internal/albums', { method: 'POST', body: { name } }),
  addToAlbum: (albumId: string, fileId: string) =>
    call<{ ok: boolean }>(`/internal/albums/${albumId}/items`, { method: 'POST', body: { fileId } }),
  createShare: (body: {
    targetType: 'file' | 'album';
    targetId: string;
    mode: 'public' | 'restricted';
    allowedIdentities?: string[];
    expiresInSeconds?: number;
    wrappedKey?: string;
  }) => call<ShareEntry>('/internal/shares', { method: 'POST', body }),
  revokeShare: (token: string) => call<{ ok: boolean }>(`/internal/shares/${token}`, { method: 'DELETE' }),
  listExtensions: () => call<{ extensions: ExtensionEntry[] }>('/internal/extensions'),
  listAudit: (action?: string) =>
    call<{ entries: AuditEntry[] }>('/internal/audit', action ? { query: { action } } : {}),
};

export interface FileEntry {
  id: string;
  parentPath: string;
  name: string;
  cid: string;
  size: number;
  mime: string;
  visibility: 'public' | 'private';
  encMeta: import('@sovra/crypto').EncMeta | null;
  thumbCid: string | null;
  createdAt: number;
  updatedAt: number;
  trashedAt: number | null;
}

export interface ShareEntry {
  token: string;
  targetType: 'file' | 'album';
  targetId: string;
  mode: 'public' | 'restricted';
  expiresAt: number | null;
  revoked: boolean;
}

export interface ExtensionEntry {
  id: string;
  version: string;
  status: 'installed' | 'enabled' | 'disabled';
  permissions: string[];
}

export interface AuditEntry {
  action: string;
  actor: string;
  ts: number;
  result: string;
  detail: Record<string, unknown> | null;
}
