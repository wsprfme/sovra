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

export async function addConnectionAction(input: {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
}): Promise<MutationResult> {
  try {
    await coreClient.ext('vps', 'POST', '/connections', input);
    revalidatePath('/vps');
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export interface VpsStatusResult {
  ok: boolean;
  error: string | null;
  status?: { uptime: string; cpuLoad: string; memory: string; disk: string };
}

export async function fetchStatusAction(id: string): Promise<VpsStatusResult> {
  try {
    const status = await coreClient.ext<{
      uptime: string;
      cpuLoad: string;
      memory: string;
      disk: string;
    }>('vps', 'GET', `/connections/${id}/status`);
    return { ok: true, error: null, status };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
