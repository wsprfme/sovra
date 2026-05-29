'use server';

import { revalidatePath } from 'next/cache';
import { SovraError } from '@sovrasdk/contracts';
import { coreClient } from '@/lib/core-client';

export interface MutationResult {
  ok: boolean;
  error: string | null;
}

function message(e: unknown): string {
  return SovraError.is(e) ? e.message : 'Operation failed';
}

export async function createSiteAction(name: string): Promise<MutationResult> {
  try {
    await coreClient.ext('web-hosting', 'POST', '/sites', { name });
    revalidatePath('/hosting');
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function registerDomainAction(input: {
  name: string;
  siteId: string;
  behindCloudflare: boolean;
}): Promise<MutationResult> {
  try {
    await coreClient.ext('web-hosting', 'POST', '/domains', input);
    revalidatePath('/hosting');
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function deployFilesAction(
  siteId: string,
  files: Array<{ path: string; contentBase64: string }>,
): Promise<MutationResult> {
  try {
    await coreClient.ext('web-hosting', 'POST', `/sites/${siteId}/deploy`, { siteId, files });
    revalidatePath('/hosting');
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
