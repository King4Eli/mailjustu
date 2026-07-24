import { Router } from 'express'
import nodemailer from 'nodemailer'
import { simpleParser } from 'mailparser'
import { withImap, resolveFolder } from '../imap.js'
import { requireSession } from '../middleware/auth.js'

export const mailRouter = Router()
mailRouter.use(requireSession)

const LIST_LIMIT = 30

function cleanPreview(text) {
  if (!text) return ''
  return text.replace(/\s+/g, ' ').trim().slice(0, 160)
}

mailRouter.get('/folders', async (req, res) => {
  const { email, password } = req.mailSession
  try {
    const folders = await withImap(email, password, async (client) => {
      const list = await client.list()
      return Promise.all(
        list
          .filter((box) => !box.flags?.has('\\Noselect'))
          .map(async (box) => {
            const status = await client.status(box.path, { unseen: true, messages: true }).catch(() => null)
            return {
              path: box.path,
              name: box.name,
              specialUse: box.specialUse || null,
              unseen: status?.unseen ?? 0,
              messages: status?.messages ?? 0,
            }
          }),
      )
    })
    res.json({ folders })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

mailRouter.get('/messages', async (req, res) => {
  const { email, password } = req.mailSession
  const folder = req.query.folder || 'INBOX'
  try {
    const messages = await withImap(email, password, async (client) => {
      const mailbox = await client.mailboxOpen(folder)
      if (mailbox.exists === 0) return []
      const from = Math.max(1, mailbox.exists - LIST_LIMIT + 1)
      const out = []
      for await (const msg of client.fetch(`${from}:*`, { envelope: true, flags: true, uid: true, internalDate: true, source: true })) {
        const parsed = await simpleParser(msg.source)
        out.push({
          uid: msg.uid,
          subject: msg.envelope.subject || '(no subject)',
          from: msg.envelope.from?.[0]
            ? { name: msg.envelope.from[0].name || msg.envelope.from[0].address, email: msg.envelope.from[0].address }
            : { name: 'Unknown', email: '' },
          to: (msg.envelope.to || []).map((t) => t.address),
          date: (msg.internalDate || msg.envelope.date || new Date()).toISOString(),
          read: msg.flags.has('\\Seen'),
          starred: msg.flags.has('\\Flagged'),
          preview: cleanPreview(parsed.text),
          attachments: (parsed.attachments || []).map((a) => ({ name: a.filename || 'attachment', size: `${Math.ceil(a.size / 1024)} KB` })),
        })
      }
      return out.reverse()
    })
    res.json({ folder, messages })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

mailRouter.get('/messages/:uid', async (req, res) => {
  const { email, password } = req.mailSession
  const folder = req.query.folder || 'INBOX'
  const uid = Number(req.params.uid)
  try {
    const message = await withImap(email, password, async (client) => {
      await client.mailboxOpen(folder)
      const msg = await client.fetchOne(uid, { envelope: true, flags: true, source: true }, { uid: true })
      if (!msg) return null
      const parsed = await simpleParser(msg.source)
      await client.messageFlagsAdd({ uid, folder }, ['\\Seen'], { uid: true }).catch(() => {})
      return {
        uid: msg.uid,
        subject: msg.envelope.subject || '(no subject)',
        from: msg.envelope.from?.[0]
          ? { name: msg.envelope.from[0].name || msg.envelope.from[0].address, email: msg.envelope.from[0].address }
          : { name: 'Unknown', email: '' },
        to: (msg.envelope.to || []).map((t) => t.address),
        date: (msg.envelope.date || new Date()).toISOString(),
        read: true,
        starred: msg.flags.has('\\Flagged'),
        body: parsed.text || parsed.html || '',
        attachments: (parsed.attachments || []).map((a) => ({ name: a.filename || 'attachment', size: `${Math.ceil(a.size / 1024)} KB` })),
      }
    })
    if (!message) return res.status(404).json({ error: 'Message not found' })
    res.json({ message })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

mailRouter.patch('/messages/:uid', async (req, res) => {
  const { email, password } = req.mailSession
  const folder = req.query.folder || 'INBOX'
  const uid = Number(req.params.uid)
  const { flag, value } = req.body || {}
  const imapFlag = flag === 'starred' ? '\\Flagged' : flag === 'read' ? '\\Seen' : null
  if (!imapFlag) return res.status(400).json({ error: 'flag must be "starred" or "read"' })
  try {
    await withImap(email, password, async (client) => {
      await client.mailboxOpen(folder)
      if (value) await client.messageFlagsAdd({ uid, folder }, [imapFlag], { uid: true })
      else await client.messageFlagsRemove({ uid, folder }, [imapFlag], { uid: true })
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

mailRouter.post('/messages/:uid/move', async (req, res) => {
  const { email, password } = req.mailSession
  const folder = req.query.folder || 'INBOX'
  const uid = Number(req.params.uid)
  const { to } = req.body || {}
  if (!to) return res.status(400).json({ error: 'to (Archive|Trash) is required' })
  try {
    await withImap(email, password, async (client) => {
      await client.mailboxOpen(folder)
      const target = await resolveFolder(client, email, to)
      await client.messageMove({ uid, folder }, target, { uid: true })
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

mailRouter.delete('/messages/:uid', async (req, res) => {
  const { email, password } = req.mailSession
  const folder = req.query.folder || 'INBOX'
  const uid = Number(req.params.uid)
  try {
    await withImap(email, password, async (client) => {
      const trash = await resolveFolder(client, email, 'Trash')
      await client.mailboxOpen(folder)
      if (folder === trash) {
        await client.messageDelete({ uid, folder }, { uid: true })
      } else {
        await client.messageMove({ uid, folder }, trash, { uid: true })
      }
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

mailRouter.post('/send', async (req, res) => {
  const { email, password } = req.mailSession
  const { to, subject, body } = req.body || {}
  if (!to) return res.status(400).json({ error: 'to is required' })

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mailjustu_postfix',
    port: Number(process.env.SMTP_PORT) || 25,
    secure: false,
    tls: { rejectUnauthorized: false },
  })

  try {
    const info = await transport.sendMail({ from: email, to, subject: subject || '(no subject)', text: body || '' })

    await withImap(email, password, async (client) => {
      const sent = await resolveFolder(client, email, 'Sent')
      const message = [
        `From: ${email}`,
        `To: ${to}`,
        `Subject: ${subject || '(no subject)'}`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: ${info.messageId}`,
        '',
        body || '',
      ].join('\r\n')
      await client.append(sent, message, ['\\Seen'])
    }).catch(() => {})

    res.json({ ok: true, messageId: info.messageId })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
