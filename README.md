<div align="center">

# Sovra

**Your sovereign cloud.** Self-hosted, modular, and private by design.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)](#status)

</div>

---

## What is Sovra?

Sovra is an open-source, self-hosted cloud platform you run on your own server. One platform, your rules: store your files and photos, host static websites on your own domains, and manage your servers, all from a single dashboard you fully control.

Unlike conventional cloud providers, Sovra is built around **data sovereignty**:

- **You own the box.** Sovra runs on your hardware, on your public IP.
- **Private by default.** File contents are encrypted in the browser before upload. The server stores ciphertext; only you hold the key.
- **Modular.** A lean core ships with storage built in. Everything else (web hosting, VPS control) is an extension you enable only if you need it.

## Architecture

Sovra is a TypeScript monorepo with three layers:

```
Browser ──► Caddy (reverse proxy, automatic HTTPS)
                │
                ├──► Web dashboard (Next.js, BFF)  ──┐
                │                                     │ internal API (localhost only)
                └──► Core engine (Fastify)  ◄─────────┘
                         │
                         ├── SQLite (metadata)
                         ├── Content store (BLAKE3, deduplicated)
                         └── Extension host (web-hosting, vps)
```

- **Core engine** (`apps/core`) — Fastify service bound to localhost. Owns identity, storage, the content store, the extension host, audit log, backups, and the proxy controller.
- **Web dashboard** (`apps/web`) — Next.js App Router. Server Components fetch data server-side (clean network tab, instant render); private file contents are decrypted in the browser. The internal core API is never exposed publicly.
- **Extensions** (`extensions/*`) — `web-hosting` (static sites, custom domains, Cloudflare) and `vps` (SSH control). Each declares explicit permissions and is sandboxed so a failure can't take down the core.

| Package | Responsibility |
|---------|----------------|
| `@sovra/contracts` | Shared zod schemas, types, and the canonical error model |
| `@sovra/cid` | BLAKE3 content addressing and integrity verification |
| `@sovra/crypto` | Argon2id KDF + AES-256-GCM convergent encryption |
| `@sovra/site-manifest` | Parser/printer for site manifests (round-trip guaranteed) |
| `@sovra/extension-api` | The SDK extensions implement |

## Highlights

- **Custom domains, automatic HTTPS.** Caddy on-demand TLS issues certificates per domain, gated by the core so only verified domains get certs. Cloudflare-fronted domains are supported via the Cloudflare API (auto DNS records + DNS-01 certificates).
- **Client-side encryption.** Private files and photos are encrypted in the browser with a key derived from your password. Convergent encryption keeps deduplication working without the server ever seeing your key.
- **One-command install.** `installer/install.sh` provisions Node, Caddy, and systemd services. A guided first-run wizard handles your admin account and primary domain.
- **Lightweight.** Single Fastify process + embedded SQLite. Designed to run comfortably on a modest single server.

## Quick start (development)

Requires Node 20+ and pnpm 9+.

```bash
pnpm install
cp .env.example .env        # set a long random SOVRA_INTERNAL_TOKEN
pnpm build
pnpm test                   # run the full test suite

# run the core engine and dashboard in separate terminals:
node apps/core/dist/server.js
pnpm --filter @sovra/web start
```

Open the dashboard and complete the first-run setup wizard (create your admin account, choose an auth mode, set your primary domain).

## Production install

On Ubuntu/Debian, review then run the installer as root:

```bash
sha256sum installer/install.sh   # verify against the published checksum
sudo SOVRA_HOME=/opt/sovra bash installer/install.sh
```

This installs Node, Caddy (with the Cloudflare DNS plugin), builds the platform, and enables the `sovra-core`, `sovra-web`, and `caddy` services.

## Status

Sovra is in **alpha**. The MVP is feature-complete (storage, photos, sharing, encryption, web hosting + custom domains + Cloudflare, VPS control, backups, audit log, rate limiting) and covered by tests. It has not yet had a security audit; run it at your own risk.

## Documentation

- [Contributing](./CONTRIBUTING.md)
- [Writing extensions](./docs/extensions.md)

## License

Sovra is licensed under the **GNU Affero General Public License v3.0** ([AGPL-3.0](./LICENSE)). If you run a modified version of Sovra as a network service, you must make your modified source available to its users.
