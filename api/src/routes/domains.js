import { Router } from 'express'
import { pool } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import { buildDnsRecords } from '../dns.js'

export const domainsRouter = Router()
domainsRouter.use(requireAdmin)

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

domainsRouter.get('/', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT vd.id, vd.name, vd.max_mailboxes, vd.max_aliases_per_mailbox,
       (SELECT COUNT(*) FROM virtual_users vu WHERE vu.domain_id = vd.id) AS mailboxCount,
       (SELECT COUNT(*) FROM virtual_aliases va WHERE va.domain_id = vd.id) AS aliasCount
     FROM virtual_domains vd
     ORDER BY vd.name ASC`,
  )
  res.json({
    domains: rows.map((row) => ({ ...row, dnsRecords: buildDnsRecords(row.name) })),
    defaults: {
      maxMailboxesPerDomain: Number(process.env.MAX_MAILBOXES_PER_DOMAIN) || null,
      maxAliasesPerMailbox: Number(process.env.MAX_ALIASES_PER_MAILBOX) || null,
    },
  })
})

domainsRouter.post('/', async (req, res) => {
  const { name, maxMailboxes, maxAliasesPerMailbox } = req.body || {}
  const normalized = (name || '').trim().toLowerCase()
  if (!DOMAIN_RE.test(normalized)) {
    return res.status(400).json({ error: 'name must look like a domain, e.g. mail.example.com' })
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO virtual_domains (name, max_mailboxes, max_aliases_per_mailbox) VALUES (?, ?, ?)',
      [normalized, maxMailboxes ?? null, maxAliasesPerMailbox ?? null],
    )
    res.status(201).json({ id: result.insertId, name: normalized, dnsRecords: buildDnsRecords(normalized) })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That domain already exists' })
    }
    res.status(500).json({ error: err.message })
  }
})

domainsRouter.patch('/:id', async (req, res) => {
  const { maxMailboxes, maxAliasesPerMailbox } = req.body || {}
  await pool.query('UPDATE virtual_domains SET max_mailboxes = ?, max_aliases_per_mailbox = ? WHERE id = ?', [
    maxMailboxes ?? null,
    maxAliasesPerMailbox ?? null,
    req.params.id,
  ])
  res.json({ ok: true })
})

domainsRouter.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM virtual_domains WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})
