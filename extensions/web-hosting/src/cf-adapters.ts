import { SovraError } from '@sovra/contracts';
import type { NetCapability, ScopedDb } from '@sovra/extension-api';
import type { CloudflareApi, CloudflareZone, TokenStore } from './cloudflare.js';

const CF_API = 'https://api.cloudflare.com/client/v4';
const RECORD_ID = 'sovra';

export function createCfTokenStore(db: ScopedDb): TokenStore {
  const table = db.table('cf_integration');
  return {
    save(encryptedToken, zones) {
      db.run(`DELETE FROM ${table} WHERE id = ?`, [RECORD_ID]);
      db.run(`INSERT INTO ${table} (id, token_enc, zones) VALUES (?, ?, ?)`, [
        RECORD_ID,
        encryptedToken,
        JSON.stringify(zones),
      ]);
    },
    load() {
      const row = db.get<{ token_enc: string; zones: string }>(
        `SELECT token_enc, zones FROM ${table} WHERE id = ?`,
        [RECORD_ID],
      );
      if (!row) return null;
      return { encryptedToken: row.token_enc, zones: JSON.parse(row.zones) as CloudflareZone[] };
    },
    clear() {
      db.run(`DELETE FROM ${table} WHERE id = ?`, [RECORD_ID]);
    },
  };
}

export function createCfApi(net: NetCapability): CloudflareApi {
  const auth = (token: string) => ({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  });
  return {
    async verifyToken(token) {
      const res = await net.fetch(`${CF_API}/zones`, { headers: auth(token) });
      if (res.status !== 200) {
        throw new SovraError('cloudflare_unauthorized', 'token verification failed');
      }
      const parsed = JSON.parse(res.body) as { result?: Array<{ id: string; name: string }> };
      return (parsed.result ?? []).map((z) => ({ id: z.id, name: z.name }));
    },
    async upsertRecord(token, zoneId, record) {
      const body = JSON.stringify({
        type: record.type,
        name: record.name,
        content: record.content,
        proxied: record.proxied,
      });
      const res = await net.fetch(`${CF_API}/zones/${zoneId}/dns_records`, {
        method: 'POST',
        headers: auth(token),
        body,
      });
      if (res.status >= 400) {
        throw new SovraError('cloudflare_unauthorized', 'failed to upsert DNS record');
      }
    },
    async zoneProxyStatus(token, zoneId, name) {
      const res = await net.fetch(`${CF_API}/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}`, {
        headers: auth(token),
      });
      if (res.status !== 200) return false;
      const parsed = JSON.parse(res.body) as { result?: Array<{ proxied: boolean }> };
      return parsed.result?.[0]?.proxied ?? false;
    },
  };
}
