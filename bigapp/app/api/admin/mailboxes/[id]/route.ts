import { NextRequest } from 'next/server'
import { pool } from '@/lib/api/db'
import { requireDomainAdmin } from '@/lib/api/auth'
import { apiError, withApiErrors } from '@/lib/api/handler'
import type { RowDataPacket } from 'mysql2'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withApiErrors(async () => {
    const { adminScope } = requireDomainAdmin(req)
    if (adminScope.role !== 'super') {
      return apiError(403, 'Only a super admin can change admin status')
    }
    const { id } = await params
    const { isAdmin } = (await req.json().catch(() => ({}))) || {}
    await pool.query('UPDATE virtual_users SET is_admin = ? WHERE id = ?', [Boolean(isAdmin), id])
    return Response.json({ ok: true })
  })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  return withApiErrors(async () => {
    const { session, adminScope } = requireDomainAdmin(req)
    const { domain } = adminScope
    const { id } = await params
    const [[row]] = await pool.query<RowDataPacket[]>(
      `SELECT vu.email, vd.name AS domain FROM virtual_users vu JOIN virtual_domains vd ON vu.domain_id = vd.id WHERE vu.id = ?`,
      [id],
    )
    if (!row) return apiError(404, 'Mailbox not found')
    if (domain && row.domain !== domain) {
      return apiError(403, 'That mailbox is not on your domain')
    }
    if (row.email === session.email) {
      return apiError(403, "You can't delete your own account -- sign in as another admin to do that")
    }
    await pool.query('DELETE FROM virtual_users WHERE id = ?', [id])
    return Response.json({ ok: true })
  })
}
