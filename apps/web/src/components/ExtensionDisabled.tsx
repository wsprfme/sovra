import Link from 'next/link';

export function ExtensionDisabled({ name }: { name: string }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{name} is not enabled</h2>
      <p className="muted">
        This page is provided by the {name} extension, which is not currently enabled. Install or
        enable it from the extensions catalog to use this feature.
      </p>
      <Link href="/extensions">
        <button className="primary" style={{ marginTop: '0.4rem' }}>
          Go to extensions
        </button>
      </Link>
    </div>
  );
}
