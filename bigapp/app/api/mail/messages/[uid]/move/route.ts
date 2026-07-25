import { NextRequest } from 'next/server'
import { withImap, resolveFolder } from '@/lib/api/imap'
import { requireSession } from '@/lib/api/auth'
import { apiError, withApiErrors } from '@/lib/api/handler'

export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req)
    const folder = req.nextUrl.searchParams.get('folder') || 'INBOX'
    const uid = Number((await params).uid)
    const { to } = (await req.json().catch(() => ({}))) || {}
    if (!to) return apiError(400, 'to (Archive|Trash) is required')
    await withImap(email, password, async (client) => {
      await client.mailboxOpen(folder)
      const target = await resolveFolder(client, email, to)
      await client.messageMove({ uid }, target, { uid: true })
    })
    return Response.json({ ok: true })
  })
}
