# Admin access

There's no separate admin account system -- an "admin" is just a row in
`virtual_users` (see [schema.sql](./schema.sql)) with `is_admin = TRUE`,
logged in the same way as any webmail user: real IMAP auth via
`/api/auth/login`. The role that login resolves to is computed at login
time in `bigapp/lib/api/auth.ts`, not stored anywhere else:

```
role = 'super'   if email is in SUPER_ADMIN_EMAILS (./.env/api.env)
role = 'domain'  else if virtual_users.is_admin = TRUE for that email
role = 'user'    otherwise
```

That role, plus (for `domain`) the caller's own domain, is stashed in the
in-memory session created at login and re-checked on every
`/api/admin/*` request -- see [ARCHITECTURE.md](./ARCHITECTURE.md#sessions).

## Roles

| Role | How it's granted | Scope |
| --- | --- | --- |
| **super** | Email listed in `SUPER_ADMIN_EMAILS` (`./.env/api.env`, comma-separated) | Every domain, mailbox, alias; also Services/health/stats and domain create/delete |
| **domain** | `virtual_users.is_admin = TRUE`, set by a super admin (or the bootstrap script below) | Mailboxes/aliases/limits for their own domain only; never sees Services/health/stats |
| **user** | Default for any mailbox | Webmail only (`/webmail`), no `/api/admin/*` access |

Anyone without a valid session, or a `user`-role session hitting
`/api/admin/*`, gets `401`.

## Bootstrapping the first admin

There's no self-serve "become admin" flow -- the first admin has to be
created directly against the database, from the host.

**Option A -- `./setup.sh --bootstrap-admin`**

Runs automatically after `docker compose up` if you pass the flag; reads
`SUPER_ADMIN_EMAILS` / `SUPER_ADMIN_PASSWORD` out of `./.env/api.env` and
calls the same script as Option B. Only really works for a single admin
email (it uses the first/only value you put in those two vars).

**Option B -- run the script directly**

```bash
docker exec -it mail_justu_server node scripts/bootstrap-admin.js admin@mail.example.com 'somepassword'
```

`bigapp/scripts/bootstrap-admin.js` (self-contained, its own `mysql2`
pool -- doesn't go through `lib/api/db.ts` or Next.js):

1. Normalizes the email, `INSERT IGNORE`s the domain into
   `virtual_domains` if it doesn't exist yet.
2. If the mailbox exists: resets its password and sets `is_admin = TRUE`.
   If not: creates it with `is_admin = TRUE`.
3. Password is stored as `{BLF-CRYPT}<bcrypt hash>` -- the same format
   Dovecot's SQL passdb expects, so the account can log in over IMAP
   immediately.

This alone makes the account a **domain admin** for whatever domain is in
the email. To get **super admin**:

```bash
# ./.env/api.env
SUPER_ADMIN_EMAILS=admin@mail.example.com
```

then recreate the container so it picks up the new env value -- the
super-admin check is `SUPER_ADMIN_EMAILS` read live from env, not a DB
column, so editing `.env/api.env` alone doesn't take effect until the
container restarts:

```bash
docker compose --env-file .env/api.env up -d --force-recreate mail_justu_server
```

(Add `-f docker-compose.override.yml` etc. to match however you normally
bring the stack up -- see [SETUP.md](./SETUP.md).)

## Promoting/demoting an existing mailbox

Re-running the bootstrap script against an existing mailbox resets its
password *and* sets `is_admin = TRUE` -- fine for creating the first
admin, but not what you want for promoting a mailbox without touching its
password. Two other ways:

- **As a super admin, via the dashboard**: `/admin` → Mailboxes tab has
  the toggle (calls `PATCH /api/admin/mailboxes/:id`, see
  [API.md](./API.md#patch-apiadminmailboxesid)).
- **Directly in MySQL**:
  ```sql
  UPDATE virtual_users SET is_admin = TRUE WHERE email = 'someone@mail.example.com';
  ```
  Only makes them a **domain** admin (scoped to their existing domain).
  For super admin, still requires adding them to `SUPER_ADMIN_EMAILS` and
  recreating the container as above.

To demote, do the reverse (`is_admin = FALSE` and/or remove from
`SUPER_ADMIN_EMAILS` + recreate).

## Notes / gotchas

- `SUPER_ADMIN_EMAILS` is a flat comma-separated list -- no UI manages it,
  it's a manual env edit + container recreate every time.
- Session TTL (`SESSION_TTL_MINUTES` in `./.env/api.env`, default 120) is
  the same for every role -- an idle super-admin session expires just
  like a webmail one.
- Deleting the last super admin's `SUPER_ADMIN_EMAILS` entry doesn't
  touch their `virtual_users` row -- they just drop to `domain` (or
  `user`, if `is_admin` is also `FALSE`) on their next login.
