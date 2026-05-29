import type { ExtensionRecord } from '@sovrasdk/contracts';
import type { NavItem } from '@/components/Sidebar';

const FIRST_PARTY_ROUTES: Record<string, Record<string, string>> = {
  storage: { files: '/files', photos: '/photos' },
  'web-hosting': { sites: '/hosting' },
  vps: { servers: '/vps' },
};

export function buildExtensionNav(extensions: ExtensionRecord[]): NavItem[] {
  const items: NavItem[] = [];
  for (const ext of extensions) {
    if (ext.status !== 'enabled') continue;
    for (const nav of ext.nav) {
      const mapped = FIRST_PARTY_ROUTES[ext.id]?.[nav.panel];
      items.push({
        href: mapped ?? `/app/${ext.id}/${nav.panel}`,
        title: nav.title,
        icon: nav.icon,
      });
    }
  }
  return items;
}

export function isExtensionEnabled(extensions: ExtensionRecord[], id: string): boolean {
  return extensions.some((e) => e.id === id && e.status === 'enabled');
}
