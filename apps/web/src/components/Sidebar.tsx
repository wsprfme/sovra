'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';

interface Props {
  enabledExtensions: string[];
}

export function Sidebar({ enabledExtensions }: Props) {
  const pathname = usePathname();
  const link = (href: string, label: string) => (
    <Link href={href} className={`nav-link ${pathname === href ? 'active' : ''}`}>
      {label}
    </Link>
  );

  return (
    <aside className="sidebar">
      <div className="brand">Sovra</div>
      {link('/files', 'Files')}
      {link('/photos', 'Photos')}
      {enabledExtensions.includes('web-hosting') && link('/hosting', 'Web Hosting')}
      {enabledExtensions.includes('vps') && link('/vps', 'VPS')}
      {link('/extensions', 'Extensions')}
      {link('/audit', 'Audit Log')}
      <div style={{ marginTop: 'auto' }}>
        <form action={logoutAction}>
          <button type="submit" style={{ width: '100%' }}>
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
