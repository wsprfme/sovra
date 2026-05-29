import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { SovraError } from '@sovra/contracts';
import { openDatabase, type DbHandle } from '../db/index.js';
import { ContentStore } from './content-store.js';
import { StorageService } from './storage-service.js';

let handle: DbHandle;
let dir: string;
let store: ContentStore;

async function svc(quota = Number.MAX_SAFE_INTEGER, now: () => number = Date.now) {
  return new StorageService(handle.db, store, quota, now);
}

beforeEach(async () => {
  handle = openDatabase(':memory:');
  dir = await mkdtemp(join(tmpdir(), 'sovra-st-'));
  store = new ContentStore(handle.db, dir);
});

afterEach(async () => {
  handle.close();
  await rm(dir, { recursive: true, force: true });
});

const bytes = (s: string) => new TextEncoder().encode(s);

describe('file upload & metadata', () => {
  it('stores file with metadata and private default', async () => {
    const s = await svc();
    const f = await s.upload({ parentPath: '/', name: 'a.txt', content: bytes('hi'), mime: 'text/plain' });
    expect(f.visibility).toBe('private');
    expect(f.size).toBe(2);
    expect(f.cid.startsWith('b3-')).toBe(true);
  });

  it('rejects upload exceeding quota', async () => {
    const s = await svc(3);
    await expect(
      s.upload({ parentPath: '/', name: 'big.txt', content: bytes('hello'), mime: 'text/plain' }),
    ).rejects.toMatchObject({ code: 'quota_exceeded' });
  });
});

describe('folders & move', () => {
  it('moves a file without changing CID', async () => {
    const s = await svc();
    s.createFolder('/docs', 'docs');
    const f = await s.upload({ parentPath: '/', name: 'a.txt', content: bytes('hi'), mime: 'text/plain' });
    const moved = s.move(f.id, '/docs');
    expect(moved.cid).toBe(f.cid);
    expect(moved.parentPath).toBe('/docs');
  });
});

describe('trash & restore', () => {
  it('trashes then restores to original path', async () => {
    const s = await svc();
    s.createFolder('/docs', 'docs');
    const f = await s.upload({ parentPath: '/docs', name: 'a.txt', content: bytes('hi'), mime: 'text/plain' });
    s.trash(f.id);
    expect(s.list('/docs')).toHaveLength(0);
    const restored = s.restore(f.id);
    expect(restored.parentPath).toBe('/docs');
    expect(restored.trashedAt).toBeNull();
  });

  it('restores to root when original path is gone', async () => {
    let now = 1000;
    const s = await svc(Number.MAX_SAFE_INTEGER, () => now);
    s.createFolder('/tmp', 'tmp');
    const f = await s.upload({ parentPath: '/tmp', name: 'a.txt', content: bytes('hi'), mime: 'text/plain' });
    s.trash(f.id);
    handle.db.run('DELETE FROM folder');
    const restored = s.restore(f.id);
    expect(restored.parentPath).toBe('/');
  });

  it('refuses restore after 30 days', async () => {
    let now = 1000;
    const s = await svc(Number.MAX_SAFE_INTEGER, () => now);
    const f = await s.upload({ parentPath: '/', name: 'a.txt', content: bytes('hi'), mime: 'text/plain' });
    s.trash(f.id);
    now += 31 * 24 * 60 * 60 * 1000;
    expect(() => s.restore(f.id)).toThrow(SovraError);
  });
});

describe('albums', () => {
  it('property: adding the same photo repeatedly keeps a single reference', async () => {
    const s = await svc();
    const f = await s.upload({ parentPath: '/', name: 'p.jpg', content: bytes('img'), mime: 'image/jpeg' });
    const al = s.createAlbum('Trip');
    await fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (n) => {
        for (let i = 0; i < n; i++) s.addToAlbum(al.id, f.id);
        expect(s.albumItems(al.id)).toHaveLength(1);
      }),
    );
  });
});

describe('thumbnails', () => {
  it('generates a thumbnail for public images', async () => {
    const sharp = (await import('sharp')).default;
    const png = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    const s = await svc();
    const f = await s.upload({
      parentPath: '/',
      name: 'pic.png',
      content: new Uint8Array(png),
      mime: 'image/png',
      visibility: 'public',
    });
    expect(f.thumbCid).not.toBeNull();
    expect(store.has(f.thumbCid!)).toBe(true);
  });

  it('does not server-thumbnail private uploads', async () => {
    const s = await svc();
    const f = await s.upload({
      parentPath: '/',
      name: 'secret.png',
      content: bytes('not really an image'),
      mime: 'image/png',
      visibility: 'private',
    });
    expect(f.thumbCid).toBeNull();
  });
});
