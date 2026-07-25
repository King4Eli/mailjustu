import { NextRequest } from 'next/server'
import { withImap } from '@/lib/api/imap'
import { requireSession } from '@/lib/api/auth'
import { isValidFolderName } from '@/lib/api/validators'
import { apiError, withApiErrors } from '@/lib/api/handler'

export async function GET(req: NextRequest) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req)
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
    return Response.json({ folders })
  })
}

export async function POST(req: NextRequest) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req)
    const { name } = (await req.json().catch(() => ({}))) || {}
    if (!isValidFolderName(name)) return apiError(400, 'name is required and cannot contain / or \\')
    const limit = Number(process.env.MAX_FOLDERS_PER_MAILBOX) || null
    try {
      await withImap(email, password, async (client) => {
        if (limit) {
          const list = await client.list()
          const customCount = list.filter((box) => !box.specialUse).length
          if (customCount >= limit) {
            throw Object.assign(
              new Error(`You're at the limit of ${limit} custom folders. Delete one before creating another.`),
              { overLimit: true },
            )
          }
        }
        await client.mailboxCreate(name)
      })
      return Response.json({ ok: true, path: name }, { status: 201 })
    } catch (err) {
      return apiError((err as { overLimit?: boolean }).overLimit ? 409 : 500, (err as Error).message)
    }
  })
}

export async function DELETE(req: NextRequest) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req)
    const { path: folderPath } = (await req.json().catch(() => ({}))) || {}
    if (!folderPath) return apiError(400, 'path is required')
    try {
      await withImap(email, password, async (client) => {
        const status = await client.status(folderPath, { messages: true })
        if (status.messages && status.messages > 0) {
          throw Object.assign(
            new Error(
              `"${folderPath}" isn't empty (${status.messages} message${status.messages === 1 ? '' : 's'}). Move or delete its messages first.`,
            ),
            { notEmpty: true },
          )
        }
        await client.mailboxDelete(folderPath)
      })
      return Response.json({ ok: true })
    } catch (err) {
      return apiError((err as { notEmpty?: boolean }).notEmpty ? 409 : 500, (err as Error).message)
    }
  })
}
