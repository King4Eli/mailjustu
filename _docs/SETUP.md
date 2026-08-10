# Setup / deployment

## Compose file layout

One base file plus opt-in overlays, layered with `-f`. None of them
declare a root `.env` -- config lives in `./.env/*.env`, one file per
service, and `--env-file .env/api.env` must be passed explicitly on every
`docker compose` invocation so `${MAIL_HOSTNAME}` etc. resolve.

| File | Adds | Required? |
| --- | --- | --- |
| `docker-compose.yml` | MySQL client config, Postfix, Dovecot, `mail_justu_server` (bigapp) | Base -- always |
| `docker-compose.override.yml` | Dev-only: builds `mail_justu_server` from `./bigapp` instead of pulling the image, publishes `:4001` | Auto-loaded by plain `docker compose`; skip in prod |
| `docker-compose.rspamd.yml` | Redis + Rspamd | Optional -- spam filtering |
| `docker-compose.opendkim.yml` | OpenDKIM | Optional -- DKIM (verify-only out of the box, see [Known follow-ups](./.todo.txt)) |
| `docker-compose.clamav.yml` | ClamAV + clamav-milter | Optional -- antivirus |

Postfix routes through the Rspamd/OpenDKIM milters only if those
containers are running; otherwise `milter_default_action=accept` just
skips them.

`shared-global-network` is `external: true` -- every service joins it in
addition to the project's own bridge network, and compose refuses to
start if it doesn't already exist. It's assumed to be created by
whatever else manages the host (`global_mysql` lives on it too, which is
how `mail_justu_server`/Postfix/Dovecot reach a MySQL instance this
project doesn't itself start).

## Fast path: `./setup.sh`

```bash
./setup.sh                    # dev mode: override + rspamd + opendkim + clamav
./setup.sh --prod              # pulls kingeli/mail_justu_server instead of building
./setup.sh --minimal           # base stack only, no rspamd/opendkim/clamav
./setup.sh --bootstrap-admin   # also creates the super admin after startup
./setup.sh --build             # force-rebuild mail_justu_server from ./bigapp
```

What it does, in order (each step also lives in its own
`./setup/<service>-setup.sh`, runnable standalone):

1. **`network-setup.sh`** -- checks/creates `shared-global-network`.
2. **`postfix-setup.sh` / `dovecot-setup.sh` / `rspamd-setup.sh` /
   `server-setup.sh`** -- `require_env` checks that the relevant
   `.env/*.env` files exist. These only *verify*, never write one --
   missing a file is a hard stop ("add it before running setup.sh").
3. Prompts you to confirm `.env/*.env` has been personalized (domain,
   hostname, admin, secrets) before continuing.
4. **`server-setup.sh`**'s `setup_server_mysql` -- checks `global_mysql`
   is reachable with the `DB_USER`/`DB_PASSWORD`/`DB_NAME` from
   `.env/api.env`. Warns (doesn't fail) if not -- `global_mysql` is
   external to this project.
5. `docker compose <selected files> up -d`.
6. **Provisioning steps that must run *after* first boot** (the named
   volumes need each image's own defaults seeded before anything writes
   into them, or the container fails to start):
   - `provision_dovecot_auth` -- writes real SQL auth config into
     `dovecot_config` (without it, IMAP login never works at all), then
     restarts Dovecot.
   - `provision_postfix_maps` -- renders the `mysql-virtual-*.cf` map
     files (envsubst'd from `.env/api.env`'s `DB_*`) into
     `postfix_config`, then restarts Postfix.
   - `provision_clamav_milter` (if `--no-clamav` wasn't passed) -- fixes
     `clamd/clamav-milter`'s default config (wrong socket path, and a
     `Foreground` directive that must be added or Docker kills the
     container the instant the milter daemonizes), then restarts it.
7. Waits up to 90s for containers to leave `starting`/`unhealthy`.
8. If `--bootstrap-admin`: runs `bootstrap-admin.js` with
   `SUPER_ADMIN_EMAILS`/`SUPER_ADMIN_PASSWORD` from `.env/api.env` -- see
   [ADMIN.md](./ADMIN.md).

None of the provisioning steps are idempotent-guarded against re-running
by hand -- `provision_dovecot_auth`/`provision_postfix_maps` always
overwrite (they're templated from env, not hand-tuned), `rspamd-setup.sh`
only rewrites its file on an actual password mismatch.

## Manual compose invocation

```bash
docker compose \
  --env-file .env/api.env \
  -f docker-compose.yml \
  -f docker-compose.override.yml \
  -f docker-compose.rspamd.yml \
  -f docker-compose.opendkim.yml \
  -f docker-compose.clamav.yml \
  up -d
```

Drop `docker-compose.override.yml` and any overlays you don't want. For
production, supply your own compose file instead of the dev override
(host bind mounts, `:4001` publish) -- `docker compose --env-file
.env/api.env -f docker-compose.yml -f docker-compose.<yours>.yml up -d`.
If you go this route by hand rather than via `setup.sh`, you still need
to run the provisioning steps above once after first boot (each
`setup/*-setup.sh` is runnable standalone, e.g. `source
setup/dovecot-setup.sh && provision_dovecot_auth`).

## Ports

| Port | Service |
| --- | --- |
| 25, 465, 587 | Postfix (SMTP, SMTPS, submission) |
| 143, 993 | Dovecot (IMAP, IMAPS) -- proxied to the image's rootless 31143/31993 internally |
| 4001 (dev only, via override) | bigapp -- `/webmail`, `/admin`, `/api` |
| 1180 | bigapp, always published (prod-equivalent path, no dev override needed) |
| 11334 | Rspamd controller (if the overlay is included) |

In prod mode (no override), bigapp is otherwise internal-only
(`mail_justu_server:80` inside `shared-global-network`) -- put a reverse
proxy in front rather than exposing 1180/4001 directly.

## Environment files (`./.env/`)

Each is `env_file:`-loaded into whichever container(s) need it (see
`docker-compose.yml`); nothing here is baked into the image at build
time except where noted.

- **`api.env`** -- the big one, loaded into `mail_justu_server` (and
  partially into `mail_justu_dovecot`, for the DB passdb lookup):
  `PORT`; `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` (points
  at `global_mysql`, not owned by this project); `IMAP_HOST`/`IMAP_PORT`,
  `SMTP_HOST`/`SMTP_PORT` (bigapp's own IMAP/SMTP client targets);
  `RSPAMD_HOST`/`RSPAMD_PORT`/`RSPAMD_CONTROLLER_PASSWORD`;
  `DOVEADM_HOST`/`DOVEADM_PORT` (Dovecot's HTTP API, for usage stats);
  `SUPER_ADMIN_EMAILS`/`SUPER_ADMIN_PASSWORD` (see
  [ADMIN.md](./ADMIN.md)); `SESSION_TTL_MINUTES`;
  `MAX_MAILBOXES_PER_DOMAIN`/`MAX_ALIASES_PER_MAILBOX`/`MAX_FOLDERS_PER_MAILBOX`;
  `MAX_ATTACHMENTS_PER_MESSAGE`/`MAX_ATTACHMENT_SIZE_MB`;
  `DEFAULT_MAILBOX_QUOTA_MB`; `MAIL_HOSTNAME`/`MAIL_PUBLIC_IP` (also used
  by `docker-compose.yml` itself, e.g. Postfix's `hostname:`).
- **`dovecot.env`** -- `DOVEADM_PASSWORD`, shared into `mail_justu_server`
  too (single copy, not duplicated -- see the comment in
  `docker-compose.yml`).
- **`postfix.env`** -- `ALLOWED_SENDER_DOMAINS`, `MYNETWORKS`.
- **`rspamd.env`** -- `PORT_PROXY`, `PORT_CONTROLLER`.
- **`server.env`** -- `ADMIN_TITLE`, read live by bigapp's Next.js server
  on every request (not build-time) -- change it and restart the
  container, no rebuild required.

`.env/deploy.json` also exists but isn't one of the `env_file:`s consumed
by compose -- check it separately if you're touching the deploy tooling
in `deploy.sh`.

Placeholder values ship checked in -- **rotate all passwords before any
real deployment.**

## Database

`global_mysql` is shared infrastructure this project doesn't start or
own -- `setup.sh` only *checks* it's reachable with the credentials in
`api.env`; the database and user must already exist there. Schema is
[schema.sql](./schema.sql) (`virtual_domains`, `virtual_users`,
`virtual_aliases`) -- apply it once against `DB_NAME` before the stack's
first boot, e.g.:

```bash
docker exec -i global_mysql mysql \
  -u "$(grep ^DB_USER .env/api.env | cut -d= -f2)" \
  -p"$(grep ^DB_PASSWORD .env/api.env | cut -d= -f2)" \
  "$(grep ^DB_NAME .env/api.env | cut -d= -f2)" < _docs/schema.sql
```

### Backup / restore

```bash
docker exec global_mysql mysqldump \
  -u "$(grep ^DB_USER .env/api.env | cut -d= -f2)" \
  -p"$(grep ^DB_PASSWORD .env/api.env | cut -d= -f2)" \
  --databases "$(grep ^DB_NAME .env/api.env | cut -d= -f2)" --routines --triggers > dump.sql
```

Contains bcrypt password hashes, not plaintext -- still treat it as a
secret, same as `.env/`.

## Known gaps

See [`.todo.txt`](./.todo.txt) for the full, current list (TLS certs are
self-signed out of the box, mail queue visibility isn't built, session
storage is in-memory/single-replica, etc.).
