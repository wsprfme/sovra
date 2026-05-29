import { SharedContent } from '@/components/SharedContent';

const CORE_URL = process.env.SOVRA_CORE_URL ?? 'http://127.0.0.1:8787';

interface ShareResponse {
  share: { targetType: 'file' | 'album'; mode: string };
  file: { id: string; name: string; cid: string; mime: string; size: number; visibility: string } | null;
  files: Array<{ id: string; name: string; cid: string; mime: string; visibility: string }>;
}

export const dynamic = 'force-dynamic';

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await fetch(new URL(`/ext/storage/s/${token}`, CORE_URL), { cache: 'no-store' });

  if (!res.ok) {
    return (
      <div className="center-screen">
        <div className="card auth-card">
          <div className="brand">Sovra</div>
          <h1 className="page-title">Link unavailable</h1>
          <p className="muted">This share link is invalid, expired, or has been revoked.</p>
        </div>
      </div>
    );
  }

  const data = (await res.json()) as ShareResponse;

  return (
    <div className="center-screen">
      <div className="card auth-card" style={{ maxWidth: '560px' }}>
        <div className="brand">Sovra</div>
        <SharedContent file={data.file} files={data.files} mode={data.share.mode} />
      </div>
    </div>
  );
}
