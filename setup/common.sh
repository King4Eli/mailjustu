#!/usr/bin/env bash
# Shared helpers for setup/*.sh.

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$1" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$1" >&2; exit 1; }

confirm() {
  ${ASSUME_YES:-false} && return 0
  read -r -p "$1 [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

# require_env FILE -- warns and stops if FILE doesn't exist. Never writes one.
require_env() {
  [[ -f "$1" ]] || { warn "$1 is missing -- add it before running setup.sh"; exit 1; }
}

env_value() { grep "^${2}=" "$1" | cut -d= -f2-; }
