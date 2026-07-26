#!/usr/bin/env bash
# Checks .env/postfix.env exists. provision_postfix_maps() (called from
# setup.sh, AFTER `docker compose up -d`, not here) writes the mysql:
# virtual mailbox/alias map files into the postfix_config volume --
# main.cf already points at them (via POSTFIX_virtual_mailbox_domains /
# POSTFIX_virtual_mailbox_maps / POSTFIX_virtual_alias_maps in
# .env/postfix.env), but nothing ever created the files themselves. Without
# them, Postfix rejects every RCPT with "451 4.3.0 ... Temporary lookup
# failure" (open .../mysql-virtual-*.cf: No such file or directory). See
# postfix-mysql-virtual-*.cf for the reference copies this writes in.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ./setup/common.sh

setup_postfix() { require_env .env/postfix.env; }

# Must run AFTER `docker compose up -d` has started mail_justu_postfix at
# least once against this volume -- same reason as
# provision_dovecot_auth() in setup/dovecot-setup.sh: writing into a
# completely empty named volume before the image's own entrypoint has had
# a chance to seed its defaults can make it skip seeding entirely.
#
# Always overwrites -- these files are hardcoded (Postfix's mysql: maps
# don't support %{env:...} expansion, unlike Dovecot's), not hand-tuned
# per-server, so re-running is expected to keep the volume in sync.
provision_postfix_maps() {
  log "Provisioning Postfix mysql virtual maps into the postfix_config volume"
  docker run --rm \
    -v mail_justu_postfix_config:/target \
    -v "$PWD/postfix-mysql-virtual-mailbox-domains.cf:/src/mysql-virtual-mailbox-domains.cf:ro" \
    -v "$PWD/postfix-mysql-virtual-mailbox-maps.cf:/src/mysql-virtual-mailbox-maps.cf:ro" \
    -v "$PWD/postfix-mysql-virtual-alias-maps.cf:/src/mysql-virtual-alias-maps.cf:ro" \
    busybox sh -c '
      cp /src/mysql-virtual-mailbox-domains.cf /target/mysql-virtual-mailbox-domains.cf &&
      cp /src/mysql-virtual-mailbox-maps.cf /target/mysql-virtual-mailbox-maps.cf &&
      cp /src/mysql-virtual-alias-maps.cf /target/mysql-virtual-alias-maps.cf
    '
  # Postfix re-opens mysql: map files per lookup rather than caching them
  # at master startup, so no restart is strictly needed here -- but
  # restarting keeps this consistent with provision_dovecot_auth() and
  # guards against any lookup that was already open/cached.
  docker restart mail_justu_postfix >/dev/null
  echo "mail_justu_postfix restarted to pick up virtual maps"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  setup_postfix
fi
