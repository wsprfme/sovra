# Writing Sovra Extensions

Extensions add capabilities to the core platform without bloating it. The built-in `web-hosting` and `vps` extensions are reference implementations.

## Anatomy

An extension is a package with:

1. An **`extension.json`** manifest declaring its id, version, requested permissions, and UI contributions.
2. A module exporting a factory that returns a `SovraExtension` (`activate` / `deactivate`).

```jsonc
{
  "id": "web-hosting",
  "name": "Web Hosting",
  "version": "0.1.0",
  "engineVersion": "^0.1.0",
  "permissions": ["storage:read", "storage:write", "proxy:manage", "net:outbound:dns"],
  "contributes": {
    "apiNamespace": "web-hosting",
    "uiPanels": [{ "id": "sites", "title": "Sites", "entry": "ui/sites.html" }]
  }
}
```

## Permissions

Permissions are a closed enumeration enforced by the core. An extension only receives a capability handle (`ctx.storage`, `ctx.proxy`, `ctx.net`) if the matching permission was approved by the user at enable time.

| Permission | Grants |
|------------|--------|
| `storage:read` / `storage:write` | Read/write the content store via `ctx.storage` |
| `proxy:manage` | Manage reverse-proxy routes and domains via `ctx.proxy` |
| `net:outbound:dns` | Outbound calls for DNS/API providers |
| `net:outbound:ssh` | Outbound SSH connections |
| `net:outbound:http` | General outbound HTTP |

Requesting a permission you don't use will be flagged in review. Request the minimum.

## Lifecycle

```ts
import type { SovraExtension, ExtensionContext, ExtensionRouter } from '@sovra/extension-api';

export function createMyExtension(deps): SovraExtension {
  return {
    activate(ctx: ExtensionContext, router: ExtensionRouter) {
      router.get('/things', async (req) => {
        const items = ctx.kv.list();
        return { status: 200, body: { items } };
      });
    },
    deactivate() {
      // release resources
    },
  };
}
```

- Routes are mounted under `/internal/ext/<id>/<path>` and reached by the dashboard through the BFF.
- `ctx.kv` is a per-extension key/value store, namespaced and isolated from other extensions.
- `ctx.audit.record(action, result, detail)` writes to the audit log (secrets are redacted automatically).
- Thrown errors are caught by the host: a failing extension is isolated and never crashes the core or other extensions.

## Isolation

- Extension code runs inside the core engine but is wrapped so failures are contained.
- Extension UI panels are rendered in sandboxed iframes in the dashboard and communicate via `postMessage`.
- Data created by an extension is preserved on uninstall unless the user explicitly requests deletion.

## Testing

Write tests against your services with an in-memory database (`openDatabase(':memory:')`) and mock external systems (SSH, Cloudflare, Caddy) behind interfaces, as the first-party extensions do.
