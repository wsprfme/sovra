import { coreClient } from '@/lib/core-client';
import { isExtensionEnabled } from '@/lib/nav';
import { ExtensionDisabled } from '@/components/ExtensionDisabled';

export const dynamic = 'force-dynamic';

export default async function ExtensionPanelPage({
  params,
}: {
  params: Promise<{ id: string; panel: string }>;
}) {
  const { id, panel } = await params;
  const { extensions } = await coreClient.listExtensions();
  const ext = extensions.find((e) => e.id === id);
  if (!ext || ext.status !== 'enabled') {
    return <ExtensionDisabled name={ext?.name ?? id} />;
  }
  const nav = ext.nav.find((n) => n.panel === panel);

  return (
    <div>
      <h1 className="page-title">{nav?.title ?? ext.name}</h1>
      <div className="iframe-host">
        <iframe
          title={`${ext.name} panel`}
          src={`/api/ext-ui/${id}/${panel}`}
          sandbox="allow-scripts allow-forms"
          className="ext-frame"
        />
      </div>
    </div>
  );
}
