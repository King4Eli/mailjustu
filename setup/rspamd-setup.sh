#!/usr/bin/env bash
# Checks .env/rspamd.env exists. If rspamd is already running, verifies
# .env/api.env's RSPAMD_CONTROLLER_PASSWORD actually authenticates --
# rspamd's own copy lives in the rspamd_config volume, not read from env
# (see .env/rspamd.env), so the two can only be checked live, not synced.
# On a mismatch (including a brand new rspamd_config volume with no
# worker-controller.inc at all), regenerates that file from the env
# password via `rspamadm pw` and restarts rspamd to pick it up -- this
# only ever writes into the rspamd_config volume, never into .env/api.env,
# so env stays the source of truth. Note this overwrites the whole file,
# so hand-added directives (secure_ip, enable_password, ...) don't survive
# a resync.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ./setup/common.sh

setup_rspamd() {
  require_env .env/rspamd.env
  require_env .env/api.env

  docker inspect -f '{{.State.Running}}' mail-rspamd 2>/dev/null | grep -q true || return 0

  local port password
  port="$(env_value .env/api.env RSPAMD_PORT)"
  password="$(env_value .env/api.env RSPAMD_CONTROLLER_PASSWORD)"

  if curl -sf -o /dev/null -H "Password: ${password}" "http://localhost:${port}/stat"; then
    echo "rspamd controller password OK"
    return 0
  fi

  log "RSPAMD_CONTROLLER_PASSWORD doesn't authenticate -- regenerating worker-controller.inc from .env/api.env"
  local hash
  hash="$(docker exec mail-rspamd rspamadm pw -p "$password")"
  docker exec -u root -i mail-rspamd sh -c 'cat > /etc/rspamd/local.d/worker-controller.inc' <<EOF
password = "${hash}";
EOF
  docker restart mail-rspamd >/dev/null

  local deadline=$((SECONDS + 30))
  while (( SECONDS < deadline )); do
    curl -sf -o /dev/null -H "Password: ${password}" "http://localhost:${port}/stat" && break
    sleep 2
  done

  if curl -sf -o /dev/null -H "Password: ${password}" "http://localhost:${port}/stat"; then
    echo "rspamd controller password synced OK"
  else
    warn "still couldn't authenticate against rspamd after regenerating worker-controller.inc -- check docker exec mail-rspamd cat /etc/rspamd/local.d/worker-controller.inc"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  setup_rspamd
fi
