import crypto from 'node:crypto'

const sessions = new Map()
const SESSION_TTL_MS = (Number(process.env.SESSION_TTL_MINUTES) || 120) * 60 * 1000

export function isSuperAdminEmail(email) {
  const list = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return list.includes(email.toLowerCase())
}

// role: 'super' (SUPER_ADMIN_EMAILS, sees/manages everything, including
// Services/health/stats) | 'domain' (virtual_users.is_admin, scoped to
// their own domain, never sees Services/health/stats) | 'user' (webmail
// only, no admin routes).
export function createSession(email, password, role, domain) {
  const token = crypto.randomUUID()
  sessions.set(token, { email, password, role, domain, expires: Date.now() + SESSION_TTL_MS })
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

function getSession(req) {
  const token = bearerToken(req)
  const session = token && sessions.get(token)
  if (!session || session.expires < Date.now()) {
    if (session) sessions.delete(token)
    return null
  }
  session.expires = Date.now() + SESSION_TTL_MS
  return session
}

export function requireSession(req, res, next) {
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Not authenticated' })
  req.mailSession = session
  next()
}

// Domain admins and super admins. req.adminScope.domain is null for a
// super admin (no restriction); otherwise the one domain this caller may
// touch.
export function requireDomainAdmin(req, res, next) {
  const session = getSession(req)
  if (!session || (session.role !== 'domain' && session.role !== 'super')) {
    return res.status(401).json({ error: 'Not authorized' })
  }
  req.mailSession = session
  req.adminScope = { role: session.role, domain: session.role === 'super' ? null : session.domain }
  next()
}

// Super admins only -- Services/health/stats, domain creation/deletion.
export function requireSuperAdmin(req, res, next) {
  const session = getSession(req)
  if (!session || session.role !== 'super') {
    return res.status(401).json({ error: 'Not authorized' })
  }
  req.mailSession = session
  next()
}

setInterval(() => {
  const now = Date.now()
  for (const [token, session] of sessions) {
    if (session.expires < now) sessions.delete(token)
  }
}, 60_000).unref()
