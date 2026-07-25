import { NextRequest } from 'next/server'
import crypto from 'node:crypto'
import nodemailer from 'nodemailer'
import { withImap, resolveFolder } from '@/lib/api/imap'
import { requireSession } from '@/lib/api/auth'
import { pool } from '@/lib/api/db'
import { AttachmentLimitError, parseFormAttachments } from '@/lib/api/attachments'
import { apiError, withApiErrors } from '@/lib/api/handler'
import type { RowDataPacket } from 'mysql2'

export async function POST(req: NextRequest) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req)
    const form = await req.formData()
    const to = form.get('to') as string | null
    const cc = form.get('cc') as string | null
    const bcc = form.get('bcc') as string | null
    const subject = form.get('subject') as string | null
    const body = form.get('body') as string | null
    const from = form.get('from') as string | null
    const draftUid = form.get('draftUid') as string | null
    const draftFolder = form.get('draftFolder') as string | null

    let attachments
    try {
      attachments = await parseFormAttachments(form)
    } catch (err) {
      if (err instanceof AttachmentLimitError) return apiError(400, err.message)
      throw err
    }

    let fromAddress = email
    if (from && from !== email) {
      const [[owned]] = await pool.query<RowDataPacket[]>(
        'SELECT 1 FROM virtual_aliases WHERE source = ? AND destination = ?',
        [from, email],
      )
      if (owned) fromAddress = from
    }

    const mailOptions = {
      from: fromAddress,
      to: to || undefined,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject: subject || '(no subject)',
      text: body || '',
      attachments: attachments.map((f) => ({ filename: f.filename, content: f.content, contentType: f.contentType })),
      messageId: `<${crypto.randomUUID()}@${fromAddress.split('@')[1]}>`,
    }

    // buffer: true guarantees a Buffer at runtime; nodemailer's types don't
    // narrow on that option, so they still say Buffer | Readable.
    const compiler = nodemailer.createTransport({ streamTransport: true, buffer: true })
    const { message: raw } = (await compiler.sendMail(mailOptions)) as { message: Buffer }

    const result = await withImap(email, password, async (client) => {
      const draftsFolder = await resolveFolder(client, email, 'Drafts')
      const appended = await client.append(draftsFolder, raw, ['\\Draft'])
      if (!appended) throw new Error('Failed to save draft')
      if (draftUid && draftFolder) {
        await client.mailboxOpen(draftFolder)
        await client.messageDelete({ uid: Number(draftUid) }, { uid: true }).catch(() => {})
      }
      return { uid: appended.uid, folder: draftsFolder }
    })

    return Response.json({ ok: true, ...result })
  })
}
