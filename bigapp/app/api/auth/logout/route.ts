import { NextRequest } from 'next/server'
import { destroySession } from '@/lib/api/auth'

export async function POST(req: NextRequest) {
  const [, token] = (req.headers.get('authorization') || '').split(' ')
  if (token) destroySession(token)
  return Response.json({ ok: true })
}
