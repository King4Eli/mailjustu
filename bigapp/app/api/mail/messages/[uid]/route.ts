import { NextRequest } from 'next/server'
import { simpleParser } from 'mailparser'
import { withImap, resolveFolder } from '@/lib/api/imap'
import { requireSession } from '@/lib/api/auth'
import { apiError, withApiErrors } from '@/lib/api/handler'
import { htmlToText, renderSafeHtml } from '@/lib/api/mailHtml'
import { computeThreadId, normalizeReferences } from '@/lib/api/threading'

type Ctx = { params: Promise<{ uid: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req)
    const folder = req.nextUrl.searchParams.get('folder') || 'INBOX'
    const uid = Number((await params).uid)
    const message = await withImap(email, password, async (client) => {
      await client.mailboxOpen(folder)
      const msg = await client.fetchOne(uid, { envelope: true, flags: true, source: true }, { uid: true })
      if (!msg) return null
      const parsed = await simpleParser(msg.source!)
      const envelope = msg.envelope!
      await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true }).catch(() => {})
      const messageId = parsed.messageId
      const inReplyTo = parsed.inReplyTo
      const references = normalizeReferences(parsed.references)
      return {
        uid: msg.uid,
        subject: envelope.subject || '(no subject)',
        from: envelope.from?.[0]
          ? { name: envelope.from[0].name || envelope.from[0].address, email: envelope.from[0].address }
          : { name: 'Unknown', email: '' },
        to: (envelope.to || []).map((t) => t.address),
        cc: (envelope.cc || []).map((t) => t.address),
        date: (envelope.date || new Date()).toISOString(),
        read: true,
        starred: msg.flags!.has('\\Flagged'),
        body: parsed.text || (parsed.html ? htmlToText(parsed.html) : ''),
        html: parsed.html ? renderSafeHtml(parsed.html, parsed.attachments || []) : undefined,
        messageId,
        inReplyTo,
        references,
        threadId: computeThreadId({ messageId, inReplyTo, references }),
        // index must match the position in the raw parsed.attachments array --
        // the download endpoint (attachments/[index]) re-parses and indexes
        // into that same unfiltered array -- so filter after mapping, not before.
        attachments: (parsed.attachments || [])
          .map((a, index) => ({ index, name: a.filename || 'attachment', size: `${Math.ceil(a.size / 1024)} KB`, inline: Boolean(a.cid && a.related) }))
          .filter((a) => !a.inline)
          .map(({ index, name, size }) => ({ index, name, size })),
      }
    })
    if (!message) return apiError(404, 'Message not found')
    return Response.json({ message })
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req)
    const folder = req.nextUrl.searchParams.get('folder') || 'INBOX'
    const uid = Number((await params).uid)
    const { flag, value } = (await req.json().catch(() => ({}))) || {}
    const imapFlag = flag === 'starred' ? '\\Flagged' : flag === 'read' ? '\\Seen' : null
    if (!imapFlag) return apiError(400, 'flag must be "starred" or "read"')
    await withImap(email, password, async (client) => {
      await client.mailboxOpen(folder)
      if (value) await client.messageFlagsAdd({ uid }, [imapFlag], { uid: true })
      else await client.messageFlagsRemove({ uid }, [imapFlag], { uid: true })
    })
    return Response.json({ ok: true })
  })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req)
    const folder = req.nextUrl.searchParams.get('folder') || 'INBOX'
    const uid = Number((await params).uid)
    await withImap(email, password, async (client) => {
      const trash = await resolveFolder(client, email, 'Trash')
      await client.mailboxOpen(folder)
      if (folder === trash) {
        await client.messageDelete({ uid }, { uid: true })
      } else {
        await client.messageMove({ uid }, trash, { uid: true })
      }
    })
    return Response.json({ ok: true })
  })
}
