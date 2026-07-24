import crypto from 'node:crypto'

const sessions = new Map()
const SESSION_TTL_MS = (Number(process.env.SESSION_TTL_MINUTES) || 120) * 60 * 1000

export function createSession(email, password) {
  const token = crypto.randomUUID()
  sessions.set(token, { email, password, expires: Date.now() + SESSION_TTL_MS })
  return token
}

export function destroySession(token) {
  sessions.delete(token)
}

function bearerToken(req) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')
  return scheme === 'Bearer' ? token : null
}

export function requireSession(req, res, next) {
  const token = bearerToken(req)
  const session = token && sessions.get(token)
  if (!session || session.expires < Date.now()) {
    if (session) sessions.delete(token)
    return res.status(401).json({ error: 'Not authenticated' })
  }
  session.expires = Date.now() + SESSION_TTL_MS
  req.mailSession = session
  next()
}

export function requireAdmin(req, res, next) {
  const token = bearerToken(req)
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Not authorized' })
  }
  next()
}

setInterval(() => {
  const now = Date.now()
  for (const [token, session] of sessions) {
    if (session.expires < now) sessions.delete(token)
  }
}, 60_000).unref()
