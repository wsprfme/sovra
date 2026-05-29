import { z } from 'zod';

export const cidSchema = z
  .string()
  .regex(/^b3-[0-9a-f]{64}$/, 'CID must be of the form b3-<64 hex chars>');

export const contentVisibilitySchema = z.enum(['public', 'private']);
export type ContentVisibility = z.infer<typeof contentVisibilitySchema>;

export const encMetaSchema = z.object({
  algo: z.literal('AES-256-GCM'),
  iv: z.string().min(1),
  wrappedKey: z.string().min(1),
  chunkSize: z.number().int().positive(),
});
export type EncMeta = z.infer<typeof encMetaSchema>;

export const fileObjectSchema = z.object({
  id: z.string().uuid(),
  parentPath: z.string().startsWith('/'),
  name: z.string().min(1),
  cid: cidSchema,
  size: z.number().int().nonnegative(),
  mime: z.string().min(1),
  visibility: contentVisibilitySchema,
  encMeta: encMetaSchema.nullable(),
  thumbCid: cidSchema.nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  trashedAt: z.number().int().nonnegative().nullable(),
});
export type FileObject = z.infer<typeof fileObjectSchema>;

export const folderSchema = z.object({
  id: z.string().uuid(),
  path: z.string().startsWith('/'),
  name: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
});
export type Folder = z.infer<typeof folderSchema>;

export const albumSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
});
export type Album = z.infer<typeof albumSchema>;

export const shareModeSchema = z.enum(['public', 'restricted']);

export const shareLinkSchema = z.object({
  token: z.string().min(16),
  targetType: z.enum(['file', 'album']),
  targetId: z.string().uuid(),
  mode: shareModeSchema,
  allowedIdentities: z.array(z.string()).default([]),
  expiresAt: z.number().int().nonnegative().nullable(),
  revoked: z.boolean(),
  createdAt: z.number().int().nonnegative(),
});
export type ShareLink = z.infer<typeof shareLinkSchema>;

export const permissionSchema = z.enum([
  'storage:read',
  'storage:write',
  'proxy:manage',
  'net:outbound:dns',
  'net:outbound:ssh',
  'net:outbound:http',
]);
export type Permission = z.infer<typeof permissionSchema>;

export const extensionStatusSchema = z.enum(['installed', 'enabled', 'disabled']);

export const extensionManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Extension id must be kebab-case'),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'version must be semver'),
  engineVersion: z.string().min(1),
  permissions: z.array(permissionSchema),
  contributes: z
    .object({
      apiNamespace: z.string().regex(/^[a-z][a-z0-9-]*$/),
      uiPanels: z
        .array(
          z.object({
            id: z.string().min(1),
            title: z.string().min(1),
            entry: z.string().min(1),
          }),
        )
        .default([]),
    })
    .optional(),
});
export type ExtensionManifest = z.infer<typeof extensionManifestSchema>;

export const extensionRecordSchema = z.object({
  id: z.string(),
  version: z.string(),
  status: extensionStatusSchema,
  permissions: z.array(permissionSchema),
  installedAt: z.number().int().nonnegative(),
});
export type ExtensionRecord = z.infer<typeof extensionRecordSchema>;

export const siteSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  activeManifestId: z.string().uuid().nullable(),
  createdAt: z.number().int().nonnegative(),
});
export type Site = z.infer<typeof siteSchema>;

export const domainStatusSchema = z.enum(['pending', 'active']);
export const tlsStrategySchema = z.enum(['http-01', 'dns-01', 'cloudflare-origin']);

export const domainSchema = z.object({
  name: z.string().regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/i, 'must be a valid hostname'),
  siteId: z.string().uuid(),
  status: domainStatusSchema,
  tlsStrategy: tlsStrategySchema,
  verifiedAt: z.number().int().nonnegative().nullable(),
});
export type Domain = z.infer<typeof domainSchema>;

export const authModeSchema = z.enum(['password', 'keypair']);
export type AuthMode = z.infer<typeof authModeSchema>;
