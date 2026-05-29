import type { Permission } from '@sovra/contracts';

export interface StorageCapability {
  put(content: Uint8Array): Promise<string>;
  get(cid: string): Promise<Uint8Array>;
  has(cid: string): boolean;
  release(cid: string): Promise<void>;
}

export interface ProxyCapability {
  bindDomain(host: string, upstream: string): Promise<void>;
  unbindDomain(host: string): Promise<void>;
  authorizeDomain(host: string): boolean;
}

export interface NetCapability {
  fetch(
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<{ status: number; body: string }>;
}

export interface SecretsCapability {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export interface ScopedKv {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  list(): Array<{ key: string; value: string }>;
}

export interface ScopedDb {
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined;
  table(name: string): string;
  transaction<T>(fn: () => T): T;
}

export interface Migration {
  id: string;
  up: string | ((db: ScopedDb) => void);
}

export interface Logger {
  info(msg: string, detail?: Record<string, unknown>): void;
  warn(msg: string, detail?: Record<string, unknown>): void;
  error(msg: string, detail?: Record<string, unknown>): void;
}

export interface AuditWriter {
  record(action: string, result: string, detail?: Record<string, unknown>): void;
}

export interface ExtensionContext {
  readonly id: string;
  readonly permissions: ReadonlySet<Permission>;
  readonly env: Readonly<Record<string, string>>;
  readonly db: ScopedDb;
  readonly kv: ScopedKv;
  readonly logger: Logger;
  readonly audit: AuditWriter;
  readonly storage?: StorageCapability;
  readonly proxy?: ProxyCapability;
  readonly net?: NetCapability;
  readonly secrets: SecretsCapability;
}

export interface ExtensionRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

export interface ExtensionResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export type ExtensionRouteHandler = (
  req: ExtensionRequest,
) => Promise<ExtensionResponse> | ExtensionResponse;

export type HostRequest = ExtensionRequest & { host: string; path: string };

export type HostHandler = (
  req: HostRequest,
) => Promise<ExtensionResponse | null> | ExtensionResponse | null;

export interface ExtensionRouter {
  get(path: string, handler: ExtensionRouteHandler): void;
  post(path: string, handler: ExtensionRouteHandler): void;
  delete(path: string, handler: ExtensionRouteHandler): void;
  readonly public: {
    get(path: string, handler: ExtensionRouteHandler): void;
    post(path: string, handler: ExtensionRouteHandler): void;
    delete(path: string, handler: ExtensionRouteHandler): void;
  };
  host(handler: HostHandler): void;
}

export interface SovraExtension {
  readonly migrations?: Migration[];
  activate(ctx: ExtensionContext, router: ExtensionRouter): Promise<void> | void;
  deactivate(): Promise<void> | void;
}
