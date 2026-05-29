'use server';

import { revalidatePath } from 'next/cache';
import { SovraError } from '@sovra/contracts';
import { coreClient } from '@/lib/core-client';

export interface MutationResult {
  ok: boolean;
  error: string | null;
}

function message(e: unknown): string {
  return SovraError.is(e) ? e.message : 'Operation failed';
}

async function run(fn: () => Promise<unknown>): Promise<MutationResult> {
  try {
    await fn();
    revalidatePath('/extensions');
    revalidatePath('/', 'layout');
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function installExtensionAction(id: string): Promise<MutationResult> {
  return run(() => coreClient.installExtension(id));
}

export async function enableExtensionAction(id: string, permissions: string[]): Promise<MutationResult> {
  return run(() => coreClient.enableExtension(id, permissions));
}

export async function disableExtensionAction(id: string): Promise<MutationResult> {
  return run(() => coreClient.disableExtension(id));
}

export async function uninstallExtensionAction(id: string, deleteData: boolean): Promise<MutationResult> {
  return run(() => coreClient.uninstallExtension(id, deleteData));
}
