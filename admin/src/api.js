const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
const TOKEN_KEY = 'admin_token'

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY)
}

class ApiError extends Error {}

async function apiFetch(path, options = {}) {
  const token = getStoredToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (res.status === 401) {
    clearStoredToken()
    throw new ApiError('Not authorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error || `Request failed (${res.status})`)
  }
  return res.json()
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

export function createMailbox(email, password) {
  return apiFetch('/admin/mailboxes', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export function deleteMailbox(id) {
  return apiFetch(`/admin/mailboxes/${id}`, { method: 'DELETE' })
}
