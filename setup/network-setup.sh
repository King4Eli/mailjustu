#!/usr/bin/env bash
# Ensures the external shared-global-network exists.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ./setup/common.sh

setup_network() {
  log "Checking external network shared-global-network"
  if docker network inspect shared-global-network >/dev/null 2>&1; then
    echo "shared-global-network already exists"
  else
    warn "shared-global-network not found -- docker-compose.yml requires it to already exist (it's external:true)"
    if confirm "Create it now (docker network create shared-global-network)?"; then
      docker network create shared-global-network
    else
      die "cannot continue without shared-global-network"
    fi
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  setup_network
fi
