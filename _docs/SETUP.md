# Setup / deployment

## Compose file layout

Base file + opt-in overlays, layered with `-f`. Root `.env` (interpolation
vars `MAIL_HOSTNAME`, `APP_VERSION`) is auto-loaded -- no `--env-file`.
Per-service process env: `./env/*.env`, one per service, via `env_file:`.

| File | Adds | Required? |
| --- | --- | --- |
| `docker-compose.yml` | MySQL client config, Postfix, Dovecot, `mail_justu_server` (bigapp) | Base -- always |
| `docker-compose.override.yml` | Dev-only: builds `mail_justu_server` from `./bigapp` instead of pulling, publishes `:4001` | Auto-loaded by plain `docker compose`; skip in prod |
| `docker-compose.rspamd.yml` | Redis + Rspamd | Optional -- spam filtering |
| `docker-compose.opendkim.yml` | OpenDKIM | Optional -- DKIM (verify-only OOTB, see [`.todo.txt`](./.todo.txt)) |
| `docker-compose.clamav.yml` | ClamAV + clamav-milter | Optional -- antivirus |

Postfix routes through the Rspamd/OpenDKIM milters only if those
containers are running; otherwise `milter_default_action=accept` skips
them.

`shared-global-network` is `external: true` -- every service joins it plus
the project's own bridge, and compose refuses to start if it doesn't
exist. Assumed created by whatever manages the host (`global_mysql` lives
on it too -- that's how server/Postfix/Dovecot reach a MySQL this project
doesn't start).

## Fast path: `./setup.sh`

```bash
./setup.sh                    # dev: override + rspamd + opendkim + clamav
./setup.sh --prod              # pulls kingeli/mail_justu_server instead of building
./setup.sh --minimal           # base stack only
./setup.sh --bootstrap-admin   # also create the super admin after startup
./setup.sh --build             # force-rebuild mail_justu_server from ./bigapp
```

Steps, in order (each also in its own `./setup/<service>-setup.sh`,
runnable standalone):

1. **`network-setup.sh`** -- check/create `shared-global-network`.
2. **`{postfix,dovecot,rspamd,server}-setup.sh`** -- `require_env` checks
   the relevant `env/*.env` files exist. Verify only, never write --
   missing file is a hard stop.
3. Confirm `env/*.env` is personalized (domain, hostname, admin, secrets).
4. **`server-setup.sh`** `setup_server_mysql` -- checks `global_mysql`
   reachable with `DB_USER`/`DB_PASSWORD`/`DB_NAME` from `env/api.env`.
   Warns, doesn't fail (external to this project).
5. `docker compose <selected files> up -d`.
6. **Post-first-boot provisioning** (named volumes need each image's
   defaults seeded first, or the container won't start):
   - `provision_dovecot_auth` -- writes SQL auth config into
     `dovecot_config` (without it IMAP login never works), restarts Dovecot.
   - `provision_postfix_maps` -- renders `mysql-virtual-*.cf` (envsubst'd
     from `env/api.env` `DB_*`) into `postfix_config`, restarts Postfix.
   - `provision_clamav_milter` (unless `--no-clamav`) -- fixes
     `clamav-milter` config (wrong socket path; missing `Foreground`
     directive -> Docker kills the container on daemonize), restarts it.
7. Waits up to 90s for containers to leave `starting`/`unhealthy`.
8. `--bootstrap-admin` -> runs `bootstrap-admin.js` with
   `SUPER_ADMIN_EMAILS`/`SUPER_ADMIN_PASSWORD` from `env/api.env` -- see
   [ADMIN.md](./ADMIN.md).

Provisioning steps aren't idempotent-guarded:
`provision_dovecot_auth`/`provision_postfix_maps` always overwrite
(templated from env), `rspamd-setup.sh` only rewrites on a password
mismatch.

## Manual compose invocation

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.override.yml \
  -f docker-compose.rspamd.yml \
  -f docker-compose.opendkim.yml \
  -f docker-compose.clamav.yml \
  up -d
```

Root `.env` auto-loaded. Bare `docker compose up -d` = base + dev override.
Drop overlays you don't want. Prod: swap the override for your own file --
`docker compose -f docker-compose.yml -f docker-compose.<yours>.yml up -d`.
By hand (not via `setup.sh`): still run the provisioning steps above once
after first boot -- each `setup/*-setup.sh` runs standalone, e.g. `source
setup/dovecot-setup.sh && provision_dovecot_auth`.

## Ports

| Port | Service |
| --- | --- |
| 25, 465, 587 | Postfix (SMTP, SMTPS, submission) |
| 143, 993 | Dovecot (IMAP, IMAPS) -- proxied to the image's rootless 31143/31993 |
| 4001 (dev only, via override) | bigapp -- `/webmail`, `/admin`, `/api` |
| 1180 | bigapp, always published (prod-equivalent path) |
| 11334 | Rspamd controller (if the overlay is included) |

Prod (no override): bigapp is internal-only (`mail_justu_server:80` on
`shared-global-network`) -- put a reverse proxy in front, don't expose
1180/4001 directly.

## Environment files (`./env/`)

Each is `env_file:`-loaded into whichever container(s) need it (see
`docker-compose.yml`); nothing is baked into the image except where noted.

Root `.env` is separate -- auto-loaded for `${...}` interpolation only,
never an `env_file:`, never injected. Holds `MAIL_HOSTNAME` (Postfix
`hostname:` + server DNS-record gen, re-exported via `environment:`) and
`APP_VERSION` (server image tag).

- **`api.env`** -- the big one, loaded into `mail_justu_server` (and
  partially into `mail_justu_dovecot`, for the DB passdb lookup):
  `PORT`; `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` (points at
  `global_mysql`, external); `IMAP_HOST`/`IMAP_PORT`,
  `SMTP_HOST`/`SMTP_PORT` (bigapp's own IMAP/SMTP client targets);
  `RSPAMD_HOST`/`RSPAMD_PORT`/`RSPAMD_CONTROLLER_PASSWORD`;
  `DOVEADM_HOST`/`DOVEADM_PORT` (usage stats);
  `SUPER_ADMIN_EMAILS`/`SUPER_ADMIN_PASSWORD` (see
  [ADMIN.md](./ADMIN.md)); `SESSION_TTL_MINUTES`;
  `LOGIN_RATE_LIMIT_MAX_ATTEMPTS`/`LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP`/
  `LOGIN_RATE_LIMIT_WINDOW_MINUTES` (in-memory throttle, `lib/api/rateLimit.ts`);
  `MESSAGE_LIST_PAGE_SIZE`;
  `MAX_MAILBOXES_PER_DOMAIN`/`MAX_ALIASES_PER_MAILBOX`/`MAX_FOLDERS_PER_MAILBOX`;
  `MAX_ATTACHMENTS_PER_MESSAGE`/`MAX_ATTACHMENT_SIZE_MB`;
  `DEFAULT_MAILBOX_QUOTA_MB`; `MAIL_PUBLIC_IP` (DNS records -- but
  `MAIL_HOSTNAME` is in root `.env`);
  `SCHEDULED_SEND_POLL_SECONDS`/`SNOOZE_POLL_SECONDS` (background pollers,
  `lib/api/scheduler.ts`).
- **`dovecot.env`** -- `DOVEADM_PASSWORD`, also shared into
  `mail_justu_server` (single copy -- see the `docker-compose.yml` comment).
- **`postfix.env`** -- `ALLOWED_SENDER_DOMAINS`, `MYNETWORKS`.
- **`rspamd.env`** -- `PORT_PROXY`, `PORT_CONTROLLER`.
- **`server.env`** -- `ADMIN_TITLE`, read live per request (not
  build-time) -- change + restart the container, no rebuild.

`env/deploy.json` also exists but isn't an `env_file:` -- check it
separately if you touch the deploy tooling in `deploy.sh`.

Placeholder values ship checked in -- **rotate all passwords before real
deployment.**

## Database

`global_mysql` is shared infra this project doesn't start or own --
`setup.sh` only *checks* it's reachable with the `api.env` credentials;
DB and user must already exist. Schema is [schema.sql](./schema.sql)
(`virtual_domains`, `virtual_users`, `virtual_aliases`) -- apply once
against `DB_NAME` before first boot:

```bash
docker exec -i global_mysql mysql \
  -u "$(grep ^DB_USER env/api.env | cut -d= -f2)" \
  -p"$(grep ^DB_PASSWORD env/api.env | cut -d= -f2)" \
  "$(grep ^DB_NAME env/api.env | cut -d= -f2)" < _docs/schema.sql
```

### Backup / restore

```bash
docker exec global_mysql mysqldump \
  -u "$(grep ^DB_USER env/api.env | cut -d= -f2)" \
  -p"$(grep ^DB_PASSWORD env/api.env | cut -d= -f2)" \
  --databases "$(grep ^DB_NAME env/api.env | cut -d= -f2)" --routines --triggers > dump.sql
```

Contains bcrypt hashes, not plaintext -- still a secret, same as `env/`.

## Known gaps

See [`.todo.txt`](./.todo.txt) (self-signed TLS OOTB, no mail queue
visibility, in-memory single-replica sessions, etc.).
