#!/usr/bin/env bash
#
# Sovra one-line installer.
#
#   curl -fsSL https://raw.githubusercontent.com/wsprfme/sovra/main/install.sh | bash
#
# Downloads Sovra, installs its dependencies (Node.js, pnpm, Caddy), builds the
# platform, configures systemd services, and prints the URL to finish setup.
#
# Piping a script from the internet into a shell asks you to trust the source.
# To review first instead:
#
#   curl -fsSL https://raw.githubusercontent.com/wsprfme/sovra/main/install.sh -o install.sh
#   less install.sh
#   sudo bash install.sh
#
# Verbose flag: pass --verbose (or SOVRA_VERBOSE=1) to stream all output.
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
SOVRA_VERBOSE="${SOVRA_VERBOSE:-0}"
LOG_FILE="${SOVRA_LOG:-/var/log/sovra-install.log}"

C_BLUE='\033[1;34m'
C_GREEN='\033[1;32m'
C_RED='\033[1;31m'
C_DIM='\033[2m'
C_OFF='\033[0m'

for arg in "$@"; do
	case "$arg" in
	--verbose | -v) SOVRA_VERBOSE=1 ;;
	esac
done

banner() {
	printf '%b' "$C_BLUE"
	cat <<'ART'

   ███████╗ ██████╗ ██╗   ██╗██████╗  █████╗
   ██╔════╝██╔═══██╗██║   ██║██╔══██╗██╔══██╗
   ███████╗██║   ██║██║   ██║██████╔╝███████║
   ╚════██║██║   ██║╚██╗ ██╔╝██╔══██╗██╔══██║
   ███████║╚██████╔╝ ╚████╔╝ ██║  ██║██║  ██║
   ╚══════╝ ╚═════╝   ╚═══╝  ╚═╝  ╚═╝╚═╝  ╚═╝
ART
	printf '%b' "$C_OFF"
	printf '   %bYour sovereign platform.%b\n\n' "$C_DIM" "$C_OFF"
}

step() { printf '%b▸%b %s\n' "$C_BLUE" "$C_OFF" "$1"; }
ok() { printf '  %b✓%b %s\n' "$C_GREEN" "$C_OFF" "$1"; }
err() { printf '%b✗%b %s\n' "$C_RED" "$C_OFF" "$1" >&2; }

run() {
	local desc="$1"
	shift
	if [ "$SOVRA_VERBOSE" = "1" ]; then
		step "$desc"
		"$@"
		return
	fi
	printf '  %b…%b %s' "$C_DIM" "$C_OFF" "$desc"
	if "$@" >>"$LOG_FILE" 2>&1; then
		printf '\r  %b✓%b %s\033[K\n' "$C_GREEN" "$C_OFF" "$desc"
	else
		printf '\r  %b✗%b %s\033[K\n' "$C_RED" "$C_OFF" "$desc"
		err "Step failed. Last lines of $LOG_FILE:"
		tail -n 25 "$LOG_FILE" >&2 || true
		exit 1
	fi
}

runc() { run "$1" bash -c "$2"; }

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

install_node() {
	if command -v node >/dev/null 2>&1 && [ "$(node -v | cut -c2- | cut -d. -f1)" -ge "$NODE_MAJOR" ]; then
		ok "Node.js $(node -v) already present"
	else
		runc "Installing Node.js ${NODE_MAJOR}.x" \
			"curl -fsSL 'https://deb.nodesource.com/setup_${NODE_MAJOR}.x' | bash - && apt-get install -y nodejs"
	fi
	if command -v pnpm >/dev/null 2>&1; then
		ok "pnpm $(pnpm -v) already present"
	else
		run "Installing pnpm" npm install -g pnpm@9
	fi
}

install_caddy() {
	if command -v caddy >/dev/null 2>&1; then
		ok "Caddy already present"
		return
	fi
	runc "Installing Caddy" "
		apt-get install -y debian-keyring debian-archive-keyring apt-transport-https &&
		curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg &&
		curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list &&
		apt-get update -y &&
		apt-get install -y caddy"
}

create_user() {
	if ! id "$SOVRA_USER" >/dev/null 2>&1; then
		useradd --system --home "$SOVRA_HOME" --shell /usr/sbin/nologin "$SOVRA_USER"
	fi
	mkdir -p "$SOVRA_HOME" "$SOVRA_DATA"
}

fetch_source() {
	if [ -d "$SOVRA_HOME/.git" ]; then
		runc "Updating source in $SOVRA_HOME" \
			"git -C '$SOVRA_HOME' fetch --depth 1 origin '$SOVRA_BRANCH' && git -C '$SOVRA_HOME' reset --hard 'origin/$SOVRA_BRANCH'"
	else
		runc "Cloning $SOVRA_REPO" \
			"rm -rf '$SOVRA_HOME' && git clone --depth 1 --branch '$SOVRA_BRANCH' '$SOVRA_REPO' '$SOVRA_HOME'"
	fi
	chown -R "$SOVRA_USER:$SOVRA_USER" "$SOVRA_HOME" "$SOVRA_DATA"
}

build_platform() {
	run "Installing dependencies and building (a few minutes)" \
		sudo -u "$SOVRA_USER" bash -lc "cd '$SOVRA_HOME' && pnpm install --frozen-lockfile && pnpm build"
}

generate_env() {
	local env_file="$SOVRA_HOME/.env"
	if [ -f "$env_file" ]; then
		ok "Keeping existing environment file"
		return
	fi
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
	ok "Generated $env_file with a fresh internal token"
}

write_caddyfile() {
	install -d -o "$SOVRA_USER" -g "$SOVRA_USER" /etc/caddy
	cat >/etc/caddy/Caddyfile <<EOF
{
	admin 127.0.0.1:2019
	on_demand_tls {
		ask http://127.0.0.1:$SOVRA_CORE_PORT/_tls/authorize
	}
}

:80 {
	reverse_proxy 127.0.0.1:$SOVRA_WEB_PORT
}

https:// {
	tls {
		on_demand
	}
	reverse_proxy 127.0.0.1:$SOVRA_WEB_PORT
}
EOF
}

install_services() {
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

	write_caddyfile
	run "Configuring services" systemctl daemon-reload
	run "Starting Sovra core" bash -c "systemctl enable --now sovra-core.service && systemctl restart sovra-core.service"
	run "Starting Sovra dashboard" bash -c "systemctl enable --now sovra-web.service && systemctl restart sovra-web.service"
	run "Reloading Caddy" bash -c "systemctl enable caddy && systemctl restart caddy"
}

print_access() {
	local ip
	ip="$(detect_ip)"
	printf '\n'
	ok "Sovra is installed and running."
	printf '\n   Open the dashboard to create your admin account:\n'
	printf '\n      %bhttp://%s%b\n\n' "$C_GREEN" "${ip:-your-server-ip}" "$C_OFF"
	printf '   %bYou are on plain HTTP until you set a primary domain.%b\n' "$C_DIM" "$C_OFF"
	printf '   %bLogs:%b      journalctl -u sovra-core -u sovra-web -f\n' "$C_DIM" "$C_OFF"
	printf '   %bConfig:%b    %s/.env\n' "$C_DIM" "$C_OFF" "$SOVRA_HOME"
	printf '   %bUninstall:%b curl -fsSL https://raw.githubusercontent.com/wsprfme/sovra/main/uninstall.sh | bash\n\n' "$C_DIM" "$C_OFF"
}

main() {
	require_root
	detect_os
	: >"$LOG_FILE" || LOG_FILE="$(mktemp)"
	banner
	step "Installing Sovra into $SOVRA_HOME (data in $SOVRA_DATA)"
	run "Updating package lists" apt-get update -y
	run "Installing base packages" apt-get install -y curl git ca-certificates gnupg xxd
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
