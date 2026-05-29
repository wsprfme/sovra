# Contributing to Sovra

Thanks for your interest in improving Sovra. This document covers the development workflow and conventions.

## Setup

```bash
pnpm install
pnpm build
pnpm test
```

The repo is a pnpm + Turborepo monorepo:

- `apps/core` — Fastify core engine
- `apps/web` — Next.js dashboard
- `packages/*` — shared libraries
- `extensions/*` — first-party extensions

## Conventions

- **TypeScript everywhere**, strict mode. No `any` unless unavoidable and justified.
- **No comments in source.** Code should be self-explanatory through naming and structure. Tests document behavior.
- **Errors** use the `SovraError` class with a canonical code from `@sovra/contracts`. Never throw bare strings across module boundaries.
- **Validation** uses zod schemas defined in `@sovra/contracts` as the single source of truth.
- **Security**: secrets (passwords, tokens, SSH credentials, content keys) are never stored or logged in plaintext. Client-side encryption keys never reach the server.

## Tests

- Every feature ships with tests in the same package.
- Invariants are covered by property-based tests (`fast-check`): content addressing, encryption round-trips, manifest round-trips, album idempotency, permission gating, and domain authorization.
- Run a single package: `pnpm --filter @sovra/core test`.
- Test files (`*.test.ts`) are kept local and are not published to the repository.

## Before opening a PR

```bash
pnpm typecheck
pnpm build
pnpm test
```

Push to a feature branch (never directly to `main`) and open a pull request describing the change and what you tested.

## License

By contributing, you agree that your contributions are licensed under AGPL-3.0.
