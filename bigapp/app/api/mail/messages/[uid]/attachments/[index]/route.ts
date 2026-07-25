import { NextRequest } from 'next/server'
import { simpleParser } from 'mailparser'
import { withImap } from '@/lib/api/imap'
import { requireSession } from '@/lib/api/auth'
import { apiError, withApiErrors } from '@/lib/api/handler'

export async function GET(req: NextRequest, { params }: { params: Promise<{ uid: string; index: string }> }) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req)
    const folder = req.nextUrl.searchParams.get('folder') || 'INBOX'
    const { uid: uidParam, index: indexParam } = await params
    const uid = Number(uidParam)
    const index = Number(indexParam)
    const attachment = await withImap(email, password, async (client) => {
      await client.mailboxOpen(folder)
      const msg = await client.fetchOne(uid, { source: true }, { uid: true })
      if (!msg) return null
      const parsed = await simpleParser(msg.source!)
      return (parsed.attachments || [])[index] || null
    })
    if (!attachment) return apiError(404, 'Attachment not found')
    return new Response(new Uint8Array(attachment.content), {
      headers: {
        'Content-Type': attachment.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${(attachment.filename || 'attachment').replace(/"/g, '')}"`,
      },
    })
  })
}
