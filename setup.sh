#!/usr/bin/env bash
# One-shot, idempotent setup for the mail_justu stack: external network,
# .env files, MySQL reachability, docker compose up (base + optional
# overlays), a wait for health, and an optional first super-admin.
#
# Config for the named volumes (postfix_config, dovecot_config,
# rspamd_config, opendkim_config, clamav_milter_config) is NOT a host
# directory to populate -- there are no host bind mounts (see
# docker-compose.yml's comments). Each image's own entrypoint writes its
# config into its named volume on first boot, driven entirely by the
# .env/*.env files below. So "setting up the volumes" here just means:
# make sure those env files exist and agree with each other, then start
# the containers and let the entrypoints do their thing.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------
WITH_RSPAMD=true
WITH_OPENDKIM=true
WITH_CLAMAV=true
DO_BUILD=true
ASSUME_YES=false
BOOTSTRAP_ADMIN=false
ADMIN_EMAIL=""
ADMIN_PASSWORD=""

usage() {
  cat <<'EOF'
Usage: ./setup.sh [options]

Brings up the full mail_justu stack: shared-global-network, .env files,
a MySQL reachability check, docker compose up (base + overlays), a health
wait, and (optionally) the first super-admin mailbox.

  --minimal            Base stack only (postfix, dovecot, server) -- skip
                        rspamd, opendkim, clamav
  --no-rspamd           Skip the rspamd/redis overlay
  --no-opendkim         Skip the opendkim overlay
  --no-clamav           Skip the clamav overlay
  --no-build            Don't rebuild the server image (skip --build)
  --bootstrap-admin     Create/reset the first super admin after startup
  --admin-email EMAIL   Non-interactive email for --bootstrap-admin
  --admin-password PASS Non-interactive password for --bootstrap-admin
  -y, --yes             Don't prompt for confirmation
  -h, --help             Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --minimal) WITH_RSPAMD=false; WITH_OPENDKIM=false; WITH_CLAMAV=false; shift ;;
    --no-rspamd) WITH_RSPAMD=false; shift ;;
    --no-opendkim) WITH_OPENDKIM=false; shift ;;
    --no-clamav) WITH_CLAMAV=false; shift ;;
    --no-build) DO_BUILD=false; shift ;;
    --bootstrap-admin) BOOTSTRAP_ADMIN=true; shift ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    -y|--yes) ASSUME_YES=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$1" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$1" >&2; exit 1; }

confirm() {
  $ASSUME_YES && return 0
  read -r -p "$1 [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

# ---------------------------------------------------------------------------
# 1. Dependencies
# ---------------------------------------------------------------------------
log "Checking dependencies"
command -v docker >/dev/null 2>&1 || die "docker is required but not found"
docker compose version >/dev/null 2>&1 || die "docker compose (v2 plugin) is required but not found"
echo "docker + docker compose OK"

# ---------------------------------------------------------------------------
# 2. External network (shared with other stacks on this host, e.g. global_mysql)
# ---------------------------------------------------------------------------
log "Checking external network shared-global-network"
if docker network inspect shared-global-network >/dev/null 2>&1; then
  echo "shared-global-network already exists"
else
  warn "shared-global-network not found -- docker-compose.yml requires it to already exist (it's external:true)"
  if confirm "Create it now (docker network create shared-global-network)?"; then
    docker network create shared-global-network
  else
    die "cannot continue without shared-global-network"
  fi
fi

# ---------------------------------------------------------------------------
# 3. .env files -- generate any that are missing, never overwrite existing ones
# ---------------------------------------------------------------------------
log "Checking .env/ files"
mkdir -p .env

rand_hex() { openssl rand -hex 24; }

write_if_missing() {
  local path="$1" content="$2"
  if [[ -f "$path" ]]; then
    echo "$path exists, leaving as-is"
  else
    printf '%s\n' "$content" > "$path"
    echo "generated $path"
  fi
}

if [[ ! -f .env/dovecot.env || ! -f .env/api.env ]]; then
  DOVEADM_PASSWORD="$(rand_hex)"
else
  DOVEADM_PASSWORD="$(grep ^DOVEADM_PASSWORD= .env/dovecot.env | cut -d= -f2)"
fi

write_if_missing .env/postfix.env "$(cat <<EOF
ALLOWED_SENDER_DOMAINS=mail.example.com
MYNETWORKS=127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
POSTFIX_alias_maps=lmdb:/etc/postfix/aliases
POSTFIX_alias_database=lmdb:/etc/postfix/aliases
POSTFIX_milter_default_action=accept
POSTFIX_milter_protocol=6
POSTFIX_smtpd_milters=inet:mail_justu_opendkim:8891,inet:mail_justu_rspamd:11332,inet:mail_justu_clamav_milter:7357
POSTFIX_non_smtpd_milters=inet:mail_justu_opendkim:8891,inet:mail_justu_rspamd:11332,inet:mail_justu_clamav_milter:7357
POSTFIX_virtual_mailbox_domains=mysql:/etc/postfix/mysql-virtual-mailbox-domains.cf
POSTFIX_virtual_mailbox_maps=mysql:/etc/postfix/mysql-virtual-mailbox-maps.cf
POSTFIX_virtual_alias_maps=mysql:/etc/postfix/mysql-virtual-alias-maps.cf
POSTFIX_virtual_transport=lmtp:inet:mail_justu_dovecot:24
EOF
)"

write_if_missing .env/dovecot.env "DOVEADM_PASSWORD=${DOVEADM_PASSWORD}"

write_if_missing .env/rspamd.env "$(cat <<'EOF'
PORT_PROXY=11332
PORT_CONTROLLER=11334
EOF
)"

write_if_missing .env/server.env "$(cat <<'EOF'
ADMIN_TITLE=Postmaster
MAIL_HOST=mail.example.com
EOF
)"

if [[ ! -f .env/api.env ]]; then
  DB_PASSWORD_GEN="$(rand_hex)"
  RSPAMD_CTRL_GEN="$(rand_hex)"
  write_if_missing .env/api.env "$(cat <<EOF
PORT=80
DB_HOST=global_mysql
DB_PORT=3306
DB_USER=mail_justu_user
DB_PASSWORD=${DB_PASSWORD_GEN}
DB_NAME=mail_justu
IMAP_HOST=mail_justu_dovecot
IMAP_PORT=31993
SMTP_HOST=mail_justu_postfix
SMTP_PORT=25
RSPAMD_HOST=mail_justu_rspamd
RSPAMD_PORT=11334
RSPAMD_CONTROLLER_PASSWORD=${RSPAMD_CTRL_GEN}
DOVEADM_HOST=mail_justu_dovecot
DOVEADM_PORT=8080
DOVEADM_PASSWORD=${DOVEADM_PASSWORD}
SUPER_ADMIN_EMAILS=admin@mail.example.com
SESSION_TTL_MINUTES=120
CORS_ORIGIN=http://localhost:4000,http://localhost:4001,http://localhost:4002
MAX_MAILBOXES_PER_DOMAIN=50
MAX_ALIASES_PER_MAILBOX=5
MAX_FOLDERS_PER_MAILBOX=30
MAX_ATTACHMENTS_PER_MESSAGE=10
MAX_ATTACHMENT_SIZE_MB=25
DEFAULT_MAILBOX_QUOTA_MB=1024
MAIL_HOSTNAME=mail.example.com
MAIL_PUBLIC_IP=YOUR_SERVER_PUBLIC_IP
EOF
)"
  warn "generated .env/api.env with a fresh DB_PASSWORD -- the mail_justu_user MySQL account (owned outside this project, see README) must be created/updated to match before the server can connect"
else
  echo ".env/api.env exists, leaving as-is"
  API_DOVEADM_PASSWORD="$(grep ^DOVEADM_PASSWORD= .env/api.env | cut -d= -f2 || true)"
  if [[ -n "$API_DOVEADM_PASSWORD" && "$API_DOVEADM_PASSWORD" != "$DOVEADM_PASSWORD" ]]; then
    die "DOVEADM_PASSWORD mismatch between .env/dovecot.env and .env/api.env -- fix by hand, refusing to guess which is correct"
  fi
fi

# ---------------------------------------------------------------------------
# 4. MySQL reachability (global_mysql is external -- this project doesn't own it)
# ---------------------------------------------------------------------------
log "Checking global_mysql reachability"
DB_USER="$(grep ^DB_USER= .env/api.env | cut -d= -f2)"
DB_PASSWORD="$(grep ^DB_PASSWORD= .env/api.env | cut -d= -f2)"
DB_NAME="$(grep ^DB_NAME= .env/api.env | cut -d= -f2)"
if ! docker inspect global_mysql >/dev/null 2>&1; then
  warn "global_mysql container not found -- it's external to this project (see README). Start/provision it separately before the server will come up healthy."
elif docker exec global_mysql mysql -u "$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" "$DB_NAME" >/dev/null 2>&1; then
  echo "global_mysql reachable, $DB_NAME database + $DB_USER credentials OK"
else
  warn "could not connect to $DB_NAME as $DB_USER on global_mysql -- create the database/user there first (this project doesn't own that instance, see README's 'Mailboxes are real accounts' section). The API creates its own tables on startup once the connection works."
fi

# ---------------------------------------------------------------------------
# 5. Bring the stack up
# ---------------------------------------------------------------------------
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.override.yml)
$WITH_RSPAMD   && COMPOSE_FILES+=(-f docker-compose.rspamd.yml)
$WITH_OPENDKIM && COMPOSE_FILES+=(-f docker-compose.opendkim.yml)
$WITH_CLAMAV   && COMPOSE_FILES+=(-f docker-compose.clamav.yml)

log "Starting: ${COMPOSE_FILES[*]}"
UP_ARGS=(up -d)
$DO_BUILD && UP_ARGS+=(--build)
docker compose "${COMPOSE_FILES[@]}" "${UP_ARGS[@]}"

# ---------------------------------------------------------------------------
# 6. Wait for the core services to report healthy/running
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# 7. Optional: bootstrap the first super admin
# ---------------------------------------------------------------------------
if $BOOTSTRAP_ADMIN; then
  log "Bootstrapping super admin"
  [[ -z "$ADMIN_EMAIL" ]] && read -r -p "Admin email: " ADMIN_EMAIL
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    read -r -s -p "Admin password: " ADMIN_PASSWORD
    echo
  fi
  docker exec mail_justu_server node scripts/bootstrap-admin.js "$ADMIN_EMAIL" "$ADMIN_PASSWORD"

  SUPER_ADMIN_EMAILS="$(grep ^SUPER_ADMIN_EMAILS= .env/api.env | cut -d= -f2)"
  if [[ ",$SUPER_ADMIN_EMAILS," != *",$ADMIN_EMAIL,"* ]]; then
    warn "$ADMIN_EMAIL is not in .env/api.env's SUPER_ADMIN_EMAILS -- it was created as a domain admin only. Add it there and re-run 'docker compose ${COMPOSE_FILES[*]} up -d mail_justu_server' for full super-admin access."
  fi
fi

# ---------------------------------------------------------------------------
# 8. Summary
# ---------------------------------------------------------------------------
log "Done"
cat <<EOF
Webmail / Admin / API:  http://localhost:4001  (/webmail, /admin, /api)
SMTP:                   25, 465, 587
IMAP:                   143, 993
$($WITH_RSPAMD && echo "Rspamd controller:      http://localhost:11334")

Included overlays: base$($WITH_RSPAMD && echo " + rspamd")$($WITH_OPENDKIM && echo " + opendkim")$($WITH_CLAMAV && echo " + clamav")

Next steps (see README.md / .todo.txt for detail):
  - Update placeholder secrets in ./.env/ before any real deployment.
  - MAIL_HOSTNAME / MAIL_PUBLIC_IP in .env/api.env are still placeholders.
  - Replace the self-signed TLS certs in the certs/dovecot_config volumes.
  - If opendkim is included, publish its DNS TXT record once you have a
    real domain (see docker-compose.opendkim.yml's comments).
  - First run: ./setup.sh --bootstrap-admin to create a super admin.
EOF
