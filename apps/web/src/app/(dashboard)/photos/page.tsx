import { coreClient } from '@/lib/core-client';
import { Uploader } from '@/components/Uploader';
import { PhotoTile } from '@/components/PhotoTile';

export const dynamic = 'force-dynamic';

export default async function PhotosPage() {
  const { files } = await coreClient.listFiles('/');
  const photos = files.filter((f) => f.trashedAt === null && f.mime.startsWith('image/'));

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '1.4rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Photos
        </h1>
        <Uploader parentPath="/" defaultVisibility="private" accept="image/*" />
      </div>

      {photos.length === 0 ? (
        <div className="card muted">No photos yet.</div>
      ) : (
        <div className="grid">
          {photos.map((p) => (
            <PhotoTile key={p.id} photo={p} />
          ))}
        </div>
      )}
    </div>
  );
}
