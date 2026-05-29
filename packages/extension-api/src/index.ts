import type { Permission } from '@sovra/contracts';

export interface StorageCapability {
  put(content: Uint8Array): Promise<string>;
  get(cid: string): Promise<Uint8Array>;
}

export interface ProxyCapability {
  setRoute(host: string, upstream: string): Promise<void>;
  removeRoute(host: string): Promise<void>;
  authorizeDomain(host: string): boolean;
}

export interface NetCapability {
  fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{
    status: number;
    body: string;
  }>;
}

export interface ScopedKv {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  list(): Array<{ key: string; value: string }>;
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
  readonly storage?: StorageCapability;
  readonly proxy?: ProxyCapability;
  readonly net?: NetCapability;
  readonly kv: ScopedKv;
  readonly logger: Logger;
  readonly audit: AuditWriter;
}

export interface ExtensionRouter {
  get(path: string, handler: ExtensionRouteHandler): void;
  post(path: string, handler: ExtensionRouteHandler): void;
  delete(path: string, handler: ExtensionRouteHandler): void;
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
}

export type ExtensionRouteHandler = (req: ExtensionRequest) => Promise<ExtensionResponse> | ExtensionResponse;

export interface SovraExtension {
  activate(ctx: ExtensionContext, router: ExtensionRouter): Promise<void> | void;
  deactivate(): Promise<void> | void;
}
