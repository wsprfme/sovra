'use client';

import { useState } from 'react';
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
  const [isOpen, setIsOpen] = useState(false);

  const link = (href: string, title: string, icon: string) => {
    const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
    return (
      <Link
        key={href}
        href={href}
        className={`nav-link ${active ? 'active' : ''}`}
        onClick={() => setIsOpen(false)}
      >
        <Icon name={icon} />
        <span>{title}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Mobile Sticky Header */}
      <div className="mobile-header">
        <div className="brand">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="24" height="24" style={{ borderRadius: '6px', flexShrink: 0 }}>
            <rect width="32" height="32" rx="7" fill="url(#brandGradHeader)" />
            <defs>
              <linearGradient id="brandGradHeader" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>
            <text x="16" y="22" fontFamily="var(--font-sans), sans-serif" fontSize="18" fontWeight="700" textAnchor="middle" fill="#fff">S</text>
          </svg>
          <span>Sovra</span>
        </div>
        <button className="hamburger" onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isOpen ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <path d="M3 12h18M3 6h18M3 18h18" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Drawer Backdrop */}
      <div className={`mobile-backdrop ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(false)} />

      {/* Sidebar Drawer */}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="brand">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28" style={{ borderRadius: '6px', flexShrink: 0 }}>
            <rect width="32" height="32" rx="7" fill="url(#brandGradSidebar)" />
            <defs>
              <linearGradient id="brandGradSidebar" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>
            <text x="16" y="22" fontFamily="var(--font-sans), sans-serif" fontSize="18" fontWeight="700" textAnchor="middle" fill="#fff">S</text>
          </svg>
          <span>Sovra</span>
        </div>

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
          <form action={logoutAction} onSubmit={() => setIsOpen(false)}>
            <button type="submit" style={{ width: '100%' }}>
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
