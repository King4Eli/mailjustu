import { NextRequest } from 'next/server'
import { simpleParser } from 'mailparser'
import { withImap } from '@/lib/api/imap'
import { requireSession } from '@/lib/api/auth'
import { withApiErrors } from '@/lib/api/handler'
import { computeThreadId, normalizeReferences } from '@/lib/api/threading'

const LIST_LIMIT = 30

function cleanPreview(text: string | undefined) {
  if (!text) return ''
  return text.replace(/\s+/g, ' ').trim().slice(0, 160)
}

export async function GET(req: NextRequest) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req)
    const folder = req.nextUrl.searchParams.get('folder') || 'INBOX'
    const messages = await withImap(email, password, async (client) => {
      const mailbox = await client.mailboxOpen(folder)
      if (mailbox.exists === 0) return []
      const from = Math.max(1, mailbox.exists - LIST_LIMIT + 1)
      const out = []
      for await (const msg of client.fetch(`${from}:*`, {
        envelope: true,
        flags: true,
        uid: true,
        internalDate: true,
        source: true,
      })) {
        const parsed = await simpleParser(msg.source!)
        const envelope = msg.envelope!
        const messageId = parsed.messageId
        const inReplyTo = parsed.inReplyTo
        const references = normalizeReferences(parsed.references)
        out.push({
          uid: msg.uid,
          subject: envelope.subject || '(no subject)',
          from: envelope.from?.[0]
            ? { name: envelope.from[0].name || envelope.from[0].address, email: envelope.from[0].address }
            : { name: 'Unknown', email: '' },
          to: (envelope.to || []).map((t) => t.address),
          cc: (envelope.cc || []).map((t) => t.address),
          date: new Date(msg.internalDate || envelope.date || new Date()).toISOString(),
          read: msg.flags!.has('\\Seen'),
          starred: msg.flags!.has('\\Flagged'),
          preview: cleanPreview(parsed.text),
          messageId,
          inReplyTo,
          references,
          threadId: computeThreadId({ messageId, inReplyTo, references }),
          // Inline (cid-referenced) images render in the body itself, not
          // as a downloadable attachment -- keep the paperclip icon and
          // "Attachments" filter limited to real, separately-listed files.
          attachments: (parsed.attachments || [])
            .map((a, index) => ({ index, name: a.filename || 'attachment', size: `${Math.ceil(a.size / 1024)} KB`, inline: Boolean(a.cid && a.related) }))
            .filter((a) => !a.inline)
            .map(({ index, name, size }) => ({ index, name, size })),
        })
      }
      return out.reverse()
    })
    return Response.json({ folder, messages })
  })
}
