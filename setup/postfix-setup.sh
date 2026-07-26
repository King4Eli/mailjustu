#!/usr/bin/env bash
# Checks .env/postfix.env exists.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ./setup/common.sh

setup_postfix() { require_env .env/postfix.env; }

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  setup_postfix
fi
