import { SovraError } from '@sovrasdk/contracts';

export interface CloudflareZone {
  id: string;
  name: string;
}

export interface CloudflareApi {
  verifyToken(token: string): Promise<CloudflareZone[]>;
  upsertRecord(
    token: string,
    zoneId: string,
    record: { type: 'A' | 'CNAME'; name: string; content: string; proxied: boolean },
  ): Promise<void>;
  zoneProxyStatus(token: string, zoneId: string, name: string): Promise<boolean>;
}

export interface TokenStore {
  save(encryptedToken: string, zones: CloudflareZone[]): void;
  load(): { encryptedToken: string; zones: CloudflareZone[] } | null;
  clear(): void;
}

export interface Encryptor {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export type SslMode = 'off' | 'flexible' | 'full' | 'strict';

export interface ConnectResult {
  zones: CloudflareZone[];
}

export class CloudflareIntegration {
  constructor(
    private readonly api: CloudflareApi,
    private readonly store: TokenStore,
    private readonly enc: Encryptor,
  ) {}

  async connect(token: string): Promise<ConnectResult> {
    let zones: CloudflareZone[];
    try {
      zones = await this.api.verifyToken(token);
    } catch {
      throw new SovraError('cloudflare_unauthorized', 'cloudflare token is not authorized');
    }
    if (zones.length === 0) {
      throw new SovraError('cloudflare_unauthorized', 'token has no accessible zones');
    }
    this.store.save(this.enc.encrypt(token), zones);
    return { zones };
  }

  isConnected(): boolean {
    return this.store.load() !== null;
  }

  private token(): string {
    const saved = this.store.load();
    if (!saved) throw new SovraError('cloudflare_unauthorized', 'cloudflare not connected');
    return this.enc.decrypt(saved.encryptedToken);
  }

  private zoneFor(domainName: string): CloudflareZone {
    const saved = this.store.load();
    if (!saved) throw new SovraError('cloudflare_unauthorized', 'cloudflare not connected');
    const zone = saved.zones.find(
      (z) => domainName === z.name || domainName.endsWith('.' + z.name),
    );
    if (!zone) throw new SovraError('not_found', `no cloudflare zone manages ${domainName}`);
    return zone;
  }

  async ensureDnsRecord(domainName: string, serverIp: string, proxied: boolean): Promise<void> {
    const token = this.token();
    const zone = this.zoneFor(domainName);
    try {
      await this.api.upsertRecord(token, zone.id, {
        type: 'A',
        name: domainName,
        content: serverIp,
        proxied,
      });
    } catch {
      throw new SovraError('cloudflare_unauthorized', 'failed to upsert DNS record');
    }
  }

  async recommendSslMode(domainName: string): Promise<{ proxied: boolean; recommended: SslMode; warning?: string }> {
    const token = this.token();
    const zone = this.zoneFor(domainName);
    const proxied = await this.api.zoneProxyStatus(token, zone.id, domainName);
    if (!proxied) {
      return { proxied: false, recommended: 'strict' };
    }
    return {
      proxied: true,
      recommended: 'strict',
      warning: 'Use Full (strict) SSL mode. Flexible mode is insecure and can cause redirect loops.',
    };
  }

  disconnect(): void {
    this.store.clear();
  }
}
