'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';
import { Icon } from './Icon';

export interface NavItem {
  href: string;
  title: string;
  icon: string;
}

interface Props {
  primaryDomain: string;
  extensionNav: NavItem[];
}

export function Sidebar({ primaryDomain, extensionNav }: Props) {
  const pathname = usePathname();

  const link = (href: string, title: string, icon: string) => {
    const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
    return (
      <Link key={href} href={href} className={`nav-link ${active ? 'active' : ''}`}>
        <Icon name={icon} />
        <span>{title}</span>
      </Link>
    );
  };

  return (
    <aside className="sidebar">
      <div className="brand">Sovra</div>

      {link('/dashboard', 'Home', 'home')}

      {extensionNav.length > 0 && (
        <div className="nav-section">Extensions</div>
      )}
      {extensionNav.map((n) => link(n.href, n.title, n.icon))}

      <div className="nav-section">System</div>
      {link('/extensions', 'Extensions', 'puzzle')}
      {link('/audit', 'Audit Log', 'shield')}

      <div className="sidebar-footer">
        {!primaryDomain && (
          <div className="sidebar-note">
            No domain set. You are on a plain-HTTP connection.
          </div>
        )}
        <form action={logoutAction}>
          <button type="submit" style={{ width: '100%' }}>
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
