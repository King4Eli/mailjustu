import { Router } from 'express'
import { pool } from '../db.js'
import { requireSession } from '../middleware/auth.js'

export const aliasesRouter = Router()
aliasesRouter.use(requireSession)

aliasesRouter.get('/', async (req, res) => {
  const { email } = req.mailSession
  const [rows] = await pool.query(
    'SELECT id, source FROM virtual_aliases WHERE destination = ? ORDER BY id DESC',
    [email],
  )
  res.json({ aliases: rows })
})

aliasesRouter.post('/', async (req, res) => {
  const { email } = req.mailSession
  const { alias } = req.body || {}
  const match = /^([^@\s]+)@([^@\s]+)$/.exec((alias || '').trim().toLowerCase())
  if (!match) return res.status(400).json({ error: 'alias must look like user@domain' })
  const [source, , domain] = match
  if (source === email) return res.status(400).json({ error: 'That is already your primary address' })

  // Aliases can only be created on your own domain -- not "anything".
  const ownDomain = email.split('@')[1]
  if (domain !== ownDomain) {
    return res.status(403).json({ error: `Aliases must be on your own domain (${ownDomain})` })
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [[existingMailbox]] = await conn.query('SELECT 1 FROM virtual_users WHERE email = ?', [source])
    if (existingMailbox) {
      await conn.rollback()
      return res.status(409).json({ error: 'That address is already a mailbox, not available as an alias' })
    }

    const [[domainRow]] = await conn.query(
      'SELECT id, max_aliases_per_mailbox FROM virtual_domains WHERE name = ?',
      [ownDomain],
    )
    const limit = domainRow.max_aliases_per_mailbox ?? Number(process.env.MAX_ALIASES_PER_MAILBOX) ?? null
    if (limit) {
      const [[{ count }]] = await conn.query(
        'SELECT COUNT(*) AS count FROM virtual_aliases WHERE destination = ?',
        [email],
      )
      if (count >= limit) {
        await conn.rollback()
        return res.status(409).json({ error: `You're at your alias limit (${limit})` })
      }
    }

    const [result] = await conn.query(
      'INSERT INTO virtual_aliases (domain_id, source, destination) VALUES (?, ?, ?)',
      [domainRow.id, source, email],
    )
    await conn.commit()
    res.status(201).json({ id: result.insertId, source })
  } catch (err) {
    await conn.rollback()
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That alias already exists' })
    }
    res.status(500).json({ error: err.message })
  } finally {
    conn.release()
  }
})

aliasesRouter.delete('/:id', async (req, res) => {
  const { email } = req.mailSession
  // Ownership check: only ever delete an alias that actually points at you.
  await pool.query('DELETE FROM virtual_aliases WHERE id = ? AND destination = ?', [req.params.id, email])
  res.json({ ok: true })
})
