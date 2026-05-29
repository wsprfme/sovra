import { eq } from 'drizzle-orm';
import { SovraError, type Domain, type TlsStrategy } from '@sovra/contracts';
import { type Db, schema, ProxyController } from '@sovra/core';

const { domain, site } = schema;

type TlsStrategyValue = TlsStrategy;

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

export class DomainService {
  constructor(
    private readonly db: Db,
    private readonly proxy: ProxyController,
    private readonly serverIp: string,
    private readonly coreUpstream: string,
  ) {}

  private chooseStrategy(input: RegisterDomainInput): TlsStrategyValue {
    if (input.behindCloudflare && input.cloudflareActive) {
      return 'dns-01';
    }
    return 'http-01';
  }

  register(input: RegisterDomainInput): { domain: Domain; dns: DnsInstructions } {
    const siteRow = this.db.select().from(site).where(eq(site.id, input.siteId)).get();
    if (!siteRow) throw new SovraError('not_found', `site ${input.siteId} not found`);

    const existing = this.db.select().from(domain).where(eq(domain.name, input.name)).get();
    if (existing && existing.siteId !== input.siteId) {
      throw new SovraError('domain_conflict', `${input.name} already mapped to another site`, {
        detail: { domain: input.name },
      });
    }

    const tlsStrategy = this.chooseStrategy(input);
    const record: typeof domain.$inferInsert = {
      name: input.name,
      siteId: input.siteId,
      status: 'pending',
      tlsStrategy,
      verifiedAt: null,
    };
    if (existing) {
      this.db
        .update(domain)
        .set({ siteId: input.siteId, tlsStrategy })
        .where(eq(domain.name, input.name))
        .run();
    } else {
      this.db.insert(domain).values(record).run();
    }

    const dns: DnsInstructions = input.behindCloudflare
      ? { type: 'CNAME', name: input.name, value: `${this.serverIp}` }
      : { type: 'A', name: input.name, value: this.serverIp };

    return {
      domain: { name: input.name, siteId: input.siteId, status: 'pending', tlsStrategy, verifiedAt: null },
      dns,
    };
  }

  async verify(name: string, dnsResolves: boolean): Promise<Domain> {
    const row = this.db.select().from(domain).where(eq(domain.name, name)).get();
    if (!row) throw new SovraError('not_found', `domain ${name} not registered`);
    if (!dnsResolves) {
      return { name: row.name, siteId: row.siteId, status: 'pending', tlsStrategy: row.tlsStrategy, verifiedAt: null };
    }
    const verifiedAt = Date.now();
    this.db.update(domain).set({ status: 'active', verifiedAt }).where(eq(domain.name, name)).run();
    await this.proxy.bindDomain(name, this.coreUpstream);
    return { name: row.name, siteId: row.siteId, status: 'active', tlsStrategy: row.tlsStrategy, verifiedAt };
  }

  retarget(name: string, newSiteId: string): Domain {
    const row = this.db.select().from(domain).where(eq(domain.name, name)).get();
    if (!row) throw new SovraError('not_found', `domain ${name} not registered`);
    this.db.update(domain).set({ siteId: newSiteId }).where(eq(domain.name, name)).run();
    return {
      name: row.name,
      siteId: newSiteId,
      status: row.status,
      tlsStrategy: row.tlsStrategy,
      verifiedAt: row.verifiedAt,
    };
  }

  siteForHost(host: string): string | null {
    const row = this.db.select().from(domain).where(eq(domain.name, host)).get();
    if (!row || row.status !== 'active') return null;
    return row.siteId;
  }
}
