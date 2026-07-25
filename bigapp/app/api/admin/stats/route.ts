import { NextRequest } from 'next/server'
import { pool } from '@/lib/api/db'
import { requireSuperAdmin } from '@/lib/api/auth'
import { withApiErrors } from '@/lib/api/handler'
import type { RowDataPacket } from 'mysql2'

// See app/api/admin/health/route.ts -- same reasoning.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return withApiErrors(async () => {
    requireSuperAdmin(req)
    const [[{ mailboxCount }]] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS mailboxCount FROM virtual_users')
    const [[{ domainCount }]] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS domainCount FROM virtual_domains')

    let rspamd = null
    try {
      const host = process.env.RSPAMD_HOST || 'mailjustu_rspamd'
      const port = process.env.RSPAMD_PORT || '11334'
      const response = await fetch(`http://${host}:${port}/stat`, {
        headers: { Password: process.env.RSPAMD_CONTROLLER_PASSWORD || '' },
        signal: AbortSignal.timeout(2000),
      })
      if (response.ok) {
        const data = await response.json()
        rspamd = { scanned: data.scanned, learned: data.learned, actions: data.actions, uptime: data.uptime }
      }
    } catch {
      rspamd = null
    }

    return Response.json({ mailboxCount, domainCount, rspamd, rspamdAvailable: rspamd !== null })
  })
}
