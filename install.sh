#!/usr/bin/env bash
#
# Sovra one-line installer.
#
#   curl -fsSL https://raw.githubusercontent.com/wsprfme/sovra/main/install.sh | bash
#
# This downloads Sovra, installs its dependencies (Node.js, pnpm, Caddy), builds
# the platform, configures systemd services, and prints the URL to finish setup.
#
# Piping a script from the internet into a shell is convenient but asks you to
# trust the source. To review first instead:
#
#   curl -fsSL https://raw.githubusercontent.com/wsprfme/sovra/main/install.sh -o install.sh
#   less install.sh
#   sudo bash install.sh
#
set -euo pipefail

SOVRA_REPO="${SOVRA_REPO:-https://github.com/wsprfme/sovra.git}"
SOVRA_BRANCH="${SOVRA_BRANCH:-main}"
SOVRA_USER="${SOVRA_USER:-sovra}"
SOVRA_HOME="${SOVRA_HOME:-/opt/sovra}"
SOVRA_DATA="${SOVRA_DATA:-/var/lib/sovra}"
NODE_MAJOR="${NODE_MAJOR:-20}"
SOVRA_CORE_PORT="${SOVRA_CORE_PORT:-8787}"
SOVRA_WEB_PORT="${SOVRA_WEB_PORT:-3000}"

log() { printf '\033[1;34m[sovra]\033[0m %s\n' "$1"; }
err() { printf '\033[1;31m[sovra]\033[0m %s\n' "$1" >&2; }

require_root() {
	if [ "$(id -u)" -ne 0 ]; then
		err "This installer must run as root. Re-run with: sudo bash install.sh"
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
		err "Install manually on other distributions (see README)."
		exit 1
	fi
}

detect_ip() {
	local ip
	ip="$(curl -fsS4 https://api.ipify.org 2>/dev/null || true)"
	if [ -z "$ip" ]; then
		ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
	fi
	printf '%s' "$ip"
}

install_prereqs() {
	log "Installing base packages"
	apt-get update -y
	apt-get install -y curl git ca-certificates gnupg xxd
}

install_node() {
	if command -v node >/dev/null 2>&1 && [ "$(node -v | cut -c2- | cut -d. -f1)" -ge "$NODE_MAJOR" ]; then
		log "Node.js $(node -v) already present."
	else
		log "Installing Node.js ${NODE_MAJOR}.x"
		curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
		apt-get install -y nodejs
	fi
	if ! command -v pnpm >/dev/null 2>&1; then
		log "Installing pnpm"
		npm install -g pnpm@9
	fi
}

install_caddy() {
	if command -v caddy >/dev/null 2>&1; then
		log "Caddy already present."
		return
	fi
	log "Installing Caddy"
	apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
		gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
		>/etc/apt/sources.list.d/caddy-stable.list
	apt-get update -y
	apt-get install -y caddy
}

create_user() {
	if ! id "$SOVRA_USER" >/dev/null 2>&1; then
		log "Creating service user '$SOVRA_USER'"
		useradd --system --home "$SOVRA_HOME" --shell /usr/sbin/nologin "$SOVRA_USER"
	fi
	mkdir -p "$SOVRA_HOME" "$SOVRA_DATA"
}

fetch_source() {
	if [ -d "$SOVRA_HOME/.git" ]; then
		log "Updating existing checkout in $SOVRA_HOME"
		git -C "$SOVRA_HOME" fetch --depth 1 origin "$SOVRA_BRANCH"
		git -C "$SOVRA_HOME" reset --hard "origin/$SOVRA_BRANCH"
	else
		log "Cloning $SOVRA_REPO ($SOVRA_BRANCH) into $SOVRA_HOME"
		rm -rf "$SOVRA_HOME"
		git clone --depth 1 --branch "$SOVRA_BRANCH" "$SOVRA_REPO" "$SOVRA_HOME"
	fi
	chown -R "$SOVRA_USER:$SOVRA_USER" "$SOVRA_HOME" "$SOVRA_DATA"
}

build_platform() {
	log "Installing dependencies and building (this can take a few minutes)"
	sudo -u "$SOVRA_USER" bash -lc "cd '$SOVRA_HOME' && pnpm install --frozen-lockfile && pnpm build"
}

generate_env() {
	local env_file="$SOVRA_HOME/.env"
	if [ -f "$env_file" ]; then
		log "Environment file already exists, keeping it."
		return
	fi
	log "Generating environment with a fresh internal token"
	local token ip
	token="$(head -c 32 /dev/urandom | xxd -p -c 64)"
	ip="$(detect_ip)"
	cat >"$env_file" <<EOF
SOVRA_DB_PATH=$SOVRA_DATA/sovra.db
SOVRA_CONTENT_DIR=$SOVRA_DATA/content-store
SOVRA_INTERNAL_TOKEN=$token
SOVRA_CORE_HOST=127.0.0.1
SOVRA_CORE_PORT=$SOVRA_CORE_PORT
SOVRA_CORE_URL=http://127.0.0.1:$SOVRA_CORE_PORT
SOVRA_CORE_UPSTREAM=http://127.0.0.1:$SOVRA_CORE_PORT
SOVRA_CADDY_ADMIN_URL=http://127.0.0.1:2019
SOVRA_SERVER_IP=$ip
SOVRA_PRIMARY_DOMAIN=
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
ExecStart=/usr/bin/npx next start -p $SOVRA_WEB_PORT
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

	install -d -o "$SOVRA_USER" -g "$SOVRA_USER" /etc/caddy
	cp "$SOVRA_HOME/installer/Caddyfile" /etc/caddy/Caddyfile
	systemctl daemon-reload
	systemctl enable --now sovra-core.service sovra-web.service caddy
}

print_access() {
	local ip
	ip="$(detect_ip)"
	printf '\n'
	log "Sovra is installed and running."
	log "Open the dashboard to create your admin account:"
	printf '\n    \033[1;32mhttp://%s\033[0m\n\n' "${ip:-your-server-ip}"
	log "You are on plain HTTP until you set a primary domain in the dashboard."
	log "Logs:    journalctl -u sovra-core -u sovra-web -f"
	log "Config:  $SOVRA_HOME/.env"
}

main() {
	require_root
	detect_os
	log "Installing Sovra into $SOVRA_HOME (data in $SOVRA_DATA)"
	install_prereqs
	install_node
	install_caddy
	create_user
	fetch_source
	build_platform
	generate_env
	install_services
	print_access
}

main "$@"
