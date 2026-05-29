import { describe, expect, it } from 'vitest';
import { SovraError } from '@sovra/contracts';
import {
  CloudflareIntegration,
  type CloudflareApi,
  type CloudflareZone,
  type TokenStore,
  type Encryptor,
} from './cloudflare.js';

function memStore(): TokenStore {
  let saved: { encryptedToken: string; zones: CloudflareZone[] } | null = null;
  return {
    save: (encryptedToken, zones) => {
      saved = { encryptedToken, zones };
    },
    load: () => saved,
    clear: () => {
      saved = null;
    },
  };
}

const enc: Encryptor = {
  encrypt: (p) => `enc(${p})`,
  decrypt: (c) => c.replace(/^enc\(/, '').replace(/\)$/, ''),
};

function mockApi(overrides: Partial<CloudflareApi> = {}): { api: CloudflareApi; records: unknown[] } {
  const records: unknown[] = [];
  const api: CloudflareApi = {
    verifyToken: async (token) => {
      if (token === 'bad') throw new Error('unauthorized');
      return [{ id: 'zone1', name: 'example.com' }];
    },
    upsertRecord: async (_t, _z, record) => {
      records.push(record);
    },
    zoneProxyStatus: async () => true,
    ...overrides,
  };
  return { api, records };
}

describe('CloudflareIntegration', () => {
  it('connects with a valid token and stores it encrypted', async () => {
    const { api } = mockApi();
    const store = memStore();
    const cf = new CloudflareIntegration(api, store, enc);
    const res = await cf.connect('good-token');
    expect(res.zones[0]!.name).toBe('example.com');
    expect(store.load()!.encryptedToken).toBe('enc(good-token)');
    expect(store.load()!.encryptedToken).not.toContain('good-token'.slice(0, 4) + 'X');
  });

  it('rejects an unauthorized token', async () => {
    const { api } = mockApi();
    const cf = new CloudflareIntegration(api, memStore(), enc);
    try {
      await cf.connect('bad');
      expect.unreachable();
    } catch (e) {
      expect((e as SovraError).code).toBe('cloudflare_unauthorized');
    }
  });

  it('creates a DNS record for a domain in a managed zone', async () => {
    const { api, records } = mockApi();
    const cf = new CloudflareIntegration(api, memStore(), enc);
    await cf.connect('good-token');
    await cf.ensureDnsRecord('www.example.com', '203.0.113.5', true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ name: 'www.example.com', content: '203.0.113.5', proxied: true });
  });

  it('warns about Flexible and recommends strict when proxied', async () => {
    const { api } = mockApi();
    const cf = new CloudflareIntegration(api, memStore(), enc);
    await cf.connect('good-token');
    const advice = await cf.recommendSslMode('example.com');
    expect(advice.proxied).toBe(true);
    expect(advice.recommended).toBe('strict');
    expect(advice.warning).toBeTruthy();
  });

  it('disconnects and clears the token', async () => {
    const { api } = mockApi();
    const store = memStore();
    const cf = new CloudflareIntegration(api, store, enc);
    await cf.connect('good-token');
    cf.disconnect();
    expect(cf.isConnected()).toBe(false);
  });
});
