import { Router } from 'express'
import { pool } from '../db.js'
import { requireDomainAdmin, requireSuperAdmin } from '../middleware/auth.js'
import { buildDnsRecords } from '../dns.js'

export const domainsRouter = Router()

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

domainsRouter.get('/', requireDomainAdmin, async (req, res) => {
  const { domain } = req.adminScope
  const [rows] = await pool.query(
    `SELECT vd.id, vd.name, vd.max_mailboxes, vd.max_aliases_per_mailbox, vd.quota_mb,
       (SELECT COUNT(*) FROM virtual_users vu WHERE vu.domain_id = vd.id) AS mailboxCount,
       (SELECT COUNT(*) FROM virtual_aliases va WHERE va.domain_id = vd.id) AS aliasCount
     FROM virtual_domains vd
     ${domain ? 'WHERE vd.name = ?' : ''}
     ORDER BY vd.name ASC`,
    domain ? [domain] : [],
  )
  res.json({
    domains: rows.map((row) => ({ ...row, dnsRecords: buildDnsRecords(row.name) })),
    defaults: {
      maxMailboxesPerDomain: Number(process.env.MAX_MAILBOXES_PER_DOMAIN) || null,
      maxAliasesPerMailbox: Number(process.env.MAX_ALIASES_PER_MAILBOX) || null,
      quotaMb: Number(process.env.DEFAULT_MAILBOX_QUOTA_MB) || null,
    },
  })
})

// Creating/deleting a domain is infra-level -- reserved for super admins.
// A domain admin already has "their" domain; there's nothing for them to
// create, and deleting cascades away every mailbox on it.
domainsRouter.post('/', requireSuperAdmin, async (req, res) => {
  const { name, maxMailboxes, maxAliasesPerMailbox, quotaMb } = req.body || {}
  const normalized = (name || '').trim().toLowerCase()
  if (!DOMAIN_RE.test(normalized)) {
    return res.status(400).json({ error: 'name must look like a domain, e.g. mail.example.com' })
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO virtual_domains (name, max_mailboxes, max_aliases_per_mailbox, quota_mb) VALUES (?, ?, ?, ?)',
      [normalized, maxMailboxes || null, maxAliasesPerMailbox || null, quotaMb || null],
    )
    res.status(201).json({ id: result.insertId, name: normalized, dnsRecords: buildDnsRecords(normalized) })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That domain already exists' })
    }
    res.status(500).json({ error: err.message })
  }
})

domainsRouter.patch('/:id', requireDomainAdmin, async (req, res) => {
  const { maxMailboxes, maxAliasesPerMailbox, quotaMb } = req.body || {}
  if (req.adminScope.domain) {
    const [[row]] = await pool.query('SELECT name FROM virtual_domains WHERE id = ?', [req.params.id])
    if (!row || row.name !== req.adminScope.domain) {
      return res.status(403).json({ error: 'You can only edit your own domain' })
    }
  }
  await pool.query(
    'UPDATE virtual_domains SET max_mailboxes = ?, max_aliases_per_mailbox = ?, quota_mb = ? WHERE id = ?',
    [maxMailboxes || null, maxAliasesPerMailbox || null, quotaMb || null, req.params.id],
  )
  res.json({ ok: true })
})

domainsRouter.delete('/:id', requireSuperAdmin, async (req, res) => {
  await pool.query('DELETE FROM virtual_domains WHERE id = ?', [req.params.id])
  res.json({ ok: true })
})
