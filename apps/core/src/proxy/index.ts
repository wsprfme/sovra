import { CaddyAdminClient, type CaddyAdmin, type CaddyRoute } from './caddy-client.js';
import { RegistryDomainAuthorizer, type DomainAuthorizer } from './domain-authorizer.js';

export { CaddyAdminClient, RegistryDomainAuthorizer };
export type { CaddyAdmin, CaddyRoute, DomainAuthorizer };

export class ProxyController {
  constructor(
    private readonly caddy: CaddyAdmin,
    readonly authorizer: RegistryDomainAuthorizer,
  ) {}

  async bindDomain(host: string, upstream: string): Promise<void> {
    await this.caddy.setRoute({ host, upstream });
    this.authorizer.activate(host);
  }

  async unbindDomain(host: string): Promise<void> {
    await this.caddy.removeRoute(host);
    this.authorizer.deactivate(host);
  }

  authorizeTls(host: string): boolean {
    return this.authorizer.isActive(host);
  }
}
