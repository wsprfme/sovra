import 'server-only';
import { coreClient } from './core-client';

export interface SiteEntry {
  id: string;
  name: string;
  createdAt: number;
}

export interface DomainEntry {
  name: string;
  siteId: string;
  status: 'pending' | 'active';
  tlsStrategy: string;
  verifiedAt: number | null;
}

const HOSTING = 'web-hosting';

export const hostingClient = {
  listSites: () => coreClient.ext<{ sites: SiteEntry[] }>(HOSTING, 'GET', '/sites'),
  listDomains: () => coreClient.ext<{ domains: DomainEntry[] }>(HOSTING, 'GET', '/domains'),
  cloudflareStatus: () =>
    coreClient.ext<{ connected: boolean }>(HOSTING, 'GET', '/cloudflare/status'),
};
