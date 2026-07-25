import { NextRequest } from 'next/server'
import { pool } from '@/lib/api/db'
import { requireDomainAdmin, requireSuperAdmin } from '@/lib/api/auth'
import { buildDnsRecords } from '@/lib/api/dns'
import { apiError, withApiErrors } from '@/lib/api/handler'
import type { RowDataPacket, ResultSetHeader } from 'mysql2'

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

export async function GET(req: NextRequest) {
  return withApiErrors(async () => {
    const { adminScope } = requireDomainAdmin(req)
    const { domain } = adminScope
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT vd.id, vd.name, vd.max_mailboxes, vd.max_aliases_per_mailbox, vd.quota_mb,
         (SELECT COUNT(*) FROM virtual_users vu WHERE vu.domain_id = vd.id) AS mailboxCount,
         (SELECT COUNT(*) FROM virtual_aliases va WHERE va.domain_id = vd.id) AS aliasCount
       FROM virtual_domains vd
       ${domain ? 'WHERE vd.name = ?' : ''}
       ORDER BY vd.name ASC`,
      domain ? [domain] : [],
    )
    return Response.json({
      domains: rows.map((row) => ({ ...row, dnsRecords: buildDnsRecords(row.name) })),
      defaults: {
        maxMailboxesPerDomain: Number(process.env.MAX_MAILBOXES_PER_DOMAIN) || null,
        maxAliasesPerMailbox: Number(process.env.MAX_ALIASES_PER_MAILBOX) || null,
        quotaMb: Number(process.env.DEFAULT_MAILBOX_QUOTA_MB) || null,
      },
    })
  })
}

// Creating/deleting a domain is infra-level -- reserved for super admins.
// A domain admin already has "their" domain; there's nothing for them to
// create, and deleting cascades away every mailbox on it.
export async function POST(req: NextRequest) {
  return withApiErrors(async () => {
    requireSuperAdmin(req)
    const { name, maxMailboxes, maxAliasesPerMailbox, quotaMb } = (await req.json().catch(() => ({}))) || {}
    const normalized = (name || '').trim().toLowerCase()
    if (!DOMAIN_RE.test(normalized)) {
      return apiError(400, 'name must look like a domain, e.g. mail.example.com')
    }
    try {
      const [result] = await pool.query<ResultSetHeader>(
        'INSERT INTO virtual_domains (name, max_mailboxes, max_aliases_per_mailbox, quota_mb) VALUES (?, ?, ?, ?)',
        [normalized, maxMailboxes || null, maxAliasesPerMailbox || null, quotaMb || null],
      )
      return Response.json(
        { id: result.insertId, name: normalized, dnsRecords: buildDnsRecords(normalized) },
        { status: 201 },
      )
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        return apiError(409, 'That domain already exists')
      }
      throw err
    }
  })
}
