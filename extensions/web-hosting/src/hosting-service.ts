import { randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { computeCid } from '@sovra/cid';
import { SovraError } from '@sovra/contracts';
import { type Db, schema, ContentStore } from '@sovra/core';
import {
  parseManifest,
  printManifest,
  type SiteManifest,
} from '@sovra/site-manifest';
import { normalizePath, resolveIndex, type SiteFile } from './manifest.js';

const { site, siteManifest } = schema;

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

export class HostingService {
  constructor(
    private readonly db: Db,
    private readonly store: ContentStore,
    private readonly now: () => number = Date.now,
  ) {}

  createSite(name: string): { id: string } {
    const id = randomBytes(12).toString('hex');
    this.db.insert(site).values({ id, name, activeManifestId: null, createdAt: this.now() }).run();
    return { id };
  }

  async deploy(siteId: string, files: SiteFile[], domain: string | null = null): Promise<SiteManifest> {
    const siteRow = this.db.select().from(site).where(eq(site.id, siteId)).get();
    if (!siteRow) throw new SovraError('not_found', `site ${siteId} not found`);

    const entries: { path: string; cid: string }[] = [];
    for (const f of files) {
      const cid = await this.store.put(f.content);
      entries.push({ path: normalizePath(f.path), cid });
    }

    const prevVersion = this.db
      .select()
      .from(siteManifest)
      .where(eq(siteManifest.siteId, siteId))
      .orderBy(desc(siteManifest.version))
      .get();
    const version = (prevVersion?.version ?? 0) + 1;

    const manifest: SiteManifest = {
      version,
      domain,
      timestamp: this.now(),
      entries,
    };
    const manifestText = printManifest(manifest);
    const manifestId = randomBytes(12).toString('hex');
    this.db
      .insert(siteManifest)
      .values({ id: manifestId, siteId, version, manifestText, createdAt: this.now() })
      .run();
    this.db.update(site).set({ activeManifestId: manifestId }).where(eq(site.id, siteId)).run();
    return manifest;
  }

  listVersions(siteId: string): Array<{ id: string; version: number; createdAt: number }> {
    return this.db
      .select()
      .from(siteManifest)
      .where(eq(siteManifest.siteId, siteId))
      .orderBy(desc(siteManifest.version))
      .all()
      .map((r) => ({ id: r.id, version: r.version, createdAt: r.createdAt }));
  }

  rollback(siteId: string, manifestId: string): void {
    const row = this.db
      .select()
      .from(siteManifest)
      .where(and(eq(siteManifest.siteId, siteId), eq(siteManifest.id, manifestId)))
      .get();
    if (!row) throw new SovraError('not_found', `manifest ${manifestId} not found for site`);
    this.db.update(site).set({ activeManifestId: manifestId }).where(eq(site.id, siteId)).run();
  }

  activeManifest(siteId: string): SiteManifest | null {
    const siteRow = this.db.select().from(site).where(eq(site.id, siteId)).get();
    if (!siteRow?.activeManifestId) return null;
    const row = this.db
      .select()
      .from(siteManifest)
      .where(eq(siteManifest.id, siteRow.activeManifestId))
      .get();
    return row ? parseManifest(row.manifestText) : null;
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
