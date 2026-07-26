#!/usr/bin/env bash
# Checks .env/dovecot.env exists. provision_dovecot_auth() (called from
# setup.sh, AFTER `docker compose up -d`, not here) writes Dovecot's real
# auth config into the dovecot_config volume -- without it the volume only
# has the base image's stock conf.d/auth.conf (passdb static, keyed off a
# USER_PASSWORD env var nothing ever sets -- unmatchable, login always
# fails). It also adds a plain LMTP listener (dovecot-lmtp.conf) -- the
# image only ships an implicit-TLS `lmtps` one, but Postfix's
# virtual_transport talks plain LMTP, so mail delivery deferred forever
# with "Connection refused" without this. See dovecot-auth.conf /
# dovecot-auth-sql.conf / dovecot-lmtp.conf for the reference copies this
# writes in.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ./setup/common.sh

setup_dovecot() { require_env .env/dovecot.env; }

# Must run AFTER the dovecot_config volume already has the image's default
# files in it (i.e. after `docker compose up -d` has started
# mail_justu_dovecot at least once) -- on a brand new volume, the image's
# entrypoint only seeds its defaults (dovecot.conf, vendor.d/, ssl/) when
# /etc/dovecot is completely empty at boot. Writing conf.d/*.conf into an
# empty volume *first* makes the entrypoint see a non-empty directory and
# skip seeding entirely, permanently missing dovecot.conf
# ("Failed to read configuration: stat(/etc/dovecot/dovecot.conf) failed:
# No such file or directory", not fixable by re-running this after the
# fact -- the volume has to be recreated).
#
# Always overwrites conf.d/auth*.conf -- these files are templated from
# env, not hand-tuned per-server, so re-running is expected to keep the
# volume in sync.
provision_dovecot_auth() {
  log "Provisioning Dovecot auth config into the dovecot_config volume"
  docker run --rm \
    -v mail_justu_dovecot_config:/target \
    -v "$PWD/dovecot-auth.conf:/src/auth.conf:ro" \
    -v "$PWD/dovecot-auth-sql.conf:/src/auth-sql.conf:ro" \
    -v "$PWD/dovecot-lmtp.conf:/src/lmtp.conf:ro" \
    busybox sh -c '
      mkdir -p /target/conf.d &&
      cp /src/auth.conf /target/conf.d/auth.conf &&
      cp /src/auth-sql.conf /target/conf.d/auth-sql.conf &&
      cp /src/lmtp.conf /target/conf.d/lmtp.conf
    '
  # docker compose up -d only recreates a container when its compose
  # config changed -- editing conf.d content alone doesn't trigger that,
  # so restart here to actually pick up the change.
  docker restart mail_justu_dovecot >/dev/null
  echo "mail_justu_dovecot restarted to pick up auth config"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  setup_dovecot
fi
