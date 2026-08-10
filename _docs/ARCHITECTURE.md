# Architecture

## Big picture

Four containers (`docker-compose.yml`), one of which is a full app:

```
mail_justu_postfix   -- SMTP in/out (boky/postfix, stock image)
mail_justu_dovecot   -- IMAP, mailbox storage on vmail_data (dovecot/dovecot, stock image)
mail_justu_server    -- bigapp: /webmail + /admin + /api, one Next.js process
global_mysql         -- external, shared, not owned by this project
```

Postfix and Dovecot both read `virtual_domains`/`virtual_users`/
`virtual_aliases` straight out of MySQL (Postfix via `mysql:` maps,
Dovecot via SQL passdb/userdb) -- so a mailbox created through bigapp is
immediately usable over real SMTP/IMAP, no separate provisioning step.
Optional overlays (`docker-compose.rspamd.yml`,
`docker-compose.opendkim.yml`, `docker-compose.clamav.yml`) add Postfix
milters; see [SETUP.md](./SETUP.md).

There is **no separate backend service** -- `bigapp` is the only
application code in the repo. No ORM, no Express: plain Next.js Route
Handlers under `app/api/`, calling straight into `lib/api/`.

## `bigapp/` layout

```
app/            Next.js App Router: pages + app/api/**/route.ts (the API)
admin/src/      /admin frontend (operator dashboard) -- original React SPA source
webmail/src/    /webmail frontend, webmail/src/components/ -- original React SPA source
lib/api/        Shared server-side logic the route handlers call into
scripts/        One-off ops scripts run via `docker exec`, not through Next.js
public/         Static assets
```

`app/admin/` and `app/webmail/` are thin `'use client'` wrapper pages
(`layout.tsx`, `page.tsx`, `AdminRoot.tsx`/`WebmailRoot.tsx`) that import
and mount the *original* React SPA code living in the sibling `admin/src/`
and `webmail/src/` directories (`app/admin/AdminRoot.tsx` does `import
App from '../../admin/src/App'`) -- those were standalone SPAs before the
Express→Next.js migration, now just embedded as client components (both
apps use `localStorage`/`window`, so they're inherently client-side).
`next.config.ts` redirects `/` → `/webmail`.

One process, one container: `/admin` and `/webmail` are two React
frontends served from the same origin as the API, not separate deploys.

## `lib/api/`

| File | Responsibility |
| --- | --- |
| `auth.ts` | Session map, login role resolution (`super`/`domain`/`user`), `requireSession`/`requireDomainAdmin`/`requireSuperAdmin` guards -- see [ADMIN.md](./ADMIN.md) |
| `db.ts` | The one `mysql2/promise` pool (`DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`), reused across all admin/mail routes |
| `imap.ts` | `withImap()` -- opens an IMAP connection per request as the logged-in user's own credentials (not a service account), plus SPECIAL-USE folder resolution (Archive/Trash/etc.) |
| `doveadm.ts` | Calls Dovecot's `doveadm` HTTP API (`DOVEADM_HOST`/`DOVEADM_PORT`, Basic auth via `DOVEADM_PASSWORD`) for real on-disk mailbox usage (`vsize` summed across folders); fails soft (`null`) if Dovecot's unreachable. Overrides the outgoing `Host` header (Dovecot's HTTP server rejects the underscored `mail_justu_dovecot`) |
| `attachments.ts` | Attachment parsing + limit enforcement (`MAX_ATTACHMENTS_PER_MESSAGE`, `MAX_ATTACHMENT_SIZE_MB`) |
| `mailHtml.ts` | Sanitizes received HTML mail (`sanitize-html`), rewrites `cid:` inline-image references to `data:` URIs |
| `threading.ts` | Groups messages into conversations via References/In-Reply-To chains |
| `dkim.ts` | Generates per-domain DKIM keypairs (stored in `virtual_domains.dkim_private_key`/`dkim_public_key`); the actual signing is done by OpenDKIM, synced by the separate `dkim-sync` sidecar |
| `dns.ts` | Generates copy-pasteable MX/A/SPF/DMARC/DKIM DNS records for a domain, from `MAIL_HOSTNAME`/`MAIL_PUBLIC_IP` |
| `handler.ts` | `withApiErrors()` -- catch-all wrapper mirroring the pre-migration Express app's error middleware; `ApiAuthError` → its own status code, anything else → logged 500 |
| `validators.ts` | Dependency-free validation helpers (email/domain normalization, folder name checks), kept DB/IMAP-free so they're unit-testable |

`lib/api/__tests__/` (`auth.test.ts`, `validators.test.ts`) covers the
DB/IMAP-free logic (validators, session guards) -- 9 tests, `npm test` in
`bigapp/` (node's built-in test runner, `--experimental-strip-types`, no
separate build step). No coverage yet for the IMAP/SMTP/MySQL-backed
routes themselves (would need a mocked or containerized integration
harness).

Note on the Docker image: `bigapp/Dockerfile` deliberately avoids
Next.js's `output: 'standalone'` mode -- its dependency-pruned
`node_modules` doesn't trace `scripts/bootstrap-admin.js` (it's invoked
directly via `docker exec`, outside the Next.js request path), so the
image ships full `node_modules` instead.

## Sessions

Login is real IMAP auth, not a separate credential store: `POST
/api/auth/login` opens an IMAP connection with the submitted
email/password (via `withImap`), and only on success creates a session.
Sessions are a **plain in-memory `Map<token, Session>`** in `auth.ts`
(module-level, works because `next start` is a single long-running Node
process, no clustering) -- not JWTs, not Redis, not a DB table:

```ts
Session = { email, password, role: 'super'|'domain'|'user', domain, expires }
```

The plaintext password is kept in the session (needed to open per-request
IMAP/SMTP connections *as that user* -- there's no service account) but
never sent back to the browser after login; the browser only holds the
opaque bearer token. `SESSION_TTL_MINUTES` (`./.env/api.env`, default
120) controls both the initial expiry and the sliding-window renewal on
each authenticated request; a background `setInterval` sweeps expired
entries every 60s.

Implication: session storage is single-replica and wiped on container
restart. Redis is already running when the rspamd overlay is included and
could back sessions instead -- not done yet, see
[`.todo.txt`](./.todo.txt).

## Request flow (typical mail route)

```
browser --Bearer token--> route handler (app/api/mail/...)
  --> requireSession(req)              [auth.ts]
  --> withImap(email, password, fn)    [imap.ts] -- IMAP as the logged-in user
  --> withApiErrors(...)               [handler.ts] -- uniform error shape
```

Admin routes swap `requireSession` for `requireDomainAdmin`/
`requireSuperAdmin` and talk to MySQL (`db.ts`) instead of/in addition to
IMAP. Sending mail (`POST /api/mail/send`) is the one route that also
talks SMTP: it builds the MIME message locally via nodemailer's
`streamTransport` (no network), then sends it through a second transport
pointed at `SMTP_HOST`/`SMTP_PORT` (default `mail_justu_postfix:25`) --
no SMTP auth, Postfix trusts the request purely because it originates
inside the container network (`MYNETWORKS` in `postfix.env`) -- and
best-effort appends a copy to the Sent folder over IMAP.

## Full API surface

See [API.md](./API.md) for the endpoint-by-endpoint reference.
