import { Router } from 'express'
import { ImapFlow } from 'imapflow'
import { createSession, destroySession, isSuperAdminEmail } from '../middleware/auth.js'
import { pool } from '../db.js'

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }
  const normalizedEmail = email.trim().toLowerCase()

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'mailjustu_dovecot',
    port: Number(process.env.IMAP_PORT) || 993,
    secure: true,
    tls: { rejectUnauthorized: false },
    auth: { user: normalizedEmail, pass: password },
    logger: false,
  })

  try {
    await client.connect()
    await client.logout()
  } catch {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const [[row]] = await pool.query(
    `SELECT vu.is_admin, vd.name AS domain
     FROM virtual_users vu JOIN virtual_domains vd ON vu.domain_id = vd.id
     WHERE vu.email = ?`,
    [normalizedEmail],
  )
  const domain = row?.domain || normalizedEmail.split('@')[1]
  const role = isSuperAdminEmail(normalizedEmail) ? 'super' : row?.is_admin ? 'domain' : 'user'

  const token = createSession(normalizedEmail, password, role, domain)
  res.json({ token, email: normalizedEmail, role, domain })
})

authRouter.post('/logout', (req, res) => {
  const [, token] = (req.headers.authorization || '').split(' ')
  if (token) destroySession(token)
  res.json({ ok: true })
})
