# Contributing to Sovra

Thanks for your interest in improving Sovra. This document covers the development workflow and conventions.

## Setup

```bash
pnpm install
pnpm build
pnpm typecheck
```

The repo is a pnpm + Turborepo monorepo:

- `apps/core` — Fastify kernel (identity, content store, extension host, proxy, audit, backups)
- `apps/web` — Next.js dashboard (BFF)
- `packages/*` — shared libraries, including `@sovra/extension-api` (the extension SDK)
- `extensions/*` — first-party extensions (`storage`, `web-hosting`, `vps`)

The kernel ships with no active features. Capabilities live in extensions, which depend only on
the SDK and own their own prefixed database tables.

## Conventions

- **TypeScript everywhere**, strict mode. No `any` unless unavoidable and justified.
- **No comments in source.** Code should be self-explanatory through naming and structure.
- **No stubs or placeholders.** Land complete, working features.
- **Errors** use the `SovraError` class with a canonical code from `@sovra/contracts`. Never throw bare strings across module boundaries.
- **Validation** uses zod schemas defined in `@sovra/contracts` as the single source of truth.
- **Security**: secrets (passwords, tokens, SSH credentials, content keys) are never stored or logged in plaintext. Client-side encryption keys never reach the server. Extensions only receive a capability if the matching permission was approved by the user.

## Extensions

New capabilities should be extensions, not kernel changes. See [docs/extensions.md](./docs/extensions.md).
Add a kernel feature only when it is a shared primitive every extension needs (e.g. the content
store or the scoped database).

## Before opening a PR

```bash
pnpm typecheck
pnpm build
```

Push to a feature branch (never directly to `main`) and open a pull request describing the change
and what you tested.

## License

By contributing, you agree that your contributions are licensed under AGPL-3.0.
