import { randomBytes } from 'node:crypto';
import { and, eq, isNull, like } from 'drizzle-orm';
import {
  SovraError,
  type Album,
  type ContentVisibility,
  type EncMeta,
  type FileObject,
} from '@sovra/contracts';
import type { Db } from '../db/index.js';
import { album, albumItem, fileObject, folder } from '../db/schema.js';
import type { ContentStore } from './content-store.js';
import { generateThumbnail, isImageMime } from './thumbnail.js';

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface UploadInput {
  parentPath: string;
  name: string;
  content: Uint8Array;
  mime: string;
  visibility?: ContentVisibility;
  encMeta?: EncMeta | null;
  thumbCid?: string | null;
}

function rowToFile(row: typeof fileObject.$inferSelect): FileObject {
  return {
    id: row.id,
    parentPath: row.parentPath,
    name: row.name,
    cid: row.cid,
    size: row.size,
    mime: row.mime,
    visibility: row.visibility,
    encMeta: row.encMeta ? (JSON.parse(row.encMeta) as EncMeta) : null,
    thumbCid: row.thumbCid,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    trashedAt: row.trashedAt,
  };
}

export class StorageService {
  constructor(
    private readonly db: Db,
    private readonly store: ContentStore,
    private readonly quotaBytes: number = Number.MAX_SAFE_INTEGER,
    private readonly now: () => number = Date.now,
  ) {}

  usedBytes(): number {
    return this.db
      .select()
      .from(fileObject)
      .all()
      .reduce((sum, r) => sum + r.size, 0);
  }

  async upload(input: UploadInput): Promise<FileObject> {
    if (this.usedBytes() + input.content.byteLength > this.quotaBytes) {
      throw new SovraError('quota_exceeded', 'storage quota exceeded', {
        detail: { quota: this.quotaBytes },
      });
    }
    let cid: string;
    try {
      cid = await this.store.put(input.content);
    } catch (cause) {
      throw new SovraError('upload_incomplete', 'failed to persist content', { cause });
    }
    const t = this.now();
    const id = randomBytes(16).toString('hex');

    let thumbCid = input.thumbCid ?? null;
    const visibility = input.visibility ?? ('private' as ContentVisibility);
    if (thumbCid === null && visibility === 'public' && isImageMime(input.mime)) {
      thumbCid = await this.generateAndStoreThumbnail(input.content);
    }

    const row = {
      id,
      parentPath: input.parentPath,
      name: input.name,
      cid,
      size: input.content.byteLength,
      mime: input.mime,
      visibility,
      encMeta: input.encMeta ? JSON.stringify(input.encMeta) : null,
      thumbCid,
      createdAt: t,
      updatedAt: t,
      trashedAt: null as number | null,
    };
    this.db.insert(fileObject).values(row).run();
    return rowToFile(row as typeof fileObject.$inferSelect);
  }

  private async generateAndStoreThumbnail(content: Uint8Array): Promise<string | null> {
    try {
      const thumb = await generateThumbnail(content);
      return await this.store.put(thumb);
    } catch {
      return null;
    }
  }

  createFolder(path: string, name: string): void {
    if (!path.startsWith('/')) {
      throw new SovraError('validation_error', 'folder path must be absolute');
    }
    const id = randomBytes(16).toString('hex');
    this.db.insert(folder).values({ id, path, name, createdAt: this.now() }).run();
  }

  move(fileId: string, newParentPath: string): FileObject {
    const row = this.db.select().from(fileObject).where(eq(fileObject.id, fileId)).get();
    if (!row) throw new SovraError('not_found', `file ${fileId} not found`);
    const cidBefore = row.cid;
    this.db
      .update(fileObject)
      .set({ parentPath: newParentPath, updatedAt: this.now() })
      .where(eq(fileObject.id, fileId))
      .run();
    const updated = this.db.select().from(fileObject).where(eq(fileObject.id, fileId)).get()!;
    if (updated.cid !== cidBefore) {
      throw new SovraError('internal_error', 'CID changed during move');
    }
    return rowToFile(updated);
  }

  list(parentPath: string): FileObject[] {
    return this.db
      .select()
      .from(fileObject)
      .where(and(eq(fileObject.parentPath, parentPath), isNull(fileObject.trashedAt)))
      .all()
      .map(rowToFile);
  }

  trash(fileId: string): void {
    const row = this.db.select().from(fileObject).where(eq(fileObject.id, fileId)).get();
    if (!row) throw new SovraError('not_found', `file ${fileId} not found`);
    this.db
      .update(fileObject)
      .set({ trashedAt: this.now(), updatedAt: this.now() })
      .where(eq(fileObject.id, fileId))
      .run();
  }

  restore(fileId: string): FileObject {
    const row = this.db.select().from(fileObject).where(eq(fileObject.id, fileId)).get();
    if (!row) throw new SovraError('not_found', `file ${fileId} not found`);
    if (row.trashedAt === null) return rowToFile(row);
    if (this.now() - row.trashedAt > TRASH_RETENTION_MS) {
      throw new SovraError('not_found', 'file retention period expired');
    }
    const parentExists =
      row.parentPath === '/' ||
      this.db.select().from(folder).where(eq(folder.path, row.parentPath)).get() !== undefined;
    const restorePath = parentExists ? row.parentPath : '/';
    this.db
      .update(fileObject)
      .set({ trashedAt: null, parentPath: restorePath, updatedAt: this.now() })
      .where(eq(fileObject.id, fileId))
      .run();
    return rowToFile(this.db.select().from(fileObject).where(eq(fileObject.id, fileId)).get()!);
  }

  async purgeExpiredTrash(): Promise<number> {
    const cutoff = this.now() - TRASH_RETENTION_MS;
    const expired = this.db
      .select()
      .from(fileObject)
      .all()
      .filter((r) => r.trashedAt !== null && r.trashedAt <= cutoff);
    for (const row of expired) {
      this.db.delete(fileObject).where(eq(fileObject.id, row.id)).run();
      await this.store.release(row.cid);
      if (row.thumbCid) await this.store.release(row.thumbCid);
    }
    return expired.length;
  }

  createAlbum(name: string): Album {
    const id = randomBytes(16).toString('hex');
    const createdAt = this.now();
    this.db.insert(album).values({ id, name, createdAt }).run();
    return { id, name, createdAt };
  }

  addToAlbum(albumId: string, fileId: string): void {
    const exists = this.db.select().from(album).where(eq(album.id, albumId)).get();
    if (!exists) throw new SovraError('not_found', `album ${albumId} not found`);
    this.db
      .insert(albumItem)
      .values({ albumId, fileObjectId: fileId })
      .onConflictDoNothing()
      .run();
  }

  albumItems(albumId: string): FileObject[] {
    const ids = this.db
      .select()
      .from(albumItem)
      .where(eq(albumItem.albumId, albumId))
      .all()
      .map((r) => r.fileObjectId);
    return ids
      .map((id) => this.db.select().from(fileObject).where(eq(fileObject.id, id)).get())
      .filter((r): r is typeof fileObject.$inferSelect => r !== undefined)
      .map(rowToFile);
  }

  deleteFilePermanently(fileId: string): void {
    this.db.delete(albumItem).where(eq(albumItem.fileObjectId, fileId)).run();
    this.db.delete(fileObject).where(eq(fileObject.id, fileId)).run();
  }

  searchByName(fragment: string): FileObject[] {
    return this.db
      .select()
      .from(fileObject)
      .where(like(fileObject.name, `%${fragment}%`))
      .all()
      .map(rowToFile);
  }
}
