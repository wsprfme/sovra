import { describe, expect, it } from 'vitest';
import {
  cidSchema,
  fileObjectSchema,
  extensionManifestSchema,
  shareLinkSchema,
  domainSchema,
} from './entities.js';

const sampleCid = 'b3-' + 'a'.repeat(64);

describe('cidSchema', () => {
  it('accepts canonical b3 CIDs', () => {
    expect(cidSchema.safeParse(sampleCid).success).toBe(true);
  });
  it('rejects malformed CIDs', () => {
    expect(cidSchema.safeParse('abc').success).toBe(false);
    expect(cidSchema.safeParse('b3-XYZ').success).toBe(false);
  });
});

describe('fileObjectSchema', () => {
  const base = {
    id: '11111111-1111-1111-1111-111111111111',
    parentPath: '/photos',
    name: 'cat.jpg',
    cid: sampleCid,
    size: 1024,
    mime: 'image/jpeg',
    visibility: 'private' as const,
    encMeta: {
      algo: 'AES-256-GCM' as const,
      iv: 'aXY=',
      wrappedKey: 'd3Jhcg==',
      chunkSize: 65536,
    },
    thumbCid: null,
    createdAt: 1,
    updatedAt: 1,
    trashedAt: null,
  };

  it('accepts a valid file object', () => {
    expect(fileObjectSchema.safeParse(base).success).toBe(true);
  });

  it('requires parentPath to be absolute', () => {
    expect(fileObjectSchema.safeParse({ ...base, parentPath: 'photos' }).success).toBe(false);
  });

  it('rejects negative size', () => {
    expect(fileObjectSchema.safeParse({ ...base, size: -1 }).success).toBe(false);
  });
});

describe('extensionManifestSchema', () => {
  const manifest = {
    id: 'web-hosting',
    name: 'Web Hosting',
    version: '0.1.0',
    engineVersion: '^0.1.0',
    permissions: ['storage:read', 'proxy:manage'],
    contributes: { apiNamespace: 'web-hosting', uiPanels: [] },
  };

  it('accepts a valid manifest', () => {
    expect(extensionManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('rejects non-kebab-case ids', () => {
    expect(extensionManifestSchema.safeParse({ ...manifest, id: 'WebHosting' }).success).toBe(
      false,
    );
  });

  it('rejects unknown permissions', () => {
    expect(
      extensionManifestSchema.safeParse({ ...manifest, permissions: ['root:everything'] }).success,
    ).toBe(false);
  });

  it('rejects non-semver versions', () => {
    expect(extensionManifestSchema.safeParse({ ...manifest, version: 'v1' }).success).toBe(false);
  });
});

describe('shareLinkSchema', () => {
  it('defaults allowedIdentities to empty', () => {
    const parsed = shareLinkSchema.parse({
      token: 'abcdefghijklmnop',
      targetType: 'file',
      targetId: '11111111-1111-1111-1111-111111111111',
      mode: 'public',
      expiresAt: null,
      revoked: false,
      createdAt: 0,
    });
    expect(parsed.allowedIdentities).toEqual([]);
  });
});

describe('domainSchema', () => {
  it('accepts valid hostnames and rejects junk', () => {
    expect(
      domainSchema.safeParse({
        name: 'example.com',
        siteId: '11111111-1111-1111-1111-111111111111',
        status: 'pending',
        tlsStrategy: 'http-01',
        verifiedAt: null,
      }).success,
    ).toBe(true);
    expect(
      domainSchema.safeParse({
        name: 'not a domain',
        siteId: '11111111-1111-1111-1111-111111111111',
        status: 'pending',
        tlsStrategy: 'http-01',
        verifiedAt: null,
      }).success,
    ).toBe(false);
  });
});
