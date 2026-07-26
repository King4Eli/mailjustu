#!/usr/bin/env bash
# Checks .env/server.env + .env/api.env exist, and global_mysql reachability.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ./setup/common.sh

setup_server_env() {
  require_env .env/server.env
  require_env .env/api.env
}

setup_server_mysql() {
  log "Checking global_mysql reachability"
  local DB_USER DB_PASSWORD DB_NAME
  DB_USER="$(grep ^DB_USER= .env/api.env | cut -d= -f2)"
  DB_PASSWORD="$(grep ^DB_PASSWORD= .env/api.env | cut -d= -f2)"
  DB_NAME="$(grep ^DB_NAME= .env/api.env | cut -d= -f2)"
  if ! docker inspect global_mysql >/dev/null 2>&1; then
    warn "global_mysql container not found -- it's external to this project, start/provision it separately"
  elif docker exec global_mysql mysql -u "$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" "$DB_NAME" >/dev/null 2>&1; then
    echo "global_mysql reachable, $DB_NAME database + $DB_USER credentials OK"
  else
    warn "could not connect to $DB_NAME as $DB_USER on global_mysql -- create the database/user there first"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  setup_server_env
  setup_server_mysql
fi
