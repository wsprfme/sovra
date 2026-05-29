import 'server-only';
import { cookies } from 'next/headers';
import { SovraError, type SovraErrorShape, type ExtensionRecord } from '@sovra/contracts';

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

export interface CatalogListing {
  manifest: {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    permissions: string[];
    contributes?: { nav?: ExtensionNav[] };
  };
  installed: boolean;
  status: 'installed' | 'enabled' | 'disabled' | 'available';
}

export interface ExtensionNav {
  id: string;
  title: string;
  icon: string;
  panel: string;
}

export const coreClient = {
  status: () =>
    call<{ hasAccount: boolean; schemaVersion: number; primaryDomain: string }>('/internal/status', {
      withSession: false,
    }),
  setup: (body: { username: string; authMode: string; password?: string; pubkey?: string }) =>
    call<{ accountId: string }>('/internal/setup', { method: 'POST', body, withSession: false }),
  login: (body: { username: string; password?: string; challenge?: string; signature?: string }) =>
    call<{ token: string }>('/internal/login', { method: 'POST', body, withSession: false }),
  logout: (token: string) =>
    call<{ ok: boolean }>('/internal/logout', { method: 'POST', body: { token }, withSession: false }),

  listExtensions: () => call<{ extensions: ExtensionRecord[] }>('/internal/extensions'),
  catalog: () => call<{ catalog: CatalogListing[] }>('/internal/extensions/catalog'),
  installExtension: (id: string) =>
    call<ExtensionRecord>('/internal/extensions/install', { method: 'POST', body: { id } }),
  enableExtension: (id: string, permissions: string[]) =>
    call<{ ok: boolean }>(`/internal/extensions/${id}/enable`, { method: 'POST', body: { permissions } }),
  disableExtension: (id: string) =>
    call<{ ok: boolean }>(`/internal/extensions/${id}/disable`, { method: 'POST' }),
  uninstallExtension: (id: string, deleteData: boolean) =>
    call<{ ok: boolean }>(`/internal/extensions/${id}`, {
      method: 'DELETE',
      query: deleteData ? { deleteData: 'true' } : {},
    }),

  ext: <T>(
    id: string,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ) =>
    call<T>(`/internal/ext/${id}${path}`, { method, body, query }),

  listAudit: (action?: string) =>
    call<{ entries: AuditEntry[] }>('/internal/audit', action ? { query: { action } } : {}),
};

export interface AuditEntry {
  action: string;
  actor: string;
  ts: number;
  result: string;
  detail: Record<string, unknown> | null;
}
