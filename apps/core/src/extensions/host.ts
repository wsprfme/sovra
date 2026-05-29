import { SovraError, type ExtensionManifest, type ExtensionRecord, type Permission } from '@sovrasdk/contracts';
import { ExtensionRegistry } from './registry.js';
import { buildCatalog, type CatalogEntry } from './catalog.js';
import { parseManifest } from './manifest.js';

export interface CatalogListing {
  manifest: ExtensionManifest;
  installed: boolean;
  status: 'installed' | 'enabled' | 'disabled' | 'available';
}

export class ExtensionHost {
  private readonly catalog: Map<string, CatalogEntry>;

  constructor(
    readonly registry: ExtensionRegistry,
    catalog: Map<string, CatalogEntry> = buildCatalog(),
  ) {
    this.catalog = catalog;
  }

  available(): CatalogListing[] {
    const installed = new Map(this.registry.list().map((r) => [r.id, r]));
    return [...this.catalog.values()].map((entry) => {
      const rec = installed.get(entry.manifest.id);
      return {
        manifest: entry.manifest,
        installed: rec !== undefined,
        status: rec ? rec.status : 'available',
      };
    });
  }

  list(): ExtensionRecord[] {
    return this.registry.list();
  }

  installFromCatalog(id: string): ExtensionRecord {
    const entry = this.catalog.get(id);
    if (!entry) throw new SovraError('not_found', `extension ${id} not in catalog`);
    return this.registry.install(entry.manifest);
  }

  install(manifestInput: unknown, source: CatalogEntry['create']): ExtensionRecord {
    const manifest = parseManifest(manifestInput);
    this.catalog.set(manifest.id, { manifest, create: source });
    return this.registry.install(manifest);
  }

  async enable(id: string, approvedPermissions: Permission[]): Promise<void> {
    const entry = this.catalog.get(id);
    if (!entry) throw new SovraError('not_found', `extension ${id} has no loadable code`);
    await this.registry.enable(id, () => entry.create(), approvedPermissions);
  }

  async disable(id: string): Promise<void> {
    await this.registry.disable(id);
  }

  async uninstall(id: string, options: { deleteData?: boolean } = {}): Promise<void> {
    await this.registry.uninstall(id, options);
  }

  async restore(): Promise<void> {
    for (const rec of this.registry.list()) {
      if (rec.status !== 'enabled') continue;
      const entry = this.catalog.get(rec.id);
      if (!entry) continue;
      try {
        await this.registry.enable(rec.id, () => entry.create(), entry.manifest.permissions);
      } catch {
        await this.registry.disable(rec.id);
      }
    }
  }
}
