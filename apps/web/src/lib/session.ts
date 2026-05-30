import 'server-only';
import { cookies, headers } from 'next/headers';
import { SESSION_COOKIE } from './core-client';

async function isHttps(): Promise<boolean> {
  const h = await headers();
  const proto = h.get('x-forwarded-proto');
  if (proto) return proto.split(',')[0]?.trim() === 'https';
  const host = h.get('host') ?? '';
  return host.endsWith(':443');
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: await isHttps(),
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}
