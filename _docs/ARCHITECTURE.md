# Architecture

## Big picture

Four containers (`docker-compose.yml`), one a full app:

```
mail_justu_postfix   -- SMTP in/out (boky/postfix, stock)
mail_justu_dovecot   -- IMAP, mailbox storage on vmail_data (dovecot/dovecot, stock)
mail_justu_server    -- bigapp: /webmail + /admin + /api, one Next.js process
global_mysql         -- external, shared, not owned here
```

Postfix and Dovecot read `virtual_domains`/`virtual_users`/`virtual_aliases`
straight from MySQL (Postfix via `mysql:` maps, Dovecot via SQL
passdb/userdb) -- a mailbox created in bigapp works over SMTP/IMAP
immediately, no separate provisioning. Optional overlays
(`docker-compose.{rspamd,opendkim,clamav}.yml`) add Postfix milters; see
[SETUP.md](./SETUP.md).

**No separate backend service** -- `bigapp` is the only app code. No ORM,
no Express: plain Next.js Route Handlers under `app/api/`, calling into
`lib/api/`.

## `bigapp/` layout

```
app/            Next.js App Router: pages + app/api/**/route.ts (the API)
admin/src/      /admin frontend (operator dashboard) -- original React SPA source
webmail/src/    /webmail frontend + webmail/src/components/ -- original React SPA source
lib/api/        Shared server-side logic the route handlers call into
scripts/        One-off ops scripts run via `docker exec`, not through Next.js
public/         Static assets
```

`app/admin/` and `app/webmail/` are thin `'use client'` wrappers
(`layout.tsx`, `page.tsx`, `AdminRoot.tsx`/`WebmailRoot.tsx`) that mount
the *original* React SPA code in the sibling `admin/src/` and `webmail/src/`
(`app/admin/AdminRoot.tsx` -> `import App from '../../admin/src/App'`).
Those were standalone SPAs before the Express->Next.js migration, now
embedded as client components (both use `localStorage`/`window`).
`next.config.ts` redirects `/` -> `/webmail`.

One process, one container: `/admin` and `/webmail` are two React
frontends served from the same origin as the API.

## `lib/api/`

| File | Responsibility |
| --- | --- |
| `auth.ts` | Session map; login role resolution (`super`/`domain`/`user`); `requireSession`/`requireDomainAdmin`/`requireSuperAdmin` guards -- see [ADMIN.md](./ADMIN.md) |
| `db.ts` | The one `mysql2/promise` pool (`DB_*`), reused across all admin/mail routes |
| `imap.ts` | `withImap()` -- one IMAP connection per request as the logged-in user's own credentials (no service account); plus SPECIAL-USE folder resolution (Archive/Trash/etc.) |
| `doveadm.ts` | Dovecot `doveadm` HTTP API (`DOVEADM_HOST`/`DOVEADM_PORT`, Basic auth via `DOVEADM_PASSWORD`) for on-disk mailbox usage (`vsize` summed across folders); fails soft (`null`) if unreachable. Overrides outgoing `Host` header (Dovecot rejects the underscored `mail_justu_dovecot`) |
| `attachments.ts` | Attachment parsing + limits (`MAX_ATTACHMENTS_PER_MESSAGE`, `MAX_ATTACHMENT_SIZE_MB`) |
| `mailHtml.ts` | Sanitizes received HTML mail (`sanitize-html`); rewrites `cid:` inline images to `data:` URIs |
| `threading.ts` | Groups messages into conversations via References/In-Reply-To chains |
| `dkim.ts` | Per-domain DKIM keypairs (stored in `virtual_domains.dkim_private_key`/`dkim_public_key`); signing done by OpenDKIM, synced by the separate `dkim-sync` sidecar |
| `dns.ts` | Copy-pasteable MX/A/SPF/DMARC/DKIM records for a domain, from `MAIL_HOSTNAME`/`MAIL_PUBLIC_IP` |
| `handler.ts` | `withApiErrors()` -- catch-all mirroring the pre-migration Express error middleware; `ApiAuthError` -> its status code, else -> logged 500 |
| `validators.ts` | Dependency-free validation (email/domain normalization, folder name checks); kept DB/IMAP-free so it's unit-testable |

`lib/api/__tests__/` (`auth.test.ts`, `validators.test.ts`) covers the
DB/IMAP-free logic -- 9 tests, `npm test` in `bigapp/` (node's built-in
runner, `--experimental-strip-types`, no build step). No coverage yet for
the IMAP/SMTP/MySQL-backed routes (needs a mocked or containerized
harness).

Docker image: `bigapp/Dockerfile` avoids Next.js `output: 'standalone'` --
its pruned `node_modules` doesn't trace `scripts/bootstrap-admin.js`
(invoked via `docker exec`, outside the request path), so the image ships
full `node_modules`.

## Sessions

Login is real IMAP auth, no separate credential store: `POST
/api/auth/login` opens an IMAP connection with the submitted
email/password (`withImap`), creates a session only on success. Sessions
are a **plain in-memory `Map<token, Session>`** in `auth.ts` (module-level,
works because `next start` is one long-running process, no clustering) --
not JWTs, not Redis, not a DB table:

```ts
Session = { email, password, role: 'super'|'domain'|'user', domain, expires }
```

Plaintext password stays in the session (needed to open per-request
IMAP/SMTP as that user -- no service account), never sent back to the
browser; the browser holds only the opaque bearer token.
`SESSION_TTL_MINUTES` (`./env/api.env`, default 120) sets both initial
expiry and the sliding-window renewal per authenticated request; a
background `setInterval` sweeps expired entries every 60s.

Implication: session storage is single-replica, wiped on container
restart. Redis (already up with the rspamd overlay) could back sessions --
not done yet, see [`.todo.txt`](./.todo.txt).

## Request flow (typical mail route)

```
browser --Bearer token--> route handler (app/api/mail/...)
  --> requireSession(req)              [auth.ts]
  --> withImap(email, password, fn)    [imap.ts] -- IMAP as the logged-in user
  --> withApiErrors(...)               [handler.ts] -- uniform error shape
```

Admin routes swap `requireSession` for `requireDomainAdmin`/
`requireSuperAdmin` and talk to MySQL (`db.ts`) instead of / in addition
to IMAP. Sending mail (`POST /api/mail/send`) is the one route that also
talks SMTP: builds the MIME message locally via nodemailer
`streamTransport` (no network), then sends via a second transport to
`SMTP_HOST`/`SMTP_PORT` (default `mail_justu_postfix:25`) -- no SMTP auth,
Postfix trusts it because it originates inside the container network
(`MYNETWORKS` in `postfix.env`) -- then best-effort appends a copy to Sent
over IMAP.

## Full API surface

See [API.md](./API.md).
