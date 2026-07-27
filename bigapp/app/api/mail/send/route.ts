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
    const inReplyTo = (form.get('inReplyTo') as string | null) || undefined
    const referencesRaw = (form.get('references') as string | null) || ''
    const references = referencesRaw.split(/\s+/).filter(Boolean)
    if (!to) return apiError(400, 'to is required')

    let attachments
    try {
      attachments = await parseFormAttachments(form)
    } catch (err) {
      if (err instanceof AttachmentLimitError) return apiError(400, err.message)
      throw err
    }

    if (!subject?.trim() && !body?.trim() && attachments.length === 0) {
      return apiError(400, 'Message is empty -- add a subject, body, or attachment before sending')
    }

    let fromAddress = email
    if (from && from !== email) {
      const [[owned]] = await pool.query<RowDataPacket[]>(
        'SELECT 1 FROM virtual_aliases WHERE source = ? AND destination = ?',
        [from, email],
      )
      if (!owned) return apiError(403, 'You can only send from your own address or an alias you own')
      fromAddress = from
    }

    const mailOptions = {
      from: fromAddress,
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject: subject || '(no subject)',
      text: body || '',
      attachments: attachments.map((f) => ({ filename: f.filename, content: f.content, contentType: f.contentType })),
      messageId: `<${crypto.randomUUID()}@${fromAddress.split('@')[1]}>`,
      inReplyTo,
      references: references.length > 0 ? references : undefined,
    }

    // Compile once (no network I/O) so the exact same MIME source --
    // attachments included -- both goes out over SMTP and gets saved to
    // Sent, instead of building the message twice.
    // buffer: true guarantees a Buffer at runtime; nodemailer's types don't
    // narrow on that option, so they still say Buffer | Readable.
    const compiler = nodemailer.createTransport({ streamTransport: true, buffer: true })
    const { message: raw, messageId } = (await compiler.sendMail(mailOptions)) as { message: Buffer; messageId: string }

    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'mail_justu_postfix',
      port: Number(process.env.SMTP_PORT) || 25,
      secure: false,
      tls: { rejectUnauthorized: false },
    })
    const envelopeTo = [to, cc, bcc]
      .filter(Boolean)
      .join(',')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    await transport.sendMail({ envelope: { from: fromAddress, to: envelopeTo }, raw })

    await withImap(email, password, async (client) => {
      const sent = await resolveFolder(client, email, 'Sent')
      await client.append(sent, raw, ['\\Seen'])
    }).catch(() => {})

    return Response.json({ ok: true, messageId })
  })
}
