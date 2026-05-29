<div align="center">

# Sovra

**Your sovereign cloud.** Self-hosted, modular, and private by design.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Status](https://img.shields.io/badge/status-pre--alpha-orange.svg)](#status)

</div>

---

## What is Sovra?

Sovra is an open-source, self-hosted cloud platform you run on your own server. One platform, your rules: store your files and photos, host static websites on your own domains, and manage your servers, all from a single dashboard you fully control.

Unlike conventional cloud providers, Sovra is built around **data sovereignty**:

- **You own the box.** Sovra runs on your hardware, on your public IP.
- **Private by default.** File contents are encrypted client-side. The server stores ciphertext; only you hold the key.
- **Modular.** A lean core ships with storage built in. Everything else (web hosting, VPS control) is an extension you install only if you need it.

## Core + Extensions

| Layer | Component | Description |
|-------|-----------|-------------|
| **Core** | Storage | Drive-style files & Photos-style albums, with client-side encryption, sharing, and trash |
| **Core** | Platform | Auth (password *or* keypair), extension system, backup/restore, audit log |
| **Extension** | Web Hosting | Static site hosting with per-site custom domains, automatic TLS, and Cloudflare integration |
| **Extension** | VPS Control | Manage your external servers over SSH: status, services, and an interactive console |

> Dynamic app hosting (running Node/SSR processes per site) is planned as a future extension, not part of the initial release.

## Highlights

- **Custom domains, automatic HTTPS.** Point a domain at your server and Sovra issues TLS automatically. Domains behind Cloudflare are supported via the Cloudflare API (auto DNS records + DNS-01 certificates).
- **One-command install.** A single `.sh` installer sets up the platform and a guided first-run wizard handles your admin account and primary domain.
- **Content-addressed storage.** Files are identified by their content hash for integrity and automatic deduplication.
- **Lightweight.** Designed to run comfortably on a modest single server.

## Status

Sovra is in **early design**. The product specification (requirements) is being finalized; architecture and implementation follow. Not ready for production use yet.

## License

Sovra is licensed under the **GNU Affero General Public License v3.0** ([AGPL-3.0](./LICENSE)). If you run a modified version of Sovra as a network service, you must make your modified source available to its users.
