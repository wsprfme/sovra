interface ShareFile {
  id: string;
  name: string;
  cid: string;
  mime: string;
  visibility: string;
}

interface Props {
  file: ShareFile | null;
  files: ShareFile[];
  mode: string;
}

export function SharedContent({ file, files, mode }: Props) {
  const items = file ? [file] : files;

  if (items.length === 0) {
    return <p className="muted">This share has no downloadable content.</p>;
  }

  return (
    <div>
      <h1 className="page-title">Shared with you</h1>
      {mode === 'restricted' && (
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          This is a restricted share.
        </p>
      )}
      <div className="stack">
        {items.map((f) => (
          <div key={f.id} className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div>{f.name}</div>
              <div className="muted" style={{ fontSize: '0.78rem' }}>
                {f.mime}
                {f.visibility === 'private' ? ' · encrypted' : ''}
              </div>
            </div>
            {f.visibility === 'public' ? (
              <a href={`/api/blob/${f.cid}`} download={f.name}>
                <button className="primary">Download</button>
              </a>
            ) : (
              <span className="muted" style={{ fontSize: '0.78rem' }}>
                Requires key
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
