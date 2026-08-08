# mailserver

A self-hosted mail server (Postfix + Dovecot + MySQL, with optional spam
filtering, DKIM, and antivirus). Everything else is one Next.js app,
`bigapp/`: two React frontends served from one origin -- `/admin` (operator
dashboard) and `/webmail` (webmail client) -- plus the API itself as Route
Handlers under `/api`. There's no separate backend service.

## Running the mail stack

`docker-compose.yml` is the minimum required to send and receive mail:
MySQL, Postfix, Dovecot, and the API. `docker-compose.override.yml` is
loaded automatically by plain `docker compose` and adds dev-only ports plus
bind-mounts of each service's config under `./volumes`.

```bash
./setup.sh
```

Or invoke compose directly -- `--env-file .env/api.env` is required since
`docker-compose.yml` reads `${MAIL_HOSTNAME}` from it and there's no root
`.env` compose can find automatically:

```bash
docker compose --env-file .env/api.env up -d
```

Everything else is opt-in, one file per concern:

| File | Adds | Why it's separate |
| --- | --- | --- |
| `docker-compose.rspamd.yml` | Redis + Rspamd | Spam filtering -- not required |
| `docker-compose.opendkim.yml` | OpenDKIM | DKIM signing/verification -- not required |
| `docker-compose.clamav.yml` | ClamAV | Antivirus scanning -- not required |

Layer in whichever you want with `-f`:

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

Postfix routes mail through the Rspamd and OpenDKIM milters if they're
running; without those files it just skips them
(`milter_default_action=accept`).

For production, skip the dev override and supply your own:
`docker compose --env-file .env/api.env -f docker-compose.yml -f docker-compose.<yours>.yml up -d`.

## Mailboxes are real accounts

Virtual domains/users/aliases live in MySQL and are read directly by
Postfix (`mysql:` maps) and Dovecot (SQL passdb) -- so a mailbox created
through the admin dashboard (or the API) can immediately send, receive,
and log in over real SMTP/IMAP. The database must be provisioned before
the API starts. Each mailbox also gets a real, Dovecot-enforced storage
quota (`quota_mb`, per-domain).

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
access depends on the account:

- **Super admin** -- email listed in `./.env/api.env`'s
  `SUPER_ADMIN_EMAILS`. Full access: every domain, mailbox, alias, plus
  Services/health/stats. Bootstrapping the first one has no self-serve
  flow -- from the host:
  ```bash
  docker exec -it mail_justu_server node scripts/bootstrap-admin.js admin@mail.example.com 'somepassword'
  ```
  creates (or resets) that mailbox with `is_admin=1`. Then add the same
  email to `SUPER_ADMIN_EMAILS` and recreate the container (that check is
  env-based, not a DB column).
- **Domain admin** -- a mailbox with `virtual_users.is_admin = true` (set
  by a super admin). Scoped to their own domain's mailboxes, aliases, and
  limits; never sees Services/health/stats.
- Anyone else gets 401 on every `/api/admin/*` route.

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
deployment -- checked-in values are placeholders. There's no `mysql.env`
here -- `api.env`'s `DB_*` vars point at the shared `global_mysql`
instance, which this project doesn't own or configure.

`server.env` (`ADMIN_TITLE`, `MAIL_HOST`) is read live by `bigapp`'s
Next.js server, not baked in at build time -- change it and restart the
container, no rebuild needed. `api.env` is also loaded into the same
container, since the API runs inside it.

## Frontends + API

```bash
cd bigapp && npm install && npm run dev   # everything, :4001 (/webmail, /admin, /api)
```

`bigapp` is a single Next.js app serving both `/webmail` and `/admin`
(source in `bigapp/webmail/src/` and `bigapp/admin/src/`) plus the API
under `/api` (`bigapp/app/api/`, logic in `bigapp/lib/api/`) -- one
process, one container, no separate service to reach or configure.

No ORM, no Express -- plain Route Handlers calling into `bigapp/lib/api/`.
`lib/api/auth.ts`'s `requireSession` verifies logins over IMAP, then
resolves a role (super/domain/user) from `SUPER_ADMIN_EMAILS` +
`virtual_users.is_admin`. `app/api/mail/*` handles
folders/messages/send/flags/move/delete over IMAP (imapflow) and SMTP
(nodemailer); `app/api/mail/aliases/*` is the self-service alias CRUD;
`app/api/admin/mailboxes/*` and `app/api/admin/domains/*` are role-scoped
admin CRUD against MySQL; `app/api/admin/health` and `app/api/admin/stats`
(super-admin only) do live TCP checks and proxy Rspamd's controller
stats. Sessions are an in-memory token -> {email, password, role, domain}
map with a TTL (`SESSION_TTL_MINUTES`), not JWTs -- the password never
touches the browser after login.

## Backing up / restoring

The database lives in the shared `global_mysql` instance (not a container
this project starts or owns). Back it up with the app-scoped credentials
from `.env/api.env`:

```bash
docker exec global_mysql mysqldump \
  -u "$(grep ^DB_USER .env/api.env | cut -d= -f2)" \
  -p"$(grep ^DB_PASSWORD .env/api.env | cut -d= -f2)" \
  --databases "$(grep ^DB_NAME .env/api.env | cut -d= -f2)" --routines --triggers > dump.sql
```

The dump contains bcrypt password hashes, not plaintext -- still treat it
as a secret, same as the `.env/` files.

## Known follow-ups

See `.todo.txt` for the full list. Highlights:

- OpenDKIM ships in verify-only mode. Signing needs real per-domain keys
  and matching DNS TXT records, which only make sense for an owned domain.
- Admin's "Mail activity", "Mail queue", and "Security" views don't exist
  yet -- they'd need Postfix queue introspection and log parsing.
