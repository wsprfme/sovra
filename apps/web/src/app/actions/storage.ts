'use server';

import { revalidatePath } from 'next/cache';
import { SovraError } from '@sovra/contracts';
import { storageClient } from '@/lib/storage-client';

export interface MutationResult {
  ok: boolean;
  error: string | null;
}

function toResult(fn: () => Promise<unknown>): Promise<MutationResult> {
  return fn()
    .then(() => ({ ok: true, error: null }))
    .catch((e) => ({ ok: false, error: SovraError.is(e) ? e.message : 'Operation failed' }));
}

export async function trashFileAction(id: string): Promise<MutationResult> {
  const r = await toResult(() => storageClient.trashFile(id));
  revalidatePath('/files');
  return r;
}

export async function restoreFileAction(id: string): Promise<MutationResult> {
  const r = await toResult(() => storageClient.restoreFile(id));
  revalidatePath('/files');
  return r;
}

export async function moveFileAction(id: string, parentPath: string): Promise<MutationResult> {
  const r = await toResult(() => storageClient.moveFile(id, parentPath));
  revalidatePath('/files');
  return r;
}

export async function createAlbumAction(name: string): Promise<MutationResult> {
  const r = await toResult(() => storageClient.createAlbum(name));
  revalidatePath('/photos');
  return r;
}

export async function createShareAction(input: {
  targetType: 'file' | 'album';
  targetId: string;
  mode: 'public' | 'restricted';
  expiresInSeconds?: number;
}): Promise<MutationResult & { token?: string }> {
  try {
    const link = await storageClient.createShare(input);
    revalidatePath('/files');
    return { ok: true, error: null, token: link.token };
  } catch (e) {
    return { ok: false, error: SovraError.is(e) ? e.message : 'Share failed' };
  }
}

export async function revokeShareAction(token: string): Promise<MutationResult> {
  return toResult(() => storageClient.revokeShare(token));
}
