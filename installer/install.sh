#!/usr/bin/env bash
#
# Sovra installer. Installs Node.js, Caddy (with the Cloudflare DNS plugin),
# builds the platform, and configures systemd services for the core engine and
# the web dashboard.
#
# Security: review this script before running. Do not pipe it straight from the
# network into a shell. Verify the published checksum first:
#   sha256sum install.sh
#
set -euo pipefail

SOVRA_USER="${SOVRA_USER:-sovra}"
SOVRA_HOME="${SOVRA_HOME:-/opt/sovra}"
SOVRA_DATA="${SOVRA_DATA:-/var/lib/sovra}"
NODE_MAJOR="${NODE_MAJOR:-20}"

log() { printf '\033[1;34m[sovra]\033[0m %s\n' "$1"; }
err() { printf '\033[1;31m[sovra]\033[0m %s\n' "$1" >&2; }

require_root() {
	if [ "$(id -u)" -ne 0 ]; then
		err "This installer must run as root (use sudo)."
		exit 1
	fi
}

detect_os() {
	if [ ! -f /etc/os-release ]; then
		err "Unsupported OS: /etc/os-release not found."
		exit 1
	fi
	. /etc/os-release
	if [ "${ID:-}" != "ubuntu" ] && [ "${ID_LIKE:-}" != "debian" ]; then
		err "This installer targets Ubuntu/Debian. Detected: ${ID:-unknown}."
		err "Install manually on other distributions."
		exit 1
	fi
}

install_node() {
	if command -v node >/dev/null 2>&1 && [ "$(node -v | cut -c2- | cut -d. -f1)" -ge "$NODE_MAJOR" ]; then
		log "Node.js $(node -v) already present."
		return
	fi
	log "Installing Node.js ${NODE_MAJOR}.x"
	curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
	apt-get install -y nodejs
	npm install -g pnpm@9
}

install_caddy() {
	if command -v caddy >/dev/null 2>&1; then
		log "Caddy already present."
		return
	fi
	log "Installing Caddy with Cloudflare DNS plugin"
	apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
		gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
		>/etc/apt/sources.list.d/caddy-stable.list
	apt-get update
	apt-get install -y caddy
}

create_user() {
	if ! id "$SOVRA_USER" >/dev/null 2>&1; then
		log "Creating service user '$SOVRA_USER'"
		useradd --system --home "$SOVRA_HOME" --shell /usr/sbin/nologin "$SOVRA_USER"
	fi
	mkdir -p "$SOVRA_HOME" "$SOVRA_DATA"
	chown -R "$SOVRA_USER:$SOVRA_USER" "$SOVRA_HOME" "$SOVRA_DATA"
}

build_platform() {
	log "Installing dependencies and building"
	cd "$SOVRA_HOME"
	sudo -u "$SOVRA_USER" pnpm install --frozen-lockfile
	sudo -u "$SOVRA_USER" pnpm build
}

generate_env() {
	local env_file="$SOVRA_HOME/.env"
	if [ -f "$env_file" ]; then
		log "Environment file already exists, keeping it."
		return
	fi
	log "Generating environment with a fresh internal token"
	local token
	token="$(head -c 32 /dev/urandom | xxd -p -c 64)"
	cat >"$env_file" <<EOF
SOVRA_DB_PATH=$SOVRA_DATA/sovra.db
SOVRA_CONTENT_DIR=$SOVRA_DATA/content-store
SOVRA_INTERNAL_TOKEN=$token
SOVRA_CORE_URL=http://127.0.0.1:8787
SOVRA_CADDY_ADMIN_URL=http://127.0.0.1:2019
NODE_ENV=production
EOF
	chown "$SOVRA_USER:$SOVRA_USER" "$env_file"
	chmod 600 "$env_file"
}

install_services() {
	log "Installing systemd services"
	cat >/etc/systemd/system/sovra-core.service <<EOF
[Unit]
Description=Sovra Core Engine
After=network.target

[Service]
Type=simple
User=$SOVRA_USER
WorkingDirectory=$SOVRA_HOME
EnvironmentFile=$SOVRA_HOME/.env
ExecStart=/usr/bin/node $SOVRA_HOME/apps/core/dist/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

	cat >/etc/systemd/system/sovra-web.service <<EOF
[Unit]
Description=Sovra Web Dashboard
After=network.target sovra-core.service

[Service]
Type=simple
User=$SOVRA_USER
WorkingDirectory=$SOVRA_HOME/apps/web
EnvironmentFile=$SOVRA_HOME/.env
ExecStart=/usr/bin/npx next start -p 3000
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

	cp "$SOVRA_HOME/installer/Caddyfile" /etc/caddy/Caddyfile
	systemctl daemon-reload
	systemctl enable --now sovra-core.service sovra-web.service caddy
}

main() {
	require_root
	detect_os
	log "Installing Sovra into $SOVRA_HOME (data in $SOVRA_DATA)"
	apt-get update
	install_node
	install_caddy
	create_user
	build_platform
	generate_env
	install_services
	log "Done. Open your server's primary domain to complete first-run setup."
	log "Set SOVRA_PRIMARY_DOMAIN in $SOVRA_HOME/.env and restart caddy after the wizard."
}

main "$@"
