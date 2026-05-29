<div align="center">

# Sovra

**Your sovereign platform.** A self-hosted app platform you fully own — a lean kernel plus an ecosystem of extensions.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)](#status)

</div>

---

## What is Sovra?

Sovra is WordPress for self-hosting. You run a small, private **kernel** on your own server, then
install **extensions** to give it capabilities: a private drive, photo galleries, static web
hosting on your own domains, remote server control — or anything the community builds.

A fresh install is a bare kernel. Nothing runs until you choose it. You decide what your platform
does.

Sovra is built around **data sovereignty**:

- **You own the box.** Sovra runs on your hardware, on your public IP.
- **Private by default.** File contents are encrypted in the browser before upload. The server
  stores ciphertext; only you hold the key.
- **Modular and transparent.** Every extension declares the permissions it needs. You approve them
  before it runs, and you can disable or remove it anytime.

## Install

One line on a fresh Ubuntu/Debian server:

```bash
curl -fsSL https://raw.githubusercontent.com/wsprfme/sovra/main/install.sh | bash
```

This downloads Sovra, installs Node.js, pnpm, and Caddy, builds the platform, sets up systemd
services, and prints the URL to finish setup. Open it and create your admin account.

Prefer to review before running? That's the safer choice:

```bash
curl -fsSL https://raw.githubusercontent.com/wsprfme/sovra/main/install.sh -o install.sh
less install.sh
sudo bash install.sh
```

The first-run wizard is reached over plain HTTP on your server's IP. Once you set a primary domain
in the dashboard, Sovra moves onto automatic HTTPS.

## Architecture

Sovra is a TypeScript monorepo.

```
Browser ──► Caddy (reverse proxy, automatic HTTPS)
                │
                ├──► Web dashboard (Next.js, BFF)  ──┐
                │                                     │ internal API (localhost only)
                └──► Kernel (Fastify)  ◄──────────────┘
                         │
                         ├── SQLite (kernel + scoped extension tables)
                         ├── Content store (BLAKE3, deduplicated blobs)
                         └── Extension host (install · enable · permissions · migrations)
                                  │
                                  ├── storage      (drive, photos, sharing)
                                  ├── web-hosting  (static sites, domains, TLS)
                                  └── vps          (SSH control)
```

- **Kernel** (`apps/core`) — Fastify service bound to localhost. Owns identity, the content store,
  the extension host (scoped DB + migrations + permissions + capabilities), proxy controller,
  audit log, and backups. It ships with **no** active features.
- **Web dashboard** (`apps/web`) — Next.js App Router BFF. The sidebar is built dynamically from
  the extensions you have enabled. The internal kernel API is never exposed publicly.
- **Extensions** (`extensions/*`) — first-party `storage`, `web-hosting`, and `vps`. Each depends
  only on the SDK, owns its own prefixed tables, and is sandboxed so a failure can't take down the
  kernel.

| Package | Responsibility |
|---------|----------------|
| `@sovra/contracts` | Shared zod schemas, types, and the canonical error model |
| `@sovra/cid` | BLAKE3 content addressing and integrity verification |
| `@sovra/crypto` | Argon2id KDF + AES-256-GCM convergent encryption |
| `@sovra/site-manifest` | Parser/printer for site manifests (round-trip guaranteed) |
| `@sovra/extension-api` | The SDK extensions implement (DB, migrations, capabilities, routing) |

## For developers

Extensions get a scoped database with a migration runner — declare your schema, the kernel runs
the migrations on enable, and table names are auto-prefixed per extension. You also get the
content store, outbound networking, the proxy, a key/value store, and at-rest secret encryption,
each gated behind a permission the user approves.

See [docs/extensions.md](./docs/extensions.md) to build one.

## Quick start (development)

Requires Node 20+ and pnpm 9+.

```bash
pnpm install
cp .env.example .env        # set a long random SOVRA_INTERNAL_TOKEN
pnpm build

# run the kernel and dashboard in separate terminals:
node apps/core/dist/server.js
pnpm --filter @sovra/web start
```

Open the dashboard, create your admin account, then visit **Extensions** to install and enable the
capabilities you want.

## Status

Sovra is in **alpha**. The kernel and first-party extensions (storage, photos, sharing,
encryption, web hosting with custom domains and Cloudflare, VPS control, backups, audit log, rate
limiting) are functional. It has not had a security audit; run it at your own risk. Third-party
extensions run with the trust you grant them — install what you trust.

## Documentation

- [Contributing](./CONTRIBUTING.md)
- [Writing extensions](./docs/extensions.md)

## License

Sovra is licensed under the **GNU Affero General Public License v3.0** ([AGPL-3.0](./LICENSE)). If
you run a modified version of Sovra as a network service, you must make your modified source
available to its users.
