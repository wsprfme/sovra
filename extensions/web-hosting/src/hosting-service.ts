import { randomBytes } from 'node:crypto';
import { computeCid } from '@sovra/cid';
import { SovraError } from '@sovra/contracts';
import type { ScopedDb, StorageCapability } from '@sovra/extension-api';
import { parseManifest, printManifest, type SiteManifest } from '@sovra/site-manifest';
import { normalizePath, resolveIndex, type SiteFile } from './manifest.js';

export interface ServedFile {
  content: Uint8Array;
  mime: string;
}

const MIME_BY_EXT: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
  wasm: 'application/wasm',
};

function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

interface SiteRow {
  id: string;
  name: string;
  active_manifest_id: string | null;
  created_at: number;
}

interface ManifestRow {
  id: string;
  site_id: string;
  version: number;
  manifest_text: string;
  created_at: number;
}

export class HostingService {
  private readonly sites: string;
  private readonly manifests: string;

  constructor(
    private readonly db: ScopedDb,
    private readonly store: StorageCapability,
    private readonly now: () => number = Date.now,
  ) {
    this.sites = db.table('site');
    this.manifests = db.table('site_manifest');
  }

  createSite(name: string): { id: string; name: string } {
    const id = randomBytes(12).toString('hex');
    this.db.run(
      `INSERT INTO ${this.sites} (id, name, active_manifest_id, created_at) VALUES (?, ?, NULL, ?)`,
      [id, name, this.now()],
    );
    return { id, name };
  }

  listSites(): Array<{ id: string; name: string; createdAt: number }> {
    return this.db
      .all<SiteRow>(`SELECT * FROM ${this.sites} ORDER BY created_at DESC`)
      .map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  }

  async deploy(siteId: string, files: SiteFile[], domain: string | null = null): Promise<SiteManifest> {
    const siteRow = this.db.get<SiteRow>(`SELECT * FROM ${this.sites} WHERE id = ?`, [siteId]);
    if (!siteRow) throw new SovraError('not_found', `site ${siteId} not found`);

    const entries: { path: string; cid: string }[] = [];
    for (const f of files) {
      const cid = await this.store.put(f.content);
      entries.push({ path: normalizePath(f.path), cid });
    }

    const prev = this.db.get<{ version: number }>(
      `SELECT version FROM ${this.manifests} WHERE site_id = ? ORDER BY version DESC LIMIT 1`,
      [siteId],
    );
    const version = (prev?.version ?? 0) + 1;

    const manifest: SiteManifest = { version, domain, timestamp: this.now(), entries };
    const manifestText = printManifest(manifest);
    const manifestId = randomBytes(12).toString('hex');
    this.db.run(
      `INSERT INTO ${this.manifests} (id, site_id, version, manifest_text, created_at) VALUES (?, ?, ?, ?, ?)`,
      [manifestId, siteId, version, manifestText, this.now()],
    );
    this.db.run(`UPDATE ${this.sites} SET active_manifest_id = ? WHERE id = ?`, [manifestId, siteId]);
    return manifest;
  }

  listVersions(siteId: string): Array<{ id: string; version: number; createdAt: number }> {
    return this.db
      .all<ManifestRow>(`SELECT * FROM ${this.manifests} WHERE site_id = ? ORDER BY version DESC`, [siteId])
      .map((r) => ({ id: r.id, version: r.version, createdAt: r.created_at }));
  }

  rollback(siteId: string, manifestId: string): void {
    const row = this.db.get<ManifestRow>(
      `SELECT * FROM ${this.manifests} WHERE site_id = ? AND id = ?`,
      [siteId, manifestId],
    );
    if (!row) throw new SovraError('not_found', `manifest ${manifestId} not found for site`);
    this.db.run(`UPDATE ${this.sites} SET active_manifest_id = ? WHERE id = ?`, [manifestId, siteId]);
  }

  activeManifest(siteId: string): SiteManifest | null {
    const siteRow = this.db.get<SiteRow>(`SELECT * FROM ${this.sites} WHERE id = ?`, [siteId]);
    if (!siteRow?.active_manifest_id) return null;
    const row = this.db.get<ManifestRow>(`SELECT * FROM ${this.manifests} WHERE id = ?`, [
      siteRow.active_manifest_id,
    ]);
    return row ? parseManifest(row.manifest_text) : null;
  }

  async serve(siteId: string, requestPath: string): Promise<ServedFile> {
    const manifest = this.activeManifest(siteId);
    if (!manifest) throw new SovraError('not_found', 'no active manifest');

    const wanted = resolveIndex(requestPath);
    let entry = manifest.entries.find((e) => e.path === wanted);
    if (!entry && !requestPath.includes('.')) {
      entry = manifest.entries.find((e) => e.path === '/index.html');
    }
    if (!entry) {
      throw new SovraError('not_found', `path ${wanted} not in manifest`, { detail: { path: wanted } });
    }

    const content = await this.store.get(entry.cid);
    if (computeCid(content) !== entry.cid) {
      throw new SovraError('content_corrupted', `served bytes mismatch for ${entry.path}`);
    }
    return { content, mime: mimeFor(entry.path) };
  }
}
