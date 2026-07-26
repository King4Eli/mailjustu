#!/usr/bin/env bash
# Checks .env/dovecot.env exists. provision_dovecot_auth() writes real
# login auth into the dovecot_config volume -- without it, login just
# never works (image default has no usable passdb). See config/dovecot/auth.conf.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ./setup/common.sh

setup_dovecot() { require_env .env/dovecot.env; }

# Must run after `docker compose up -d` has started mail_justu_dovecot at
# least once -- on a brand new volume, writing conf.d files in first makes
# the image's entrypoint skip seeding its own defaults (dovecot.conf never
# gets created, permanent crash loop). Always overwrites -- this file is
# templated from env, not hand-tuned per server.
provision_dovecot_auth() {
  log "Provisioning Dovecot auth config"
  docker run --rm \
    -v mail_justu_dovecot_config:/target \
    -v "$PWD/config/dovecot/auth.conf:/src/auth.conf:ro" \
    busybox sh -c 'mkdir -p /target/conf.d && cp /src/auth.conf /target/conf.d/auth.conf'
  docker restart mail_justu_dovecot >/dev/null
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  setup_dovecot
fi
