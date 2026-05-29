import { extensionManifestSchema, type ExtensionManifest } from '@sovra/contracts';

export const vpsManifest: ExtensionManifest = extensionManifestSchema.parse({
  id: 'vps',
  name: 'VPS Control',
  version: '0.1.0',
  engineVersion: '^0.1.0',
  description: 'Manage remote servers over SSH: live status, service control, and a console.',
  author: 'Sovra',
  permissions: ['net:outbound:ssh'],
  contributes: {
    apiNamespace: 'vps',
    nav: [{ id: 'vps', title: 'VPS', icon: 'server', panel: 'servers' }],
    uiPanels: [{ id: 'servers', title: 'Servers', entry: 'ui/servers' }],
  },
});
