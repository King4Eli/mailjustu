#!/usr/bin/env bash
# Checks env/postfix.env exists. provision_postfix_maps() writes the
# mysql virtual mailbox/alias maps into the postfix_config volume -- main.cf
# already points at them, but nothing else creates the files. See
# config/postfix/mysql-virtual-*.cf.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ./setup/common.sh

setup_postfix() { require_env env/postfix.env; }

# Same ordering rule as provision_dovecot_auth: must run after
# `docker compose up -d` has started mail_justu_postfix at least once.
provision_postfix_maps() {
  log "Provisioning Postfix mysql virtual maps"
  local tmp; tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  export DB_HOST DB_USER DB_PASSWORD DB_NAME
  DB_HOST="$(env_value env/api.env DB_HOST)"
  DB_USER="$(env_value env/api.env DB_USER)"
  DB_PASSWORD="$(env_value env/api.env DB_PASSWORD)"
  DB_NAME="$(env_value env/api.env DB_NAME)"

  for f in mysql-virtual-mailbox-domains mysql-virtual-mailbox-maps mysql-virtual-alias-maps mysql-virtual-mailbox-domains-ok; do
    envsubst '${DB_HOST} ${DB_USER} ${DB_PASSWORD} ${DB_NAME}' \
      < "config/postfix/$f.cf" > "$tmp/$f.cf"
  done

  # Streamed over stdin rather than bind-mounting $tmp: Docker Desktop only
  # shares $HOME with its VM, so a /tmp mount fails with "mounts denied".
  tar -C "$tmp" -cf - . \
    | docker run --rm -i -v mail_justu_postfix_config:/target busybox \
        tar -C /target -xof -
  # They hold the DB password, and Postfix warns on group/other-writable maps.
  docker exec mail_justu_postfix sh -c \
    'chown root:postfix /etc/postfix/mysql-virtual-*.cf && chmod 0640 /etc/postfix/mysql-virtual-*.cf'
  docker restart mail_justu_postfix >/dev/null
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  setup_postfix
fi
