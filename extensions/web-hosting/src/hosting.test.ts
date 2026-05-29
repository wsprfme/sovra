import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, type DbHandle, ContentStore } from '@sovra/core';
import { SovraError } from '@sovra/contracts';
import { HostingService } from './hosting-service.js';

let handle: DbHandle;
let dir: string;
let store: ContentStore;
let hosting: HostingService;

const file = (path: string, body: string) => ({ path, content: new TextEncoder().encode(body) });

beforeEach(async () => {
  handle = openDatabase(':memory:');
  dir = await mkdtemp(join(tmpdir(), 'sovra-wh-'));
  store = new ContentStore(handle.db, dir);
  hosting = new HostingService(handle.db, store);
});

afterEach(async () => {
  handle.close();
  await rm(dir, { recursive: true, force: true });
});

describe('static site hosting', () => {
  it('deploys a directory and serves files', async () => {
    const { id } = hosting.createSite('blog');
    await hosting.deploy(id, [file('/index.html', '<h1>hi</h1>'), file('/style.css', 'body{}')]);
    const index = await hosting.serve(id, '/');
    expect(new TextDecoder().decode(index.content)).toBe('<h1>hi</h1>');
    expect(index.mime).toContain('text/html');
    const css = await hosting.serve(id, '/style.css');
    expect(css.mime).toContain('text/css');
  });

  it('returns 404 (not_found) for missing paths', async () => {
    const { id } = hosting.createSite('blog');
    await hosting.deploy(id, [file('/index.html', 'x')]);
    await expect(hosting.serve(id, '/missing.js')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('versions deploys and rolls back without losing history', async () => {
    const { id } = hosting.createSite('blog');
    await hosting.deploy(id, [file('/index.html', 'v1')]);
    await hosting.deploy(id, [file('/index.html', 'v2')]);
    const versions = hosting.listVersions(id);
    expect(versions).toHaveLength(2);

    const current = await hosting.serve(id, '/');
    expect(new TextDecoder().decode(current.content)).toBe('v2');

    const v1 = versions.find((v) => v.version === 1)!;
    hosting.rollback(id, v1.id);
    const afterRollback = await hosting.serve(id, '/');
    expect(new TextDecoder().decode(afterRollback.content)).toBe('v1');
    expect(hosting.listVersions(id)).toHaveLength(2);
  });

  it('detects content corruption when bytes are tampered', async () => {
    const { id } = hosting.createSite('blog');
    const manifest = await hosting.deploy(id, [file('/index.html', 'trusted')]);
    const cid = manifest.entries[0]!.cid;
    const hex = cid.slice(3);
    await writeFile(join(dir, hex.slice(0, 2), hex.slice(2, 4), cid), new TextEncoder().encode('evil'));
    await expect(hosting.serve(id, '/')).rejects.toBeInstanceOf(SovraError);
  });
});
