# @sovrasdk/extension-api

The SDK for building [Sovra](https://github.com/wsprfme/sovra) extensions — a self-hosted app
platform (a kernel plus an ecosystem of extensions).

```bash
npm install @sovrasdk/extension-api
```

An extension exports a manifest and a factory returning a `SovraExtension`. It gets a scoped
database with a migration runner, capability handles gated by user-approved permissions, a
key/value store, at-rest secret encryption, and HTTP/host routing.

```ts
import type { SovraExtension, Migration } from '@sovrasdk/extension-api';

const migrations: Migration[] = [
  { id: '001-init', up: (db) => db.exec(`CREATE TABLE ${db.table('note')} (id TEXT PRIMARY KEY, body TEXT)`) },
];

export function createNotesExtension(): SovraExtension {
  return {
    migrations,
    activate(ctx, router) {
      router.get('/notes', () => ({ status: 200, body: ctx.db.all(`SELECT * FROM ${ctx.db.table('note')}`) }));
    },
    deactivate() {},
  };
}
```

See the [extension guide](https://github.com/wsprfme/sovra/blob/main/docs/extensions.md) for the
full API.

## License

AGPL-3.0-or-later
