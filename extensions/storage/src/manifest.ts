import { extensionManifestSchema, type ExtensionManifest } from '@sovra/contracts';

export const storageManifest: ExtensionManifest = extensionManifestSchema.parse({
  id: 'storage',
  name: 'Storage',
  version: '0.1.0',
  engineVersion: '^0.1.0',
  description: 'Private drive, photo galleries, and sharing backed by content-addressed blobs.',
  author: 'Sovra',
  permissions: ['storage:read', 'storage:write'],
  contributes: {
    apiNamespace: 'storage',
    nav: [
      { id: 'files', title: 'Files', icon: 'folder', panel: 'files' },
      { id: 'photos', title: 'Photos', icon: 'image', panel: 'photos' },
    ],
    uiPanels: [
      { id: 'files', title: 'Files', entry: 'ui/files' },
      { id: 'photos', title: 'Photos', entry: 'ui/photos' },
    ],
  },
});
