import { NextResponse } from 'next/server';
import { SovraError } from '@sovra/contracts';
import { getSessionToken } from '@/lib/session';

const CORE_URL = process.env.SOVRA_CORE_URL ?? 'http://127.0.0.1:8787';

export async function POST(request: Request): Promise<Response> {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(new SovraError('unauthorized', 'not signed in').toJSON(), { status: 401 });
  }
  const body = await request.text();
  const res = await fetch(new URL('/upload', CORE_URL), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sovra-session': token,
    },
    body,
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
}
