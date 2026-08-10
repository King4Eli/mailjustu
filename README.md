# mailserver

A self-hosted mail server (Postfix + Dovecot + MySQL, with optional spam
filtering, DKIM, and antivirus). Everything else is one Next.js app,
`bigapp/`: two React frontends served from one origin -- `/admin` (operator
dashboard) and `/webmail` (webmail client) -- plus the API itself as Route
Handlers under `/api`. There's no separate backend service.

## Running the mail stack

```bash
./setup.sh
```

`docker-compose.yml` (MySQL client config, Postfix, Dovecot, the API) is
the minimum to send and receive mail; `docker-compose.rspamd.yml`,
`docker-compose.opendkim.yml`, and `docker-compose.clamav.yml` are opt-in
overlays layered in with `-f`. Full compose-layering details, ports, and
every `--env-file`/env var involved: [`_docs/SETUP.md`](./_docs/SETUP.md).

## Mailboxes are real accounts

Virtual domains/users/aliases live in MySQL and are read directly by
Postfix (`mysql:` maps) and Dovecot (SQL passdb) -- so a mailbox created
through the admin dashboard (or the API) can immediately send, receive,
and log in over real SMTP/IMAP. The database must be provisioned (schema:
[`_docs/schema.sql`](./_docs/schema.sql)) before the API starts. Each
mailbox also gets a real, Dovecot-enforced storage quota (`quota_mb`,
per-domain).

Mailboxes are managed through the admin dashboard's "Mailboxes" tab, or
directly via the API once logged in as an admin:

```bash
TOKEN=$(curl -s -X POST http://localhost:4001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mail.example.com","password":"..."}' | jq -r .token)

curl -X POST http://localhost:4001/api/admin/mailboxes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"you@mail.example.com","password":"..."}'
```

### Admin access is real login, not a shared secret

Signing into the admin dashboard is the same IMAP-backed login as webUI;
access depends on the account (super admin / domain admin / neither).
Roles, bootstrapping the first admin, and promoting/demoting a mailbox:
[`_docs/ADMIN.md`](./_docs/ADMIN.md).

### Aliases are self-service, domain-scoped

Any logged-in webUI user can create their own aliases ("Manage aliases"
in the sidebar) -- mail to the alias lands in their inbox, and Compose
lets them send *as* the alias. Aliases must be on the user's own domain
(`jordan@mail.example.com` can only create `whatever@mail.example.com`).

### Per-domain limits + DNS records

The admin dashboard's Domains tab sets, per domain: max mailboxes, max
aliases per mailbox, and a storage quota (MB) per mailbox -- each falls
back to a global default in `./.env/api.env`
(`MAX_MAILBOXES_PER_DOMAIN`/`MAX_ALIASES_PER_MAILBOX`/`DEFAULT_MAILBOX_QUOTA_MB`)
when unset. It also generates copy-pasteable MX/A/SPF/DMARC records for
the domain (DKIM is flagged as unavailable -- see Known follow-ups). Only
super admins can create/delete domains; domain admins can edit limits for
their own domain.

## Environment

Each component's config lives in its own file under `./.env/`
(`postfix.env`, `dovecot.env`, `rspamd.env`, `api.env`, `server.env`, ...)
rather than one shared `.env`. Update the passwords before any real
deployment -- checked-in values are placeholders. Full variable list per
file: [`_docs/SETUP.md`](./_docs/SETUP.md#environment-files-env).

## Frontends + API

```bash
cd bigapp && npm install && npm run dev   # everything, :4001 (/webmail, /admin, /api)
```

`bigapp` is a single Next.js app serving both `/webmail` and `/admin`
(source in `bigapp/webmail/src/` and `bigapp/admin/src/`) plus the API
under `/api` (`bigapp/app/api/`, logic in `bigapp/lib/api/`) -- one
process, one container, no separate service to reach or configure. No
ORM, no Express -- plain Route Handlers calling into `bigapp/lib/api/`.
How it all fits together (sessions, IMAP/SMTP/MySQL connections,
`lib/api/` responsibilities): [`_docs/ARCHITECTURE.md`](./_docs/ARCHITECTURE.md).
Every route, its auth requirement, and request/response shape:
[`_docs/API.md`](./_docs/API.md).

## Backing up / restoring

The database lives in the shared `global_mysql` instance (not a container
this project starts or owns). Backup/restore commands:
[`_docs/SETUP.md`](./_docs/SETUP.md#database).

## Known follow-ups

See [`_docs/.todo.txt`](./_docs/.todo.txt) for the full list. Highlights:

- OpenDKIM ships in verify-only mode. Signing needs real per-domain keys
  and matching DNS TXT records, which only make sense for an owned domain.
- Admin's "Mail activity", "Mail queue", and "Security" views don't exist
  yet -- they'd need Postfix queue introspection and log parsing.
