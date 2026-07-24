import { ImapFlow } from 'imapflow'

export async function withImap(email, password, fn) {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'mailjustu_dovecot',
    port: Number(process.env.IMAP_PORT) || 993,
    secure: true,
    tls: { rejectUnauthorized: false },
    auth: { user: email, pass: password },
    logger: false,
  })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.logout().catch(() => client.close())
  }
}

const SPECIAL_USE_CACHE = new Map()

// Resolves e.g. "Archive"/"Trash" to whatever the account's mailbox is
// actually named, via IMAP SPECIAL-USE, with a plain-name fallback.
export async function resolveFolder(client, email, specialUse) {
  const cacheKey = `${email}:${specialUse}`
  if (SPECIAL_USE_CACHE.has(cacheKey)) return SPECIAL_USE_CACHE.get(cacheKey)
  const list = await client.list()
  const match = list.find((box) => box.specialUse === `\\${specialUse}`)
  const path = match ? match.path : specialUse
  if (!match) {
    await client.mailboxCreate(path).catch(() => {})
  }
  SPECIAL_USE_CACHE.set(cacheKey, path)
  return path
}
