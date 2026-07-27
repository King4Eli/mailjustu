#!/usr/bin/env bash
# clamav/clamav ships clamav-milter with ClamdSocket unix:/tmp/clamd.sock
# and no Foreground directive -- wrong (clamd is a separate container, no
# such socket here) and fatal once corrected alone: on a working
# ClamdSocket the milter daemonizes, and Docker's tini treats the
# original process exiting as "done" and kills the container before the
# forked daemon does anything. See config/clamav/milter.conf.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
source ./setup/common.sh

# Must run after `docker compose up -d` has started mail-clamav-milter at
# least once -- same ordering rule as provision_dovecot_auth.
provision_clamav_milter() {
  log "Provisioning ClamAV milter config"
  docker run --rm \
    -v mail_justu_clamav_milter_config:/target \
    -v "$PWD/config/clamav/milter.conf:/src/milter.conf:ro" \
    busybox cp /src/milter.conf /target/clamav-milter.conf
  docker restart mail-clamav-milter >/dev/null
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  provision_clamav_milter
fi
