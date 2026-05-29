import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { SovraError } from '@sovrasdk/contracts';
import { SCHEMA_VERSION } from '../db/index.js';

export interface BackupManifest {
  schemaVersion: number;
  createdAt: number;
  extensions: string[];
}

interface TarLikeEntry {
  path: string;
  data: Uint8Array;
}

function encodeArchive(entries: TarLikeEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const header = new TextEncoder().encode('SOVRABK1\n');
  parts.push(header);
  for (const entry of entries) {
    const pathBytes = new TextEncoder().encode(entry.path);
    const meta = new DataView(new ArrayBuffer(8));
    meta.setUint32(0, pathBytes.length, false);
    meta.setUint32(4, entry.data.length, false);
    parts.push(new Uint8Array(meta.buffer));
    parts.push(pathBytes);
    parts.push(entry.data);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function decodeArchive(buffer: Uint8Array): TarLikeEntry[] {
  const headerLen = 'SOVRABK1\n'.length;
  const magic = new TextDecoder().decode(buffer.slice(0, headerLen));
  if (magic !== 'SOVRABK1\n') {
    throw new SovraError('validation_error', 'invalid backup archive');
  }
  const entries: TarLikeEntry[] = [];
  let offset = headerLen;
  while (offset < buffer.length) {
    const meta = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
    const pathLen = meta.getUint32(0, false);
    const dataLen = meta.getUint32(4, false);
    offset += 8;
    const path = new TextDecoder().decode(buffer.slice(offset, offset + pathLen));
    offset += pathLen;
    const data = buffer.slice(offset, offset + dataLen);
    offset += dataLen;
    entries.push({ path, data });
  }
  return entries;
}

async function collectDir(root: string, base = root): Promise<TarLikeEntry[]> {
  const out: TarLikeEntry[] = [];
  let items: string[] = [];
  try {
    items = await readdir(root);
  } catch {
    return out;
  }
  for (const item of items) {
    const full = join(root, item);
    const s = await stat(full);
    if (s.isDirectory()) {
      out.push(...(await collectDir(full, base)));
    } else {
      out.push({ path: relative(base, full), data: new Uint8Array(await readFile(full)) });
    }
  }
  return out;
}

export interface BackupPaths {
  dbPath: string;
  contentDir: string;
}

export class BackupService {
  constructor(
    private readonly paths: BackupPaths,
    private readonly listExtensions: () => string[],
    private readonly now: () => number = Date.now,
  ) {}

  async create(outputPath: string): Promise<BackupManifest> {
    const manifest: BackupManifest = {
      schemaVersion: SCHEMA_VERSION,
      createdAt: this.now(),
      extensions: this.listExtensions(),
    };
    const entries: TarLikeEntry[] = [
      { path: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
    ];
    try {
      entries.push({ path: 'db.sqlite', data: new Uint8Array(await readFile(this.paths.dbPath)) });
    } catch {
      // in-memory or missing db: skip binary, manifest still valid
    }
    const contentEntries = await collectDir(this.paths.contentDir);
    for (const e of contentEntries) {
      entries.push({ path: join('content', e.path), data: e.data });
    }

    const archive = encodeArchive(entries);
    const tmp = outputPath + '.tmp';
    await mkdir(join(outputPath, '..'), { recursive: true }).catch(() => undefined);
    await pipeline(
      (async function* () {
        yield Buffer.from(archive);
      })(),
      createGzip(),
      createWriteStream(tmp),
    );
    const { rename } = await import('node:fs/promises');
    await rename(tmp, outputPath);
    return manifest;
  }

  async readManifest(archivePath: string): Promise<BackupManifest> {
    const entries = await this.decode(archivePath);
    const m = entries.find((e) => e.path === 'manifest.json');
    if (!m) throw new SovraError('validation_error', 'backup missing manifest');
    return JSON.parse(new TextDecoder().decode(m.data)) as BackupManifest;
  }

  async restore(archivePath: string, target: BackupPaths): Promise<BackupManifest> {
    const entries = await this.decode(archivePath);
    const manifestEntry = entries.find((e) => e.path === 'manifest.json');
    if (!manifestEntry) throw new SovraError('validation_error', 'backup missing manifest');
    const manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data)) as BackupManifest;
    if (manifest.schemaVersion > SCHEMA_VERSION) {
      throw new SovraError('backup_version_unsupported', 'backup is from a newer schema version', {
        detail: { backup: manifest.schemaVersion, supported: SCHEMA_VERSION },
      });
    }

    const { writeFile } = await import('node:fs/promises');
    await rm(target.contentDir, { recursive: true, force: true });
    await mkdir(target.contentDir, { recursive: true });
    for (const entry of entries) {
      if (entry.path === 'manifest.json') continue;
      if (entry.path === 'db.sqlite') {
        await mkdir(join(target.dbPath, '..'), { recursive: true }).catch(() => undefined);
        await writeFile(target.dbPath, entry.data);
        continue;
      }
      if (entry.path.startsWith('content/')) {
        const rel = entry.path.slice('content/'.length);
        const dest = join(target.contentDir, rel);
        await mkdir(join(dest, '..'), { recursive: true });
        await writeFile(dest, entry.data);
      }
    }
    return manifest;
  }

  private async decode(archivePath: string): Promise<TarLikeEntry[]> {
    const chunks: Buffer[] = [];
    await pipeline(createReadStream(archivePath), createGunzip(), async function (source) {
      for await (const chunk of source) {
        chunks.push(chunk as Buffer);
      }
    });
    return decodeArchive(new Uint8Array(Buffer.concat(chunks)));
  }
}
