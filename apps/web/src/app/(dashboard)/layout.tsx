import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionToken } from '@/lib/session';
import { coreClient } from '@/lib/core-client';
import { Sidebar } from '@/components/Sidebar';
import { buildExtensionNav } from '@/lib/nav';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const status = await coreClient.status();
  if (!status.hasAccount) redirect('/setup');
  const token = await getSessionToken();
  if (!token) redirect('/login');

  const { extensions } = await coreClient.listExtensions();
  const extensionNav = buildExtensionNav(extensions);

  return (
    <div className="shell">
      <Sidebar primaryDomain={status.primaryDomain} extensionNav={extensionNav} />
      <main className="main">{children}</main>
    </div>
  );
}
