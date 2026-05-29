# Writing Sovra Extensions

Sovra is a kernel plus an ecosystem of extensions. The kernel provides identity, a
content-addressed blob store, a scoped database, a reverse-proxy controller, audit, and backups.
Everything a user actually interacts with — a drive, photo galleries, web hosting, server
control — is an extension. The first-party `storage`, `web-hosting`, and `vps` extensions are
reference implementations.

## Philosophy

Extensions run in-process and can use any npm package, like a WordPress plugin. The trade-off is
trust: a third-party extension you enable runs with the capabilities you approve. The kernel makes
that bargain transparent — every extension declares the permissions it needs, and the user sees
and approves them before it is enabled. Install what you trust.

## Anatomy

An extension is a workspace package that exports:

1. A typed **manifest** (`ExtensionManifest`) declaring id, version, permissions, and UI
   contributions.
2. A **factory** returning a `SovraExtension` with optional `migrations` and `activate` /
   `deactivate`.

```ts
import { extensionManifestSchema } from '@sovra/contracts';

export const myManifest = extensionManifestSchema.parse({
  id: 'notes',
  name: 'Notes',
  version: '0.1.0',
  engineVersion: '^0.1.0',
  description: 'A tiny notes app.',
  author: 'you',
  permissions: [],
  contributes: {
    apiNamespace: 'notes',
    nav: [{ id: 'notes', title: 'Notes', icon: 'list', panel: 'notes' }],
    uiPanels: [{ id: 'notes', title: 'Notes', entry: 'ui/notes' }],
  },
});
```

## The database — no boilerplate

Extensions get a **scoped database** (`ctx.db`) and a **migration runner**. Declare your schema as
migrations; the kernel runs the pending ones when the extension is enabled. Every table name you
pass through `ctx.db.table(name)` is automatically prefixed with `ext_<id>_`, so extensions can
never collide or read each other's tables.

```ts
import type { Migration } from '@sovra/extension-api';

export const migrations: Migration[] = [
  {
    id: '001-init',
    up: (db) =>
      db.exec(`CREATE TABLE ${db.table('note')} (id TEXT PRIMARY KEY, body TEXT NOT NULL)`),
  },
];
```

```ts
ctx.db.run(`INSERT INTO ${ctx.db.table('note')} (id, body) VALUES (?, ?)`, [id, body]);
const rows = ctx.db.all(`SELECT * FROM ${ctx.db.table('note')}`);
```

`ctx.db` also exposes `get`, `transaction`, and `exec`. Migrations are tracked per-extension and
applied exactly once.

## Permissions and capabilities

Permissions are a closed enumeration enforced by the kernel. A capability handle is injected into
`ctx` only if its permission was approved at enable time.

| Permission | Grants |
|------------|--------|
| `storage:read` / `storage:write` | The content store via `ctx.storage` (`put`/`get`/`has`/`release`) |
| `proxy:manage` | Reverse-proxy routes and domains via `ctx.proxy` |
| `net:outbound:http` | Outbound HTTP via `ctx.net.fetch` |
| `net:outbound:dns` | Outbound calls to DNS/API providers via `ctx.net` |
| `net:outbound:ssh` | Outbound SSH connections |

Two capabilities are always available and need no permission, because they only touch the
extension's own data:

- `ctx.kv` — a namespaced key/value store.
- `ctx.secrets` — `encrypt` / `decrypt` for storing tokens and credentials at rest. The key is
  derived from the server secret and the extension id.

`ctx.env` exposes a small set of platform values (e.g. `SOVRA_SERVER_IP`, `SOVRA_PRIMARY_DOMAIN`).

## Routing

`activate(ctx, router)` registers HTTP handlers:

```ts
activate(ctx, router) {
  router.get('/notes', () => ({ status: 200, body: ctx.db.all(/* ... */) }));
  router.post('/notes', (req) => { /* ... */ return { status: 200, body: { ok: true } }; });

  // Public (unauthenticated) routes, reachable at /ext/<id>/<path>:
  router.public.get('/feed/:token', (req) => ({ status: 200, body: load(req.params.token) }));

  // Serve arbitrary hostnames (e.g. hosted sites). Return null to pass through.
  router.host(async (req) => {
    const site = lookup(req.host);
    return site ? { status: 200, body: render(site, req.path) } : null;
  });
}
```

- Authenticated routes are mounted at `/internal/ext/<id>/<path>` and reached by the dashboard
  through the BFF.
- Public routes are mounted at `/ext/<id>/<path>` and rate-limited.
- Path params (`:id`) are parsed and provided on `req.params`.

## UI

Declare `contributes.nav` entries to add sidebar links. First-party extensions ship native
dashboard pages; community extensions render their panel in a sandboxed iframe served from the
extension's `ui/<panel>` route.

## Lifecycle and isolation

- Thrown errors are caught by the host; a failing extension is isolated and never crashes the
  kernel or other extensions.
- `deactivate` should release any long-lived resources.
- On uninstall, an extension's data (tables, kv, migration records) is preserved unless the user
  explicitly asks to delete it.

## Distribution

First-party extensions are bundled in the published catalog. Extensions can also be installed from
a catalog index, a URL, a Git repository, or an uploaded archive. See `catalog/index.json` for the
catalog format.
