import { coreClient } from '@/lib/core-client';
import { vpsClient } from '@/lib/vps-client';
import { isExtensionEnabled } from '@/lib/nav';
import { ExtensionDisabled } from '@/components/ExtensionDisabled';
import { VpsManager } from '@/components/VpsManager';

export const dynamic = 'force-dynamic';

export default async function VpsPage() {
  const { extensions } = await coreClient.listExtensions();
  if (!isExtensionEnabled(extensions, 'vps')) {
    return <ExtensionDisabled name="VPS Control" />;
  }

  const { connections } = await vpsClient.listConnections();

  return (
    <div>
      <h1 className="page-title">VPS Control</h1>
      <VpsManager connections={connections} />
    </div>
  );
}
