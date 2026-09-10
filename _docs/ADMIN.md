# Admin access

No separate admin account system -- an "admin" is a `virtual_users` row
(see [schema.sql](./schema.sql)) with `is_admin = TRUE`, logged in like
any webmail user (real IMAP auth via `/api/auth/login`). Role is computed
at login time in `bigapp/lib/api/auth.ts`, stored nowhere else:

```
role = 'super'   if email in SUPER_ADMIN_EMAILS (./env/api.env)
role = 'domain'  else if virtual_users.is_admin = TRUE for that email
role = 'user'    otherwise
```

Role (plus, for `domain`, the caller's own domain) is stashed in the
in-memory login session and re-checked on every `/api/admin/*` request --
see [ARCHITECTURE.md](./ARCHITECTURE.md#sessions).

## Roles

| Role | Granted by | Scope |
| --- | --- | --- |
| **super** | Email in `SUPER_ADMIN_EMAILS` (`./env/api.env`, comma-separated) | Every domain/mailbox/alias; also Services/health/stats and domain create/delete |
| **domain** | `virtual_users.is_admin = TRUE`, set by a super admin (or the bootstrap script) | Mailboxes/aliases/limits for their own domain only; no Services/health/stats |
| **user** | Default for any mailbox | Webmail only (`/webmail`), no `/api/admin/*` |

No valid session, or a `user`-role session hitting `/api/admin/*` -> `401`.

## Bootstrapping the first admin

No self-serve "become admin" flow -- the first admin is created directly
against the DB, from the host.

**Option A -- `./setup.sh --bootstrap-admin`**

Runs after `docker compose up` when the flag is passed; reads
`SUPER_ADMIN_EMAILS` / `SUPER_ADMIN_PASSWORD` from `./env/api.env` and
calls the same script as Option B. Single admin email only (uses the
first value in each var).

**Option B -- run the script directly**

```bash
docker exec -it mail_justu_server node scripts/bootstrap-admin.js admin@mail.example.com 'somepassword'
```

`bigapp/scripts/bootstrap-admin.js` (self-contained, own `mysql2` pool --
not via `lib/api/db.ts` or Next.js):

1. Normalizes the email; `INSERT IGNORE`s the domain into `virtual_domains`.
2. Mailbox exists -> reset password, set `is_admin = TRUE`. Else -> create
   it with `is_admin = TRUE`.
3. Password stored as `{BLF-CRYPT}<bcrypt hash>` -- the format Dovecot's
   SQL passdb expects, so IMAP login works immediately.

This makes the account a **domain admin** for the email's domain. For
**super admin**:

```bash
# ./env/api.env
SUPER_ADMIN_EMAILS=admin@mail.example.com
```

then recreate the container -- the super-admin check reads
`SUPER_ADMIN_EMAILS` live from env, not a DB column, so an `env/api.env`
edit doesn't take effect until restart:

```bash
docker compose up -d --force-recreate mail_justu_server
```

(Add `-f docker-compose.override.yml` etc. to match how you normally bring
the stack up -- see [SETUP.md](./SETUP.md).)

## Promoting / demoting an existing mailbox

Re-running the bootstrap script resets the password *and* sets
`is_admin = TRUE` -- fine for the first admin, wrong for promoting without
touching the password. Instead:

- **Super admin, via dashboard**: `/admin` -> Mailboxes tab toggle (calls
  `PATCH /api/admin/mailboxes/:id`, see
  [API.md](./API.md#patch-apiadminmailboxesid)).
- **Directly in MySQL**:
  ```sql
  UPDATE virtual_users SET is_admin = TRUE WHERE email = 'someone@mail.example.com';
  ```
  Makes them a **domain** admin only (their existing domain). Super admin
  still needs `SUPER_ADMIN_EMAILS` + container recreate as above.

Demote: reverse it (`is_admin = FALSE` and/or remove from
`SUPER_ADMIN_EMAILS` + recreate).

## Notes / gotchas

- `SUPER_ADMIN_EMAILS` is a flat comma-separated list -- no UI, manual env
  edit + container recreate every time.
- Session TTL (`SESSION_TTL_MINUTES`, `./env/api.env`, default 120) is the
  same for every role -- an idle super-admin session expires like a
  webmail one.
- Removing the last `SUPER_ADMIN_EMAILS` entry doesn't touch the
  `virtual_users` row -- they drop to `domain` (or `user` if `is_admin` is
  also `FALSE`) on next login.
