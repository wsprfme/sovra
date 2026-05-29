import { coreClient } from '@/lib/core-client';
import { ExtensionCard } from '@/components/ExtensionCard';

export const dynamic = 'force-dynamic';

export default async function ExtensionsPage() {
  const { catalog } = await coreClient.catalog();

  return (
    <div>
      <h1 className="page-title">Extensions</h1>
      <p className="muted" style={{ marginTop: '-0.9rem', marginBottom: '1.4rem', maxWidth: '60ch' }}>
        Install capabilities into your platform. Each extension lists the permissions it needs
        before it can run. Only enable extensions you trust.
      </p>

      <div className="ext-list">
        {catalog.map((entry) => (
          <ExtensionCard key={entry.manifest.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
