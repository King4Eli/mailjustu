import { ImapFlow, type ListResponse } from 'imapflow'

export async function withImap<T>(email: string, password: string, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'mail_justu_dovecot',
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

const SPECIAL_USE_CACHE = new Map<string, string>()

// Resolves e.g. "Archive"/"Trash" to whatever the account's mailbox is
// actually named, via IMAP SPECIAL-USE, with a plain-name fallback.
export async function resolveFolder(client: ImapFlow, email: string, specialUse: string): Promise<string> {
  const cacheKey = `${email}:${specialUse}`
  if (SPECIAL_USE_CACHE.has(cacheKey)) return SPECIAL_USE_CACHE.get(cacheKey)!
  const list = await client.list()
  const match = list.find((box: ListResponse) => box.specialUse === `\\${specialUse}`)
  const path = match ? match.path : specialUse
  if (!match) {
    await client.mailboxCreate(path).catch(() => {})
  }
  SPECIAL_USE_CACHE.set(cacheKey, path)
  return path
}
