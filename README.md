# mailserver

A self-hosted mail server (Postfix + Dovecot + MySQL, with optional spam
filtering, DKIM, and antivirus) plus two React frontends: `admin/` (an
operator dashboard) and `webUI/` (a webmail client).

## Running the mail stack

`docker-compose.yml` is the minimum required to send and receive mail:
MySQL, Postfix, and Dovecot. `docker-compose.override.yml` sits next to it
and is loaded automatically by plain `docker compose` -- it adds dev-only
ports and bind-mounts each service's config under `./volumes` so it's
visible and editable on the host.

```bash
docker compose up -d
```

Everything else is opt-in, one file per concern:

| File | Adds | Why it's separate |
| --- | --- | --- |
| `docker-compose.rspamd.yml` | Redis + Rspamd | Spam filtering -- useful, not required to send/receive mail |
| `docker-compose.opendkim.yml` | OpenDKIM | DKIM signing/verification -- improves deliverability, not required |
| `docker-compose.clamav.yml` | ClamAV | Antivirus scanning -- not required |

Layer in whichever you want with `-f`:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.override.yml \
  -f docker-compose.rspamd.yml \
  -f docker-compose.opendkim.yml \
  -f docker-compose.clamav.yml \
  up -d
```

Postfix is already configured (`./.env/postfix.env`) to route mail through
the Rspamd and OpenDKIM milters if they're running; if you don't include
those files, Postfix just skips them (`milter_default_action=accept`).

For a production deploy, skip the dev override and supply your own:
`docker compose -f docker-compose.yml -f docker-compose.<yours>.yml up -d`.

## Environment

Each component's configuration lives in its own file under `./.env/`
(`mysql.env`, `postfix.env`, `rspamd.env`, `admin.env`, `webui.env`, ...)
rather than one shared `.env`. Update the passwords in there before any
real deployment -- the checked-in values are placeholders.

## Frontends

```bash
cd admin && npm install && npm run dev   # operator dashboard, :5173
cd webUI && npm install && npm run dev   # webmail client, :5174
```

Both read their dev/preview ports and public `VITE_` config from
`../.env/admin.env` and `../.env/webui.env` respectively.

## Known follow-ups

- Dovecot/Postfix aren't yet wired to MySQL for virtual mailbox/user
  provisioning -- accounts would need `virtual_mailbox_maps` (Postfix) and
  a SQL passdb/userdb (Dovecot) added for real multi-domain hosting.
- OpenDKIM ships in verify-only mode. Signing needs real per-domain keys
  and matching DNS TXT records, which only make sense for an owned domain.
- The webUI/admin apps use mock/demo data; neither is wired to a backend
  API yet (browsers shouldn't talk to Docker or the mail stack directly).
