#!/usr/bin/env bash
# Checks .env/dovecot.env exists, and provisions Dovecot's auth config into
# the dovecot_config volume -- that volume starts empty (no bind mount, no
# seed step in the base dovecot image), so without this, login silently
# never works on a fresh server. See dovecot-auth.conf / dovecot-auth-sql.conf
# for the reference copies this writes in.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ./setup/common.sh

setup_dovecot() {
  require_env .env/dovecot.env
  provision_dovecot_auth
}

# Always overwrites -- these files are templated from env, not hand-tuned
# per-server, so re-running is expected to keep the volume in sync.
provision_dovecot_auth() {
  log "Provisioning Dovecot auth config into the dovecot_config volume"
  docker run --rm \
    -v mail_justu_dovecot_config:/target \
    -v "$PWD/dovecot-auth.conf:/src/auth.conf:ro" \
    -v "$PWD/dovecot-auth-sql.conf:/src/auth-sql.conf:ro" \
    busybox sh -c '
      mkdir -p /target/conf.d &&
      cp /src/auth.conf /target/conf.d/auth.conf &&
      cp /src/auth-sql.conf /target/conf.d/auth-sql.conf
    '
  # docker compose up -d (later in setup.sh) only recreates a container
  # when its compose config changed -- editing conf.d content alone
  # doesn't trigger that, so if dovecot's already running, restart it here
  # to actually pick up the change.
  if docker inspect mail_justu_dovecot >/dev/null 2>&1; then
    docker restart mail_justu_dovecot >/dev/null
    echo "mail_justu_dovecot restarted to pick up auth config"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  setup_dovecot
fi
