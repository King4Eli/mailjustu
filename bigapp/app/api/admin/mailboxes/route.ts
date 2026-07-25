import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { pool } from '@/lib/api/db'
import { requireDomainAdmin } from '@/lib/api/auth'
import { getMailboxUsageBytes } from '@/lib/api/doveadm'
import { normalizeMailboxEmail } from '@/lib/api/validators'
import { apiError, withApiErrors } from '@/lib/api/handler'
import type { RowDataPacket, ResultSetHeader } from 'mysql2'

export async function GET(req: NextRequest) {
  return withApiErrors(async () => {
    const { adminScope } = requireDomainAdmin(req)
    const { domain } = adminScope
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT vu.id, vu.email, vd.name AS domain, vu.is_admin, vu.created_at,
              COALESCE(vd.quota_mb, ?) AS quota_mb
       FROM virtual_users vu JOIN virtual_domains vd ON vu.domain_id = vd.id
       ${domain ? 'WHERE vd.name = ?' : ''}
       ORDER BY vu.created_at DESC`,
      domain
        ? [Number(process.env.DEFAULT_MAILBOX_QUOTA_MB) || null, domain]
        : [Number(process.env.DEFAULT_MAILBOX_QUOTA_MB) || null],
    )
    const mailboxes = await Promise.all(
      rows.map(async (row) => ({ ...row, storageUsedBytes: await getMailboxUsageBytes(row.email) })),
    )
    return Response.json({ mailboxes })
  })
}

export async function POST(req: NextRequest) {
  return withApiErrors(async () => {
    const { adminScope } = requireDomainAdmin(req)
    const { email, password, isAdmin } = (await req.json().catch(() => ({}))) || {}
    if (!email || !password) {
      return apiError(400, 'email and password are required')
    }
    const normalized = normalizeMailboxEmail(email)
    if (!normalized) return apiError(400, 'email must look like user@domain')
    const { email: normalizedEmail, domain } = normalized

    if (adminScope.domain && domain !== adminScope.domain) {
      return apiError(403, `As a domain admin you can only create mailboxes on ${adminScope.domain}`)
    }
    const grantAdmin = Boolean(isAdmin) && adminScope.role === 'super'

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [[existingAlias]] = await conn.query<RowDataPacket[]>('SELECT 1 FROM virtual_aliases WHERE source = ?', [
        normalizedEmail,
      ])
      if (existingAlias) {
        await conn.rollback()
        return apiError(409, 'That address is already an alias, not available as a mailbox')
      }
      await conn.query('INSERT IGNORE INTO virtual_domains (name) VALUES (?)', [domain])
      const [[domainRow]] = await conn.query<RowDataPacket[]>(
        'SELECT id, max_mailboxes FROM virtual_domains WHERE name = ?',
        [domain],
      )
      const limit = domainRow.max_mailboxes ?? Number(process.env.MAX_MAILBOXES_PER_DOMAIN) ?? null
      if (limit) {
        const [[{ count }]] = await conn.query<RowDataPacket[]>(
          'SELECT COUNT(*) AS count FROM virtual_users WHERE domain_id = ?',
          [domainRow.id],
        )
        if (count >= limit) {
          await conn.rollback()
          return apiError(409, `${domain} is at its mailbox limit (${limit})`)
        }
      }
      const hash = `{BLF-CRYPT}${bcrypt.hashSync(password, 10)}`
      const [result] = await conn.query<ResultSetHeader>(
        'INSERT INTO virtual_users (domain_id, email, password, is_admin) VALUES (?, ?, ?, ?)',
        [domainRow.id, normalizedEmail, hash, grantAdmin],
      )
      await conn.commit()
      return Response.json({ id: result.insertId, email: normalizedEmail, domain, isAdmin: grantAdmin }, { status: 201 })
    } catch (err) {
      await conn.rollback()
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        return apiError(409, 'That mailbox already exists')
      }
      throw err
    } finally {
      conn.release()
    }
  })
}
