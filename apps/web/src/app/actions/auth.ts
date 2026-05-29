'use server';

import { redirect } from 'next/navigation';
import { SovraError } from '@sovrasdk/contracts';
import { coreClient } from '@/lib/core-client';
import { clearSessionCookie, setSessionCookie } from '@/lib/session';

export interface ActionState {
  error: string | null;
}

export async function setupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const authMode = String(formData.get('authMode') ?? 'password');

  try {
    await coreClient.setup({ username, authMode, password });
    const { token } = await coreClient.login({ username, password });
    await setSessionCookie(token);
  } catch (e) {
    return { error: SovraError.is(e) ? e.message : 'Setup failed' };
  }
  redirect('/dashboard');
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  try {
    const { token } = await coreClient.login({ username, password });
    await setSessionCookie(token);
  } catch (e) {
    return { error: SovraError.is(e) ? e.message : 'Login failed' };
  }
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  const { getSessionToken } = await import('@/lib/session');
  const token = await getSessionToken();
  if (token) {
    try {
      await coreClient.logout(token);
    } catch {
      // ignore
    }
  }
  await clearSessionCookie();
  redirect('/login');
}
