export interface DomainAuthorizer {
  isActive(host: string): boolean;
}

export class RegistryDomainAuthorizer implements DomainAuthorizer {
  private active = new Set<string>();

  activate(host: string): void {
    this.active.add(host.toLowerCase());
  }

  deactivate(host: string): void {
    this.active.delete(host.toLowerCase());
  }

  isActive(host: string): boolean {
    return this.active.has(host.toLowerCase());
  }

  reset(hosts: string[]): void {
    this.active = new Set(hosts.map((h) => h.toLowerCase()));
  }
}
