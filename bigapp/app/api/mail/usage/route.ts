import { NextRequest } from 'next/server'
import { pool } from '@/lib/api/db'
import { requireSession } from '@/lib/api/auth'
import { getMailboxUsageBytes } from '@/lib/api/doveadm'
import { withApiErrors } from '@/lib/api/handler'
import type { RowDataPacket } from 'mysql2'

export async function GET(req: NextRequest) {
  return withApiErrors(async () => {
    const { email } = requireSession(req)
    const [[row]] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(vd.quota_mb, ?) AS quota_mb
       FROM virtual_users vu JOIN virtual_domains vd ON vu.domain_id = vd.id
       WHERE vu.email = ?`,
      [Number(process.env.DEFAULT_MAILBOX_QUOTA_MB) || null, email],
    )
    const usedBytes = await getMailboxUsageBytes(email)
    return Response.json({ usedBytes, quotaMb: row?.quota_mb ?? null })
  })
}
