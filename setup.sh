#!/usr/bin/env bash
# Brings up the mail_justu stack. Each check lives in its own
# ./setup/<service>-setup.sh (also runnable standalone) -- they only
# verify .env/*.env files exist, they never write one. Missing a file?
# Add it, then re-run.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

MODE=dev
WITH_RSPAMD=true
WITH_OPENDKIM=true
WITH_CLAMAV=true
DO_BUILD=false
ASSUME_YES=false
BOOTSTRAP_ADMIN=false

usage() {
  cat <<'EOF'
Usage: ./setup.sh [options]

  --dev                  (default) Include docker-compose.override.yml --
                          dev-only bind mounts under ./volumes, builds
                          mail_justu_server from ./bigapp (add --build to
                          actually rebuild it), publishes :4001
  --prod                  Skip the override -- pulls the published
                          mail_justu_server image, no host bind mounts
  --build                 Rebuild the server image (default: use whatever
                          image already exists/is pulled)
  --minimal              Base stack only -- skip rspamd, opendkim, clamav
  --no-rspamd             Skip the rspamd/redis overlay
  --no-opendkim           Skip the opendkim overlay
  --no-clamav             Skip the clamav overlay
  --bootstrap-admin       Create/reset the super admin after startup,
                          using SUPER_ADMIN_EMAILS / SUPER_ADMIN_PASSWORD
                          from .env/api.env
  -y, --yes               Don't prompt for confirmation
  -h, --help              Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev) MODE=dev; shift ;;
    --prod) MODE=prod; shift ;;
    --build) DO_BUILD=true; shift ;;
    --minimal) WITH_RSPAMD=false; WITH_OPENDKIM=false; WITH_CLAMAV=false; shift ;;
    --no-rspamd) WITH_RSPAMD=false; shift ;;
    --no-opendkim) WITH_OPENDKIM=false; shift ;;
    --no-clamav) WITH_CLAMAV=false; shift ;;
    --bootstrap-admin) BOOTSTRAP_ADMIN=true; shift ;;
    -y|--yes) ASSUME_YES=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

for f in ./setup/*.sh; do source "$f"; done

log "Checking dependencies"
command -v docker >/dev/null 2>&1 || die "docker is required but not found"
docker compose version >/dev/null 2>&1 || die "docker compose (v2 plugin) is required but not found"
echo "docker + docker compose OK"

setup_network

log "Checking .env/ files"
setup_postfix
setup_dovecot
setup_rspamd
setup_server_env

confirm "Have you personalized .env/*.env for this server (domain, hostname, admin, secrets)?" || die "edit .env/*.env for this deployment, then re-run ./setup.sh"

setup_server_mysql

# --env-file makes docker-compose.yml's ${MAIL_HOSTNAME} etc. resolve --
# there's no root .env file for compose to find automatically (.env/ is a
# directory of per-service files), so this must be explicit everywhere
# compose is invoked, not just here.
COMPOSE_FILES=(--env-file .env/api.env -f docker-compose.yml)
[[ "$MODE" == dev ]] && COMPOSE_FILES+=(-f docker-compose.override.yml)
$WITH_RSPAMD   && COMPOSE_FILES+=(-f docker-compose.rspamd.yml)
$WITH_OPENDKIM && COMPOSE_FILES+=(-f docker-compose.opendkim.yml)
$WITH_CLAMAV   && COMPOSE_FILES+=(-f docker-compose.clamav.yml)

log "Starting: ${COMPOSE_FILES[*]}"
UP_ARGS=(up -d)
$DO_BUILD && UP_ARGS+=(--build)
docker compose "${COMPOSE_FILES[@]}" "${UP_ARGS[@]}"

# Must run after `up -d` -- see provision_dovecot_auth() in
# setup/dovecot-setup.sh for why the ordering matters (it needs the
# dovecot_config volume to already have the image's own default files
# seeded into it, which only happens on mail_justu_dovecot's own first
# boot against an empty volume).
provision_dovecot_auth

log "Waiting for services to come up"
deadline=$((SECONDS + 90))
while (( SECONDS < deadline )); do
  status="$(docker compose "${COMPOSE_FILES[@]}" ps --format '{{.Name}}: {{.State}} ({{.Health}})' 2>/dev/null || true)"
  if ! grep -qE 'starting|unhealthy' <<<"$status"; then
    break
  fi
  sleep 3
done
docker compose "${COMPOSE_FILES[@]}" ps

if $BOOTSTRAP_ADMIN; then
  log "Bootstrapping super admin"
  ADMIN_EMAIL="$(env_value .env/api.env SUPER_ADMIN_EMAILS)"
  ADMIN_PASSWORD="$(env_value .env/api.env SUPER_ADMIN_PASSWORD)"
  docker exec mail_justu_server node scripts/bootstrap-admin.js "$ADMIN_EMAIL" "$ADMIN_PASSWORD"
fi

log "Done"
cat <<EOF
Mode:                   $MODE
$([[ "$MODE" == dev ]] && echo "Webmail / Admin / API:  http://localhost:4001  (/webmail, /admin, /api)" || echo "Webmail / Admin / API:  mail_justu_server:80 (internal only -- put a reverse proxy in front)")
SMTP:                   25, 465, 587
IMAP:                   143, 993
$($WITH_RSPAMD && echo "Rspamd controller:      http://localhost:11334")

Included overlays: base$($WITH_RSPAMD && echo " + rspamd")$($WITH_OPENDKIM && echo " + opendkim")$($WITH_CLAMAV && echo " + clamav")
EOF
