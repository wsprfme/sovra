import { coreClient } from '@/lib/core-client';
import { Uploader } from '@/components/Uploader';
import { FileRow } from '@/components/FileRow';

export const dynamic = 'force-dynamic';

export default async function FilesPage() {
  const { files } = await coreClient.listFiles('/');
  const live = files.filter((f) => f.trashedAt === null);

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '1.4rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Files
        </h1>
        <Uploader parentPath="/" defaultVisibility="private" />
      </div>

      {live.length === 0 ? (
        <div className="card muted">No files yet. Upload your first file to get started.</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Visibility</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {live.map((f) => (
                <FileRow key={f.id} file={f} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
