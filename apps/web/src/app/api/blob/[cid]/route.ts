import { NextResponse } from 'next/server';

const CORE_URL = process.env.SOVRA_CORE_URL ?? 'http://127.0.0.1:8787';

export async function GET(
  _request: Request,
  context: { params: Promise<{ cid: string }> },
): Promise<Response> {
  const { cid } = await context.params;
  const res = await fetch(new URL(`/blob/${cid}`, CORE_URL), { cache: 'no-store' });
  if (!res.ok) {
    return NextResponse.json({ code: 'not_found', message: 'blob not found' }, { status: res.status });
  }
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=60' },
  });
}
