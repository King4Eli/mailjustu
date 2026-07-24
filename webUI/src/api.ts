const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'

const TOKEN_KEY = 'webui_token'
const EMAIL_KEY = 'webui_email'

export function getStoredSession(): { token: string; email: string } | null {
  const token = localStorage.getItem(TOKEN_KEY)
  const email = localStorage.getItem(EMAIL_KEY)
  return token && email ? { token, email } : null
}

function setSession(token: string, email: string) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(EMAIL_KEY, email)
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EMAIL_KEY)
}

class ApiError extends Error {}

async function apiFetch(path: string, options: RequestInit = {}) {
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
    clearSession()
    throw new ApiError('Session expired, please sign in again')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.error || `Request failed (${res.status})`)
  }
  return res.json()
}

export async function login(email: string, password: string) {
  const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  setSession(data.token, data.email)
  return data.email as string
}

export async function logout() {
  await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {})
  clearSession()
}

export interface ApiFolder {
  path: string
  name: string
  specialUse: string | null
  unseen: number
  messages: number
}

export function getFolders(): Promise<{ folders: ApiFolder[] }> {
  return apiFetch('/mail/folders')
}

export interface ApiMessage {
  uid: number
  subject: string
  from: { name: string; email: string }
  to: string[]
  date: string
  read: boolean
  starred: boolean
  preview?: string
  body?: string
  attachments?: { name: string; size: string }[]
}

export function getMessages(folder: string): Promise<{ folder: string; messages: ApiMessage[] }> {
  return apiFetch(`/mail/messages?folder=${encodeURIComponent(folder)}`)
}

export function getMessage(uid: number, folder: string): Promise<{ message: ApiMessage }> {
  return apiFetch(`/mail/messages/${uid}?folder=${encodeURIComponent(folder)}`)
}

export function setFlag(uid: number, folder: string, flag: 'starred' | 'read', value: boolean) {
  return apiFetch(`/mail/messages/${uid}?folder=${encodeURIComponent(folder)}`, {
    method: 'PATCH',
    body: JSON.stringify({ flag, value }),
  })
}

export function moveMessage(uid: number, folder: string, to: string) {
  return apiFetch(`/mail/messages/${uid}/move?folder=${encodeURIComponent(folder)}`, {
    method: 'POST',
    body: JSON.stringify({ to }),
  })
}

export function deleteMessage(uid: number, folder: string) {
  return apiFetch(`/mail/messages/${uid}?folder=${encodeURIComponent(folder)}`, { method: 'DELETE' })
}

export function sendMail(to: string, subject: string, body: string) {
  return apiFetch('/mail/send', { method: 'POST', body: JSON.stringify({ to, subject, body }) })
}
