#!/usr/bin/env bash
# Checks .env/rspamd.env exists. If rspamd is already running, verifies
# .env/api.env's RSPAMD_CONTROLLER_PASSWORD actually authenticates --
# rspamd's own copy lives in the rspamd_config volume, not read from env
# (see .env/rspamd.env), so the two can only be checked live, not synced.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ./setup/common.sh

setup_rspamd() {
  require_env .env/rspamd.env
  require_env .env/api.env

  docker inspect -f '{{.State.Running}}' mail_justu_rspamd 2>/dev/null | grep -q true || return 0

  local port password
  port="$(env_value .env/api.env RSPAMD_PORT)"
  password="$(env_value .env/api.env RSPAMD_CONTROLLER_PASSWORD)"
  if curl -sf -o /dev/null -H "Password: ${password}" "http://localhost:${port}/stat"; then
    echo "rspamd controller password OK"
  else
    warn "RSPAMD_CONTROLLER_PASSWORD in .env/api.env doesn't authenticate against the running rspamd -- edit /etc/rspamd/local.d/worker-controller.inc in the rspamd_config volume (docker exec mail_justu_rspamd) to match, or vice versa"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  setup_rspamd
fi
