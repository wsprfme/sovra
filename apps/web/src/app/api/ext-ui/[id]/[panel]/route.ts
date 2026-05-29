import { NextResponse } from 'next/server';
import { getSessionToken } from '@/lib/session';

const CORE_URL = process.env.SOVRA_CORE_URL ?? 'http://127.0.0.1:8787';
const INTERNAL_TOKEN = process.env.SOVRA_INTERNAL_TOKEN ?? '';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; panel: string }> },
): Promise<Response> {
  const token = await getSessionToken();
  if (!token) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const { id, panel } = await context.params;
  const res = await fetch(new URL(`/internal/ext/${id}/ui/${panel}`, CORE_URL), {
    headers: { 'x-sovra-session': token, 'x-sovra-internal': INTERNAL_TOKEN },
    cache: 'no-store',
  });
  if (!res.ok) {
    return new NextResponse('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;color:#9aa3b2;background:#0f1115;padding:1rem">This extension does not provide a UI panel.</body>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  const data = (await res.json()) as { html?: string };
  const html = typeof data.html === 'string' ? data.html : '';
  return new NextResponse(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
