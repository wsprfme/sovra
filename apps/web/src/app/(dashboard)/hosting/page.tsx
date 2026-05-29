import { coreClient } from '@/lib/core-client';
import { hostingClient } from '@/lib/hosting-client';
import { isExtensionEnabled } from '@/lib/nav';
import { ExtensionDisabled } from '@/components/ExtensionDisabled';
import { HostingManager } from '@/components/HostingManager';

export const dynamic = 'force-dynamic';

export default async function HostingPage() {
  const { extensions } = await coreClient.listExtensions();
  if (!isExtensionEnabled(extensions, 'web-hosting')) {
    return <ExtensionDisabled name="Web Hosting" />;
  }

  const [{ sites }, { domains }, cf] = await Promise.all([
    hostingClient.listSites(),
    hostingClient.listDomains(),
    hostingClient.cloudflareStatus(),
  ]);

  return (
    <div>
      <h1 className="page-title">Web Hosting</h1>
      <HostingManager sites={sites} domains={domains} cloudflareConnected={cf.connected} />
    </div>
  );
}
