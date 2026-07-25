import { NextRequest } from 'next/server'
import { withImap } from '@/lib/api/imap'
import { createSession, isSuperAdminEmail } from '@/lib/api/auth'
import { pool } from '@/lib/api/db'
import { apiError, withApiErrors } from '@/lib/api/handler'
import type { RowDataPacket } from 'mysql2'

export async function POST(req: NextRequest) {
  return withApiErrors(async () => {
    const { email, password } = (await req.json().catch(() => ({}))) || {}
    if (!email || !password) {
      return apiError(400, 'email and password are required')
    }
    const normalizedEmail = email.trim().toLowerCase()

    try {
      await withImap(normalizedEmail, password, async () => {})
    } catch (err) {
      console.error('IMAP login failed for', normalizedEmail, err)
      return apiError(401, 'Invalid email or password')
    }

    const [[row]] = await pool.query<RowDataPacket[]>(
      `SELECT vu.is_admin, vd.name AS domain
       FROM virtual_users vu JOIN virtual_domains vd ON vu.domain_id = vd.id
       WHERE vu.email = ?`,
      [normalizedEmail],
    )
    const record = (row as { is_admin?: boolean; domain?: string } | undefined) || undefined
    const domain = record?.domain || normalizedEmail.split('@')[1]
    const role = isSuperAdminEmail(normalizedEmail) ? 'super' : record?.is_admin ? 'domain' : 'user'

    const token = createSession(normalizedEmail, password, role, domain)
    return Response.json({ token, email: normalizedEmail, role, domain })
  })
}
