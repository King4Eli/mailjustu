import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../db.js'
import { requireDomainAdmin } from '../middleware/auth.js'
import { getMailboxUsageBytes } from '../doveadm.js'

export const mailboxesRouter = Router()
mailboxesRouter.use(requireDomainAdmin)

mailboxesRouter.get('/', async (req, res) => {
  const { domain } = req.adminScope
  const [rows] = await pool.query(
    `SELECT vu.id, vu.email, vd.name AS domain, vu.is_admin, vu.created_at,
            COALESCE(vd.quota_mb, ?) AS quota_mb
     FROM virtual_users vu JOIN virtual_domains vd ON vu.domain_id = vd.id
     ${domain ? 'WHERE vd.name = ?' : ''}
     ORDER BY vu.created_at DESC`,
    domain ? [Number(process.env.DEFAULT_MAILBOX_QUOTA_MB) || null, domain] : [Number(process.env.DEFAULT_MAILBOX_QUOTA_MB) || null],
  )
  const mailboxes = await Promise.all(
    rows.map(async (row) => ({ ...row, storageUsedBytes: await getMailboxUsageBytes(row.email) })),
  )
  res.json({ mailboxes })
})

mailboxesRouter.post('/', async (req, res) => {
  const { email, password, isAdmin } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }
  const match = /^([^@\s]+)@([^@\s]+)$/.exec(email.trim().toLowerCase())
  if (!match) return res.status(400).json({ error: 'email must look like user@domain' })
  const [, , domain] = match
  const normalizedEmail = match[0]

  if (req.adminScope.domain && domain !== req.adminScope.domain) {
    return res.status(403).json({ error: `As a domain admin you can only create mailboxes on ${req.adminScope.domain}` })
  }
  const grantAdmin = Boolean(isAdmin) && req.adminScope.role === 'super'

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
      'INSERT INTO virtual_users (domain_id, email, password, is_admin) VALUES (?, ?, ?, ?)',
      [domainRow.id, normalizedEmail, hash, grantAdmin],
    )
    await conn.commit()
    res.status(201).json({ id: result.insertId, email: normalizedEmail, domain, isAdmin: grantAdmin })
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

mailboxesRouter.patch('/:id', async (req, res) => {
  if (req.adminScope.role !== 'super') {
    return res.status(403).json({ error: 'Only a super admin can change admin status' })
  }
  const { isAdmin } = req.body || {}
  await pool.query('UPDATE virtual_users SET is_admin = ? WHERE id = ?', [Boolean(isAdmin), req.params.id])
  res.json({ ok: true })
})

mailboxesRouter.delete('/:id', async (req, res) => {
  const { domain } = req.adminScope
  if (domain) {
    const [[row]] = await pool.query(
      `SELECT vd.name AS domain FROM virtual_users vu JOIN virtual_domains vd ON vu.domain_id = vd.id WHERE vu.id = ?`,
      [req.params.id],
    )
    if (!row || row.domain !== domain) {
      return res.status(403).json({ error: 'That mailbox is not on your domain' })
    }
  }
  await pool.query('DELETE FROM virtual_users WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})
