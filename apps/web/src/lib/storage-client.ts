import 'server-only';
import { coreClient } from './core-client';
import type { EncMeta } from '@sovrasdk/crypto';

export interface FileEntry {
  id: string;
  parentPath: string;
  name: string;
  cid: string;
  size: number;
  mime: string;
  visibility: 'public' | 'private';
  encMeta: EncMeta | null;
  thumbCid: string | null;
  createdAt: number;
  updatedAt: number;
  trashedAt: number | null;
}

export interface AlbumEntry {
  id: string;
  name: string;
  createdAt: number;
}

export interface ShareEntry {
  token: string;
  targetType: 'file' | 'album';
  targetId: string;
  mode: 'public' | 'restricted';
  expiresAt: number | null;
  revoked: boolean;
}

const STORAGE = 'storage';

export const storageClient = {
  listFiles: (path: string) =>
    coreClient.ext<{ files: FileEntry[] }>(STORAGE, 'GET', '/files', undefined, { path }),
  usage: () => coreClient.ext<{ usedBytes: number }>(STORAGE, 'GET', '/usage'),
  moveFile: (id: string, parentPath: string) =>
    coreClient.ext<FileEntry>(STORAGE, 'POST', `/files/${id}/move`, { parentPath }),
  trashFile: (id: string) =>
    coreClient.ext<{ ok: boolean }>(STORAGE, 'POST', `/files/${id}/trash`),
  restoreFile: (id: string) =>
    coreClient.ext<FileEntry>(STORAGE, 'POST', `/files/${id}/restore`),
  listAlbums: () => coreClient.ext<{ albums: AlbumEntry[] }>(STORAGE, 'GET', '/albums'),
  createAlbum: (name: string) =>
    coreClient.ext<AlbumEntry>(STORAGE, 'POST', '/albums', { name }),
  addToAlbum: (albumId: string, fileId: string) =>
    coreClient.ext<{ ok: boolean }>(STORAGE, 'POST', `/albums/${albumId}/items`, { fileId }),
  createShare: (body: {
    targetType: 'file' | 'album';
    targetId: string;
    mode: 'public' | 'restricted';
    allowedIdentities?: string[];
    expiresInSeconds?: number;
    wrappedKey?: string;
  }) => coreClient.ext<ShareEntry>(STORAGE, 'POST', '/shares', body),
  revokeShare: (token: string) =>
    coreClient.ext<{ ok: boolean }>(STORAGE, 'DELETE', `/shares/${token}`),
};
