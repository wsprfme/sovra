import { describe, expect, it } from 'vitest';
import { openDatabase, getSchemaVersion, SCHEMA_VERSION } from './index.js';
import { account, albumItem, album, fileObject } from './schema.js';

function tmpDb() {
  return openDatabase(':memory:');
}

describe('database layer', () => {
  it('creates schema and records schema version', () => {
    const h = tmpDb();
    expect(getSchemaVersion(h)).toBe(SCHEMA_VERSION);
    h.close();
  });

  it('persists and reads an account row', () => {
    const h = tmpDb();
    h.db
      .insert(account)
      .values({
        id: 'a1',
        username: 'admin',
        authMode: 'password',
        passwordHash: 'hash',
        pubkey: null,
        kdfParams: '{}',
        createdAt: 1,
      })
      .run();
    const rows = h.db.select().from(account).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.username).toBe('admin');
    h.close();
  });

  it('enforces UNIQUE album_item membership', () => {
    const h = tmpDb();
    h.db.insert(album).values({ id: 'al1', name: 'Trip', createdAt: 1 }).run();
    h.db
      .insert(fileObject)
      .values({
        id: 'f1',
        parentPath: '/',
        name: 'a.jpg',
        cid: 'b3-' + 'a'.repeat(64),
        size: 1,
        mime: 'image/jpeg',
        visibility: 'private',
        encMeta: null,
        thumbCid: null,
        createdAt: 1,
        updatedAt: 1,
        trashedAt: null,
      })
      .run();
    h.db.insert(albumItem).values({ albumId: 'al1', fileObjectId: 'f1' }).run();
    expect(() =>
      h.db.insert(albumItem).values({ albumId: 'al1', fileObjectId: 'f1' }).run(),
    ).toThrow();
    h.close();
  });
});
