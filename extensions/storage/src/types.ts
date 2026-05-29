export interface EncMeta {
  algo: 'AES-256-GCM';
  iv: string;
  wrappedKey: string;
  chunkSize: number;
}

export type Visibility = 'public' | 'private';

export interface FileObject {
  id: string;
  parentPath: string;
  name: string;
  cid: string;
  size: number;
  mime: string;
  visibility: Visibility;
  encMeta: EncMeta | null;
  thumbCid: string | null;
  createdAt: number;
  updatedAt: number;
  trashedAt: number | null;
}

export interface Folder {
  id: string;
  path: string;
  name: string;
  createdAt: number;
}

export interface Album {
  id: string;
  name: string;
  createdAt: number;
}

export interface ShareLink {
  token: string;
  targetType: 'file' | 'album';
  targetId: string;
  mode: 'public' | 'restricted';
  allowedIdentities: string[];
  expiresAt: number | null;
  revoked: boolean;
  createdAt: number;
}

export interface UploadInput {
  parentPath: string;
  name: string;
  content: Uint8Array;
  mime: string;
  visibility?: Visibility;
  encMeta?: EncMeta | null;
  thumbCid?: string | null;
}

export interface CreateShareInput {
  targetType: 'file' | 'album';
  targetId: string;
  mode: 'public' | 'restricted';
  allowedIdentities?: string[];
  expiresInSeconds?: number;
  wrappedKey?: string;
}
