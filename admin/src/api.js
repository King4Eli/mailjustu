const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
const SESSION_KEY = 'admin_session'

export function getStoredSession() {
  const raw = localStorage.getItem(SESSION_KEY)
  return raw ? JSON.parse(raw) : null
}

function setStoredSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY)
}

class ApiError extends Error {}

async function apiFetch(path, options = {}) {
  const session = getStoredSession()
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (res.status === 401) {
    clearStoredSession()
    throw new ApiError('Not authorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error || `Request failed (${res.status})`)
  }
  return res.json()
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || 'Sign in failed')
  if (data.role !== 'super' && data.role !== 'domain') {
    throw new ApiError("This account doesn't have admin access")
  }
  setStoredSession(data)
  return data
}

export async function logout() {
  await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {})
  clearStoredSession()
}

export function getHealth() {
  return apiFetch('/admin/health')
}

export function getStats() {
  return apiFetch('/admin/stats')
}

export function getMailboxes() {
  return apiFetch('/admin/mailboxes')
}

export function createMailbox(email, password, isAdmin) {
  return apiFetch('/admin/mailboxes', { method: 'POST', body: JSON.stringify({ email, password, isAdmin }) })
}

export function setMailboxAdmin(id, isAdmin) {
  return apiFetch(`/admin/mailboxes/${id}`, { method: 'PATCH', body: JSON.stringify({ isAdmin }) })
}

export function deleteMailbox(id) {
  return apiFetch(`/admin/mailboxes/${id}`, { method: 'DELETE' })
}

export function getDomains() {
  return apiFetch('/admin/domains')
}

export function createDomain(name, maxMailboxes, maxAliasesPerMailbox, quotaMb) {
  return apiFetch('/admin/domains', {
    method: 'POST',
    body: JSON.stringify({
      name,
      maxMailboxes: maxMailboxes || null,
      maxAliasesPerMailbox: maxAliasesPerMailbox || null,
      quotaMb: quotaMb || null,
    }),
  })
}

export function updateDomainLimits(id, maxMailboxes, maxAliasesPerMailbox, quotaMb) {
  return apiFetch(`/admin/domains/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      maxMailboxes: maxMailboxes || null,
      maxAliasesPerMailbox: maxAliasesPerMailbox || null,
      quotaMb: quotaMb || null,
    }),
  })
}

export function deleteDomain(id) {
  return apiFetch(`/admin/domains/${id}`, { method: 'DELETE' })
}
