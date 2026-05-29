import type { ExtensionManifest } from '@sovrasdk/contracts';
import type { SovraExtension } from '@sovrasdk/extension-api';
import { createStorageExtension, storageManifest } from '@sovra/ext-storage';
import { createWebHostingExtension, webHostingManifest } from '@sovra/ext-web-hosting';
import { createVpsExtension, vpsManifest } from '@sovra/ext-vps';

export interface CatalogEntry {
  manifest: ExtensionManifest;
  create: () => SovraExtension;
}

export function buildCatalog(): Map<string, CatalogEntry> {
  const catalog = new Map<string, CatalogEntry>();
  catalog.set(storageManifest.id, {
    manifest: storageManifest,
    create: () => createStorageExtension(),
  });
  catalog.set(webHostingManifest.id, {
    manifest: webHostingManifest,
    create: () => createWebHostingExtension(),
  });
  catalog.set(vpsManifest.id, {
    manifest: vpsManifest,
    create: () => createVpsExtension(),
  });
  return catalog;
}
