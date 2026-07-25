import { NextRequest } from 'next/server'
import { pool } from '@/lib/api/db'
import { requireDomainAdmin, requireSuperAdmin } from '@/lib/api/auth'
import { apiError, withApiErrors } from '@/lib/api/handler'
import type { RowDataPacket } from 'mysql2'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withApiErrors(async () => {
    const { adminScope } = requireDomainAdmin(req)
    const { id } = await params
    const { maxMailboxes, maxAliasesPerMailbox, quotaMb } = (await req.json().catch(() => ({}))) || {}
    if (adminScope.domain) {
      const [[row]] = await pool.query<RowDataPacket[]>('SELECT name FROM virtual_domains WHERE id = ?', [id])
      if (!row || row.name !== adminScope.domain) {
        return apiError(403, 'You can only edit your own domain')
      }
    }
    await pool.query(
      'UPDATE virtual_domains SET max_mailboxes = ?, max_aliases_per_mailbox = ?, quota_mb = ? WHERE id = ?',
      [maxMailboxes || null, maxAliasesPerMailbox || null, quotaMb || null, id],
    )
    return Response.json({ ok: true })
  })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  return withApiErrors(async () => {
    requireSuperAdmin(req)
    const { id } = await params
    await pool.query('DELETE FROM virtual_domains WHERE id = ?', [id])
    return Response.json({ ok: true })
  })
}
