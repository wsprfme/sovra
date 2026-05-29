import { SovraError } from '@sovrasdk/contracts';
import type { ProxyCapability, ScopedDb } from '@sovrasdk/extension-api';

export type TlsStrategy = 'http-01' | 'dns-01' | 'cloudflare-origin';
export type DomainStatus = 'pending' | 'active';

export interface Domain {
  name: string;
  siteId: string;
  status: DomainStatus;
  tlsStrategy: TlsStrategy;
  verifiedAt: number | null;
}

export interface RegisterDomainInput {
  name: string;
  siteId: string;
  behindCloudflare?: boolean;
  cloudflareActive?: boolean;
}

export interface DnsInstructions {
  type: 'A' | 'CNAME';
  name: string;
  value: string;
}

interface DomainRow {
  name: string;
  site_id: string;
  status: DomainStatus;
  tls_strategy: TlsStrategy;
  verified_at: number | null;
}

function rowToDomain(row: DomainRow): Domain {
  return {
    name: row.name,
    siteId: row.site_id,
    status: row.status,
    tlsStrategy: row.tls_strategy,
    verifiedAt: row.verified_at,
  };
}

export class DomainService {
  private readonly domains: string;
  private readonly sites: string;

  constructor(
    private readonly db: ScopedDb,
    private readonly proxy: ProxyCapability,
    private readonly serverIp: string,
    private readonly coreUpstream: string,
    private readonly now: () => number = Date.now,
  ) {
    this.domains = db.table('domain');
    this.sites = db.table('site');
  }

  private chooseStrategy(input: RegisterDomainInput): TlsStrategy {
    if (input.behindCloudflare && input.cloudflareActive) return 'dns-01';
    return 'http-01';
  }

  register(input: RegisterDomainInput): { domain: Domain; dns: DnsInstructions } {
    const siteRow = this.db.get(`SELECT 1 FROM ${this.sites} WHERE id = ?`, [input.siteId]);
    if (!siteRow) throw new SovraError('not_found', `site ${input.siteId} not found`);

    const existing = this.db.get<DomainRow>(`SELECT * FROM ${this.domains} WHERE name = ?`, [input.name]);
    if (existing && existing.site_id !== input.siteId) {
      throw new SovraError('domain_conflict', `${input.name} already mapped to another site`, {
        detail: { domain: input.name },
      });
    }

    const tlsStrategy = this.chooseStrategy(input);
    if (existing) {
      this.db.run(`UPDATE ${this.domains} SET site_id = ?, tls_strategy = ? WHERE name = ?`, [
        input.siteId,
        tlsStrategy,
        input.name,
      ]);
    } else {
      this.db.run(
        `INSERT INTO ${this.domains} (name, site_id, status, tls_strategy, verified_at) VALUES (?, ?, 'pending', ?, NULL)`,
        [input.name, input.siteId, tlsStrategy],
      );
    }

    const dns: DnsInstructions = input.behindCloudflare
      ? { type: 'CNAME', name: input.name, value: this.serverIp }
      : { type: 'A', name: input.name, value: this.serverIp };

    return {
      domain: { name: input.name, siteId: input.siteId, status: 'pending', tlsStrategy, verifiedAt: null },
      dns,
    };
  }

  async verify(name: string, dnsResolves: boolean): Promise<Domain> {
    const row = this.db.get<DomainRow>(`SELECT * FROM ${this.domains} WHERE name = ?`, [name]);
    if (!row) throw new SovraError('not_found', `domain ${name} not registered`);
    if (!dnsResolves) return rowToDomain(row);
    const verifiedAt = this.now();
    this.db.run(`UPDATE ${this.domains} SET status = 'active', verified_at = ? WHERE name = ?`, [
      verifiedAt,
      name,
    ]);
    await this.proxy.bindDomain(name, this.coreUpstream);
    return { ...rowToDomain(row), status: 'active', verifiedAt };
  }

  list(): Domain[] {
    return this.db.all<DomainRow>(`SELECT * FROM ${this.domains} ORDER BY name`).map(rowToDomain);
  }

  retarget(name: string, newSiteId: string): Domain {
    const row = this.db.get<DomainRow>(`SELECT * FROM ${this.domains} WHERE name = ?`, [name]);
    if (!row) throw new SovraError('not_found', `domain ${name} not registered`);
    this.db.run(`UPDATE ${this.domains} SET site_id = ? WHERE name = ?`, [newSiteId, name]);
    return { ...rowToDomain(row), siteId: newSiteId };
  }

  siteForHost(host: string): string | null {
    const row = this.db.get<DomainRow>(`SELECT * FROM ${this.domains} WHERE name = ?`, [host]);
    if (!row || row.status !== 'active') return null;
    return row.site_id;
  }
}
