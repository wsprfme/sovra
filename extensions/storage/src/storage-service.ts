import { randomBytes } from 'node:crypto';
import { SovraError } from '@sovra/contracts';
import type { ScopedDb, StorageCapability } from '@sovra/extension-api';
import { generateThumbnail, isImageMime } from './thumbnail.js';
import type { Album, EncMeta, FileObject, Folder, UploadInput, Visibility } from './types.js';

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface FileRow {
  id: string;
  parent_path: string;
  name: string;
  cid: string;
  size: number;
  mime: string;
  visibility: Visibility;
  enc_meta: string | null;
  thumb_cid: string | null;
  created_at: number;
  updated_at: number;
  trashed_at: number | null;
}

function rowToFile(row: FileRow): FileObject {
  return {
    id: row.id,
    parentPath: row.parent_path,
    name: row.name,
    cid: row.cid,
    size: row.size,
    mime: row.mime,
    visibility: row.visibility,
    encMeta: row.enc_meta ? (JSON.parse(row.enc_meta) as EncMeta) : null,
    thumbCid: row.thumb_cid,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trashedAt: row.trashed_at,
  };
}

export class StorageService {
  private readonly files: string;
  private readonly folders: string;
  private readonly albums: string;
  private readonly albumItemsTable: string;

  constructor(
    private readonly db: ScopedDb,
    private readonly store: StorageCapability,
    private readonly quotaBytes: number = Number.MAX_SAFE_INTEGER,
    private readonly now: () => number = Date.now,
  ) {
    this.files = db.table('file');
    this.folders = db.table('folder');
    this.albums = db.table('album');
    this.albumItemsTable = db.table('album_item');
  }

  usedBytes(): number {
    const row = this.db.get<{ total: number | null }>(`SELECT SUM(size) AS total FROM ${this.files}`);
    return row?.total ?? 0;
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
    const visibility = input.visibility ?? 'private';

    let thumbCid = input.thumbCid ?? null;
    if (thumbCid === null && visibility === 'public' && isImageMime(input.mime)) {
      thumbCid = await this.generateAndStoreThumbnail(input.content);
    }

    this.db.run(
      `INSERT INTO ${this.files}
        (id, parent_path, name, cid, size, mime, visibility, enc_meta, thumb_cid, created_at, updated_at, trashed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.parentPath,
        input.name,
        cid,
        input.content.byteLength,
        input.mime,
        visibility,
        input.encMeta ? JSON.stringify(input.encMeta) : null,
        thumbCid,
        t,
        t,
        null,
      ],
    );
    return this.requireFile(id);
  }

  private async generateAndStoreThumbnail(content: Uint8Array): Promise<string | null> {
    try {
      const thumb = await generateThumbnail(content);
      return await this.store.put(thumb);
    } catch {
      return null;
    }
  }

  private getFile(id: string): FileObject | undefined {
    const row = this.db.get<FileRow>(`SELECT * FROM ${this.files} WHERE id = ?`, [id]);
    return row ? rowToFile(row) : undefined;
  }

  fileMeta(id: string): FileObject | null {
    return this.getFile(id) ?? null;
  }

  private requireFile(id: string): FileObject {
    const file = this.getFile(id);
    if (!file) throw new SovraError('not_found', `file ${id} not found`);
    return file;
  }

  createFolder(path: string, name: string): Folder {
    if (!path.startsWith('/')) {
      throw new SovraError('validation_error', 'folder path must be absolute');
    }
    const id = randomBytes(16).toString('hex');
    const createdAt = this.now();
    this.db.run(`INSERT INTO ${this.folders} (id, path, name, created_at) VALUES (?, ?, ?, ?)`, [
      id,
      path,
      name,
      createdAt,
    ]);
    return { id, path, name, createdAt };
  }

  list(parentPath: string): FileObject[] {
    return this.db
      .all<FileRow>(
        `SELECT * FROM ${this.files} WHERE parent_path = ? AND trashed_at IS NULL ORDER BY name`,
        [parentPath],
      )
      .map(rowToFile);
  }

  move(fileId: string, newParentPath: string): FileObject {
    const file = this.requireFile(fileId);
    this.db.run(`UPDATE ${this.files} SET parent_path = ?, updated_at = ? WHERE id = ?`, [
      newParentPath,
      this.now(),
      fileId,
    ]);
    const updated = this.requireFile(fileId);
    if (updated.cid !== file.cid) {
      throw new SovraError('internal_error', 'CID changed during move');
    }
    return updated;
  }

  trash(fileId: string): void {
    this.requireFile(fileId);
    const t = this.now();
    this.db.run(`UPDATE ${this.files} SET trashed_at = ?, updated_at = ? WHERE id = ?`, [t, t, fileId]);
  }

  restore(fileId: string): FileObject {
    const file = this.requireFile(fileId);
    if (file.trashedAt === null) return file;
    if (this.now() - file.trashedAt > TRASH_RETENTION_MS) {
      throw new SovraError('not_found', 'file retention period expired');
    }
    const parentExists =
      file.parentPath === '/' ||
      this.db.get(`SELECT 1 FROM ${this.folders} WHERE path = ?`, [file.parentPath]) !== undefined;
    const restorePath = parentExists ? file.parentPath : '/';
    this.db.run(`UPDATE ${this.files} SET trashed_at = NULL, parent_path = ?, updated_at = ? WHERE id = ?`, [
      restorePath,
      this.now(),
      fileId,
    ]);
    return this.requireFile(fileId);
  }

  async purgeExpiredTrash(): Promise<number> {
    const cutoff = this.now() - TRASH_RETENTION_MS;
    const expired = this.db.all<FileRow>(
      `SELECT * FROM ${this.files} WHERE trashed_at IS NOT NULL AND trashed_at <= ?`,
      [cutoff],
    );
    for (const row of expired) {
      this.db.run(`DELETE FROM ${this.files} WHERE id = ?`, [row.id]);
      await this.store.release(row.cid);
      if (row.thumb_cid) await this.store.release(row.thumb_cid);
    }
    return expired.length;
  }

  createAlbum(name: string): Album {
    const id = randomBytes(16).toString('hex');
    const createdAt = this.now();
    this.db.run(`INSERT INTO ${this.albums} (id, name, created_at) VALUES (?, ?, ?)`, [id, name, createdAt]);
    return { id, name, createdAt };
  }

  listAlbums(): Album[] {
    return this.db
      .all<{ id: string; name: string; created_at: number }>(
        `SELECT * FROM ${this.albums} ORDER BY created_at DESC`,
      )
      .map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  }

  addToAlbum(albumId: string, fileId: string): void {
    const exists = this.db.get(`SELECT 1 FROM ${this.albums} WHERE id = ?`, [albumId]);
    if (!exists) throw new SovraError('not_found', `album ${albumId} not found`);
    this.db.run(
      `INSERT OR IGNORE INTO ${this.albumItemsTable} (album_id, file_id) VALUES (?, ?)`,
      [albumId, fileId],
    );
  }

  albumItems(albumId: string): FileObject[] {
    const ids = this.db
      .all<{ file_id: string }>(`SELECT file_id FROM ${this.albumItemsTable} WHERE album_id = ?`, [albumId])
      .map((r) => r.file_id);
    return ids
      .map((id) => this.getFile(id))
      .filter((f): f is FileObject => f !== undefined);
  }

  deleteFilePermanently(fileId: string): void {
    this.db.run(`DELETE FROM ${this.albumItemsTable} WHERE file_id = ?`, [fileId]);
    this.db.run(`DELETE FROM ${this.files} WHERE id = ?`, [fileId]);
  }

  searchByName(fragment: string): FileObject[] {
    return this.db
      .all<FileRow>(`SELECT * FROM ${this.files} WHERE name LIKE ?`, [`%${fragment}%`])
      .map(rowToFile);
  }
}
