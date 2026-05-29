#!/usr/bin/env bash
#
# Sovra uninstaller. Removes Sovra only — Node.js, pnpm, and Caddy are left
# installed (they are general-purpose and may be used by other software).
#
#   curl -fsSL https://raw.githubusercontent.com/wsprfme/sovra/main/uninstall.sh | bash
#
# By default your data in /var/lib/sovra is KEPT. To also delete it:
#
#   sudo bash uninstall.sh --purge
#
# Pass --yes to skip the confirmation prompt.
#
set -euo pipefail

SOVRA_USER="${SOVRA_USER:-sovra}"
SOVRA_HOME="${SOVRA_HOME:-/opt/sovra}"
SOVRA_DATA="${SOVRA_DATA:-/var/lib/sovra}"
LOG_FILE="${SOVRA_LOG:-/var/log/sovra-install.log}"

PURGE=0
ASSUME_YES=0
for arg in "$@"; do
	case "$arg" in
	--purge) PURGE=1 ;;
	--yes | -y) ASSUME_YES=1 ;;
	esac
done

C_BLUE='\033[1;34m'
C_GREEN='\033[1;32m'
C_RED='\033[1;31m'
C_DIM='\033[2m'
C_OFF='\033[0m'

step() { printf '%b▸%b %s\n' "$C_BLUE" "$C_OFF" "$1"; }
ok() { printf '  %b✓%b %s\n' "$C_GREEN" "$C_OFF" "$1"; }
err() { printf '%b✗%b %s\n' "$C_RED" "$C_OFF" "$1" >&2; }

require_root() {
	if [ "$(id -u)" -ne 0 ]; then
		err "This uninstaller must run as root. Re-run with: sudo bash uninstall.sh"
		exit 1
	fi
}

stop_services() {
	for svc in sovra-web sovra-core; do
		if systemctl list-unit-files "${svc}.service" >/dev/null 2>&1; then
			systemctl disable --now "${svc}.service" >/dev/null 2>&1 || true
			rm -f "/etc/systemd/system/${svc}.service"
			ok "Removed ${svc} service"
		fi
	done
	systemctl daemon-reload || true
}

restore_caddy() {
	if [ -f /etc/caddy/Caddyfile ] && grep -q '127.0.0.1:2019' /etc/caddy/Caddyfile 2>/dev/null; then
		cat >/etc/caddy/Caddyfile <<'EOF'
:80 {
	respond "Caddy is running. Sovra has been uninstalled."
}
EOF
		systemctl restart caddy >/dev/null 2>&1 || true
		ok "Reset Caddy to a default config (Caddy left installed)"
	fi
}

remove_files() {
	rm -rf "$SOVRA_HOME"
	ok "Removed $SOVRA_HOME"
	rm -f "$LOG_FILE"

	if [ "$PURGE" = "1" ]; then
		rm -rf "$SOVRA_DATA"
		ok "Purged data in $SOVRA_DATA"
	else
		printf '  %bKept your data in %s (use --purge to delete it).%b\n' "$C_DIM" "$SOVRA_DATA" "$C_OFF"
	fi

	if id "$SOVRA_USER" >/dev/null 2>&1; then
		userdel "$SOVRA_USER" >/dev/null 2>&1 || true
		ok "Removed service user '$SOVRA_USER'"
	fi
}

confirm() {
	[ "$ASSUME_YES" = "1" ] && return 0
	[ ! -t 0 ] && return 0
	local msg="This removes Sovra services and $SOVRA_HOME."
	[ "$PURGE" = "1" ] && msg="$msg It also DELETES your data in $SOVRA_DATA."
	printf '%b%s%b\n' "$C_RED" "$msg" "$C_OFF"
	printf 'Continue? [y/N] '
	read -r reply
	case "$reply" in
	y | Y | yes | YES) return 0 ;;
	*)
		err "Aborted."
		exit 1
		;;
	esac
}

main() {
	require_root
	step "Uninstalling Sovra"
	confirm
	stop_services
	restore_caddy
	remove_files
	printf '\n'
	ok "Sovra has been uninstalled. Node.js, pnpm, and Caddy were left in place."
}

main "$@"
