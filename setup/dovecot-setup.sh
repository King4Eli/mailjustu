#!/usr/bin/env bash
# Checks .env/dovecot.env exists.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ./setup/common.sh

setup_dovecot() { require_env .env/dovecot.env; }

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  setup_dovecot
fi
