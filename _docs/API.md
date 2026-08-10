# API reference

Every route lives under `bigapp/app/api/**/route.ts` and is wrapped in
`withApiErrors()` (`lib/api/handler.ts`): an `ApiAuthError` becomes
`{error}` JSON at that error's status code, anything else is logged and
returns a generic 500 `{error}`. See
[ARCHITECTURE.md](./ARCHITECTURE.md#libapi) for what each `lib/api/*`
module actually does, and [ADMIN.md](./ADMIN.md) for the role model.

## Auth

All non-public routes read a bearer token: `Authorization: Bearer
<token>`, checked against the in-memory session map from
`lib/api/auth.ts`.

- **`requireSession`** -- any logged-in user. 401 if missing/expired.
- **`requireDomainAdmin`** -- role `domain` or `super`. Returns
  `adminScope.domain` = `null` for `super` (unrestricted) or the caller's
  own domain for `domain`.
- **`requireSuperAdmin`** -- role `super` only.

## Auth routes

### `POST /api/auth/login`
Public. Body: `{email, password}`. Opens a real IMAP connection with the
submitted credentials (`withImap`) -- this *is* the auth check, there's
no separate password store. On success, looks up `is_admin`/domain in
MySQL and resolves role (`super` if in `SUPER_ADMIN_EMAILS`, else
`domain` if `is_admin`, else `user`), creates a session.
Response: `{token, email, role, domain}`. `400` missing fields, `401` bad
IMAP auth.

### `POST /api/auth/logout`
Reads its own bearer token, deletes that session. Always `{ok:true}`.

## Mail routes (`requireSession`)

### `GET /api/mail/folders`
IMAP `LIST` + `STATUS`, skips `\Noselect`.
Response: `{folders:[{path,name,specialUse,unseen,messages}]}`

### `POST /api/mail/folders`
Body: `{name}`. Creates an IMAP mailbox. `400` if name contains `/` or
`\`; `409` over `MAX_FOLDERS_PER_MAILBOX`. `201 {ok:true, path}`

### `DELETE /api/mail/folders`
Body: `{path}`. `409` if non-empty. `{ok:true}`

### `GET /api/mail/messages?folder=INBOX`
Last 30 messages, newest first. Each:
`{uid,subject,from,to,cc,date,read,starred,preview,messageId,inReplyTo,references,threadId,attachments}`
(inline `cid:` attachments filtered out of the list). `{folder, messages}`

### `GET /api/mail/messages/[uid]?folder=INBOX`
Fetches one message, marks `\Seen`, parses via `mailparser`.
`{message:{uid,subject,from,to,cc,date,read:true,starred,body,html,messageId,inReplyTo,references,threadId,attachments}}`
(`html` sanitized + `cid:` images inlined as `data:` URIs, see
`mailHtml.ts`). `404` if not found.

### `PATCH /api/mail/messages/[uid]?folder=`
Body: `{flag: 'starred'|'read', value: boolean}`. Sets/clears
`\Flagged`/`\Seen`. `400` on an unknown flag. `{ok:true}`

### `DELETE /api/mail/messages/[uid]?folder=`
Moves to Trash (resolved via SPECIAL-USE); permanently deletes if the
message is already in Trash. `{ok:true}`

### `POST /api/mail/messages/[uid]/move?folder=`
Body: `{to: 'Archive'|'Trash'}`. `400` if `to` missing. `{ok:true}`

### `GET /api/mail/messages/[uid]/attachments/[index]?folder=`
Streams the raw attachment with `Content-Type`/`Content-Disposition`.
`404` if not found. Draft attachments reopen through this same endpoint.

### `POST /api/mail/send`
`multipart/form-data`: `to, cc, bcc, subject, body, from, inReplyTo,
references, attachments[]`. Builds MIME via nodemailer, checks `from` is
the caller's own address or an alias they own (`403` otherwise), `400` if
`to` is missing or the message is entirely empty, sends over SMTP, then
best-effort appends a copy to Sent. `{ok:true, messageId}` -- see
[ARCHITECTURE.md](./ARCHITECTURE.md) for the SMTP path (no auth, trusts
the container network).

### `POST /api/mail/drafts`
`multipart/form-data`: `to, cc, bcc, subject, body, from, draftUid,
draftFolder, attachments[]`. Appends to Drafts (`\Draft` flag); if
`draftUid`+`draftFolder` are given, deletes the prior draft revision
first. `{ok:true, uid, folder}`

### `DELETE /api/mail/drafts/[uid]?folder=Drafts`
`{ok:true}`

### `GET /api/mail/aliases`
Lists aliases whose `destination` is the caller. `{aliases:[{id,source}]}`

### `POST /api/mail/aliases`
Body: `{alias}` (`user@domain`). Must be on the caller's own domain
(`403` otherwise), can't collide with an existing mailbox (`409`),
enforces `max_aliases_per_mailbox`/`MAX_ALIASES_PER_MAILBOX` (`409`).
`201 {id, source}`

### `DELETE /api/mail/aliases/[id]`
Scoped `AND destination = you` -- silently no-ops if it isn't yours.
`{ok:true}`

### `GET /api/mail/usage`
Usage via Dovecot's doveadm HTTP API, quota from
`virtual_domains.quota_mb` or `DEFAULT_MAILBOX_QUOTA_MB`.
`{usedBytes, quotaMb}`

## Admin routes

`requireDomainAdmin` unless noted **super admin only**
(`requireSuperAdmin`).

### `GET /api/admin/mailboxes`
Own domain only unless `super`. Joined with quota +
`storageUsedBytes` (doveadm). `{mailboxes:[...]}`

### `POST /api/admin/mailboxes`
Body: `{email, password, isAdmin}`. `400` missing/bad email; domain
admins restricted to their own domain (`403`); `isAdmin:true` only
honored if the caller is `super`; `409` if the address is already an
alias, or over `max_mailboxes`/`MAX_MAILBOXES_PER_DOMAIN`; auto-creates
the domain row if missing. `201 {id, email, domain, isAdmin}`

### `PATCH /api/admin/mailboxes/[id]`
Body: `{isAdmin?, password?}`. Changing `isAdmin` requires `super`
(`403` otherwise); changing the password requires the target be on the
caller's domain if scoped (`403`). Password stored `{BLF-CRYPT}<bcrypt>`.
`{ok:true}`

### `DELETE /api/admin/mailboxes/[id]`
`404` if not found; `403` if not the caller's domain, or if deleting
their own account. `{ok:true}`

### `GET /api/admin/domains`
Own domain only unless `super`. Includes counts + generated DKIM DNS
records (`dns.ts`). Also returns `defaults:
{maxMailboxesPerDomain, maxAliasesPerMailbox, quotaMb}` from env.

### `POST /api/admin/domains` -- **super admin only**
Body: `{name, maxMailboxes, maxAliasesPerMailbox, quotaMb}`. Validates
domain format, generates a DKIM keypair (`dkim.ts`), `409` on duplicate.
`201 {id, name, dnsRecords}`

### `PATCH /api/admin/domains/[id]`
Body: `{maxMailboxes, maxAliasesPerMailbox, quotaMb}`. `403` if a scoped
caller doesn't own that domain. `{ok:true}`

### `DELETE /api/admin/domains/[id]` -- **super admin only**
Cascades to the domain's mailboxes/aliases. `{ok:true}`

### `GET /api/admin/health` -- **super admin only**
`dynamic='force-dynamic'`. TCP-pings Postfix/Dovecot/Rspamd/OpenDKIM/
ClamAV/MySQL/Redis (1.5s timeout each).
`{services:[{name,detail,optional,status,latencyMs}], summary:{healthy,total,requiredHealthy,requiredTotal}}`

### `GET /api/admin/stats` -- **super admin only**
`dynamic='force-dynamic'`. Mailbox/domain counts from MySQL + Rspamd
`/stat` (best-effort, `null` if unreachable).
`{mailboxCount, domainCount, rspamd, rspamdAvailable}`

## Misc

### `GET /api/ping`
Public. `{ok:true}` -- trivial liveness check.
