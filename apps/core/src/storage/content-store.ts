import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { computeCid, isValidCid, verifyContent } from '@sovra/cid';
import { SovraError } from '@sovra/contracts';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { blob } from '../db/schema.js';

export class ContentStore {
  constructor(
    private readonly db: Db,
    private readonly rootDir: string,
  ) {}

  private pathFor(cid: string): string {
    const hex = cid.slice(3);
    return join(this.rootDir, hex.slice(0, 2), hex.slice(2, 4), cid);
  }

  async put(content: Uint8Array): Promise<string> {
    const cid = computeCid(content);
    const filePath = this.pathFor(cid);

    const existing = this.db.select().from(blob).where(eq(blob.cid, cid)).get();
    if (existing) {
      this.db
        .update(blob)
        .set({ refcount: sql`${blob.refcount} + 1` })
        .where(eq(blob.cid, cid))
        .run();
      if (!existsSync(filePath)) {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content);
      }
      return cid;
    }

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    this.db
      .insert(blob)
      .values({ cid, byteSize: content.byteLength, refcount: 1, createdAt: Date.now() })
      .run();
    return cid;
  }

  async get(cid: string): Promise<Uint8Array> {
    if (!isValidCid(cid)) {
      throw new SovraError('not_found', `invalid CID ${cid}`);
    }
    const filePath = this.pathFor(cid);
    if (!existsSync(filePath)) {
      throw new SovraError('not_found', `content not found for CID ${cid}`, { detail: { cid } });
    }
    const data = new Uint8Array(await readFile(filePath));
    if (!verifyContent(cid, data)) {
      throw new SovraError('content_corrupted', `stored bytes do not match CID ${cid}`, {
        detail: { cid },
      });
    }
    return data;
  }

  has(cid: string): boolean {
    return this.db.select().from(blob).where(eq(blob.cid, cid)).get() !== undefined;
  }

  refcount(cid: string): number {
    const row = this.db.select().from(blob).where(eq(blob.cid, cid)).get();
    return row?.refcount ?? 0;
  }

  async release(cid: string): Promise<void> {
    const row = this.db.select().from(blob).where(eq(blob.cid, cid)).get();
    if (!row) return;
    const next = row.refcount - 1;
    if (next > 0) {
      this.db.update(blob).set({ refcount: next }).where(eq(blob.cid, cid)).run();
      return;
    }
    this.db.delete(blob).where(eq(blob.cid, cid)).run();
    const filePath = this.pathFor(cid);
    if (existsSync(filePath)) {
      await rm(filePath, { force: true });
    }
  }
}
