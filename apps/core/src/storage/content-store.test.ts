import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { computeCid } from '@sovra/cid';
import { SovraError } from '@sovra/contracts';
import { openDatabase, type DbHandle } from '../db/index.js';
import { ContentStore } from './content-store.js';

let handle: DbHandle;
let dir: string;
let store: ContentStore;

beforeEach(async () => {
  handle = openDatabase(':memory:');
  dir = await mkdtemp(join(tmpdir(), 'sovra-cs-'));
  store = new ContentStore(handle.db, dir);
});

afterEach(async () => {
  handle.close();
  await rm(dir, { recursive: true, force: true });
});

describe('ContentStore', () => {
  it('stores and retrieves content by CID', async () => {
    const data = new TextEncoder().encode('hello world');
    const cid = await store.put(data);
    const out = await store.get(cid);
    expect(new TextDecoder().decode(out)).toBe('hello world');
  });

  it('property: identical bytes deduplicate to one physical copy', () => {
    return fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 256 }), async (bytes) => {
        const a = await store.put(bytes);
        const b = await store.put(Uint8Array.from(bytes));
        expect(a).toBe(b);
        expect(store.refcount(a)).toBe(2);
        await store.release(a);
        await store.release(a);
      }),
      { numRuns: 30 },
    );
  });

  it('garbage-collects when refcount reaches zero', async () => {
    const cid = await store.put(new TextEncoder().encode('temp'));
    expect(store.has(cid)).toBe(true);
    await store.release(cid);
    expect(store.has(cid)).toBe(false);
    await expect(store.get(cid)).rejects.toBeInstanceOf(SovraError);
  });

  it('detects corruption (content_corrupted)', async () => {
    const data = new TextEncoder().encode('important');
    const cid = await store.put(data);
    const hex = cid.slice(3);
    const filePath = join(dir, hex.slice(0, 2), hex.slice(2, 4), cid);
    await writeFile(filePath, new TextEncoder().encode('tampered!'));
    try {
      await store.get(cid);
      expect.unreachable('should throw');
    } catch (e) {
      expect(SovraError.is(e)).toBe(true);
      expect((e as SovraError).code).toBe('content_corrupted');
    }
  });

  it('returns not_found for missing content', async () => {
    const cid = computeCid(new TextEncoder().encode('never stored'));
    await expect(store.get(cid)).rejects.toMatchObject({ code: 'not_found' });
  });
});
