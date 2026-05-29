import { randomBytes } from 'node:crypto';

export interface CoreConfig {
  dbPath: string;
  contentDir: string;
  host: string;
  port: number;
  internalToken: string;
  quotaBytes: number;
  caddyAdminUrl: string;
  rateLimit: { windowMs: number; max: number };
}

function envNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): CoreConfig {
  return {
    dbPath: process.env.SOVRA_DB_PATH ?? './data/sovra.db',
    contentDir: process.env.SOVRA_CONTENT_DIR ?? './data/content-store',
    host: process.env.SOVRA_CORE_HOST ?? '127.0.0.1',
    port: envNumber('SOVRA_CORE_PORT', 8787),
    internalToken: process.env.SOVRA_INTERNAL_TOKEN ?? randomBytes(32).toString('hex'),
    quotaBytes: envNumber('SOVRA_QUOTA_BYTES', 50 * 1024 * 1024 * 1024),
    caddyAdminUrl: process.env.SOVRA_CADDY_ADMIN_URL ?? 'http://127.0.0.1:2019',
    rateLimit: {
      windowMs: envNumber('SOVRA_RATELIMIT_WINDOW_MS', 60_000),
      max: envNumber('SOVRA_RATELIMIT_MAX', 120),
    },
  };
}
