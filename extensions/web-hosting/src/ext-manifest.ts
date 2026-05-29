import { extensionManifestSchema, type ExtensionManifest } from '@sovra/contracts';

export const webHostingManifest: ExtensionManifest = extensionManifestSchema.parse({
  id: 'web-hosting',
  name: 'Web Hosting',
  version: '0.1.0',
  engineVersion: '^0.1.0',
  description: 'Publish static sites with versioned deploys, custom domains, and automatic TLS.',
  author: 'Sovra',
  permissions: ['storage:read', 'storage:write', 'proxy:manage', 'net:outbound:dns', 'net:outbound:http'],
  contributes: {
    apiNamespace: 'web-hosting',
    nav: [{ id: 'hosting', title: 'Web Hosting', icon: 'globe', panel: 'sites' }],
    uiPanels: [{ id: 'sites', title: 'Sites', entry: 'ui/sites' }],
  },
});
