import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

export const mailboxesRouter = Router()
mailboxesRouter.use(requireAdmin)

mailboxesRouter.get('/', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT vu.id, vu.email, vd.name AS domain, vu.created_at
     FROM virtual_users vu JOIN virtual_domains vd ON vu.domain_id = vd.id
     ORDER BY vu.created_at DESC`,
  )
  res.json({ mailboxes: rows })
})

mailboxesRouter.post('/', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }
  const match = /^([^@\s]+)@([^@\s]+)$/.exec(email.trim().toLowerCase())
  if (!match) return res.status(400).json({ error: 'email must look like user@domain' })
  const [, , domain] = match
  const normalizedEmail = match[0]

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [[existingAlias]] = await conn.query('SELECT 1 FROM virtual_aliases WHERE source = ?', [normalizedEmail])
    if (existingAlias) {
      await conn.rollback()
      return res.status(409).json({ error: 'That address is already an alias, not available as a mailbox' })
    }
    await conn.query('INSERT IGNORE INTO virtual_domains (name) VALUES (?)', [domain])
    const [[domainRow]] = await conn.query(
      'SELECT id, max_mailboxes FROM virtual_domains WHERE name = ?',
      [domain],
    )
    const limit = domainRow.max_mailboxes ?? Number(process.env.MAX_MAILBOXES_PER_DOMAIN) ?? null
    if (limit) {
      const [[{ count }]] = await conn.query(
        'SELECT COUNT(*) AS count FROM virtual_users WHERE domain_id = ?',
        [domainRow.id],
      )
      if (count >= limit) {
        await conn.rollback()
        return res.status(409).json({ error: `${domain} is at its mailbox limit (${limit})` })
      }
    }
    const hash = `{BLF-CRYPT}${bcrypt.hashSync(password, 10)}`
    const [result] = await conn.query(
      'INSERT INTO virtual_users (domain_id, email, password) VALUES (?, ?, ?)',
      [domainRow.id, normalizedEmail, hash],
    )
    await conn.commit()
    res.status(201).json({ id: result.insertId, email: normalizedEmail, domain })
  } catch (err) {
    await conn.rollback()
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That mailbox already exists' })
    }
    res.status(500).json({ error: err.message })
  } finally {
    conn.release()
  }
})

mailboxesRouter.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM virtual_users WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})
