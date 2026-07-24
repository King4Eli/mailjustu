import { Router } from 'express'
import { ImapFlow } from 'imapflow'
import { createSession, destroySession } from '../middleware/auth.js'

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'mailjustu_dovecot',
    port: Number(process.env.IMAP_PORT) || 993,
    secure: true,
    tls: { rejectUnauthorized: false },
    auth: { user: email, pass: password },
    logger: false,
  })

  try {
    await client.connect()
    await client.logout()
  } catch {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const token = createSession(email, password)
  res.json({ token, email })
})

authRouter.post('/logout', (req, res) => {
  const [, token] = (req.headers.authorization || '').split(' ')
  if (token) destroySession(token)
  res.json({ ok: true })
})
