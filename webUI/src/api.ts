const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'

const TOKEN_KEY = 'webui_token'
const EMAIL_KEY = 'webui_email'
const ROLE_KEY = 'webui_role'

export interface Session {
  token: string
  email: string
  role: 'super' | 'domain' | 'user'
}

export function getStoredSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY)
  const email = localStorage.getItem(EMAIL_KEY)
  const role = (localStorage.getItem(ROLE_KEY) as Session['role']) || 'user'
  return token && email ? { token, email, role } : null
}

function setSession(token: string, email: string, role: string) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(EMAIL_KEY, email)
  localStorage.setItem(ROLE_KEY, role)
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EMAIL_KEY)
  localStorage.removeItem(ROLE_KEY)
}

class ApiError extends Error {}

async function apiFetch(path: string, options: RequestInit = {}) {
  const session = getStoredSession()
  const isFormData = options.body instanceof FormData
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
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
  setSession(data.token, data.email, data.role)
  return data as { token: string; email: string; role: Session['role']; domain: string }
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

export function getUsage(): Promise<{ usedBytes: number | null; quotaMb: number | null }> {
  return apiFetch('/mail/usage')
}

export function getFolders(): Promise<{ folders: ApiFolder[] }> {
  return apiFetch('/mail/folders')
}

export function createFolder(name: string) {
  return apiFetch('/mail/folders', { method: 'POST', body: JSON.stringify({ name }) })
}

export function deleteFolder(path: string) {
  return apiFetch('/mail/folders', { method: 'DELETE', body: JSON.stringify({ path }) })
}

export interface ApiMessage {
  uid: number
  subject: string
  from: { name: string; email: string }
  to: string[]
  cc?: string[]
  date: string
  read: boolean
  starred: boolean
  preview?: string
  body?: string
  attachments?: { index: number; name: string; size: string }[]
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

export function markAsSpam(uid: number, folder: string) {
  return moveMessage(uid, folder, 'Junk')
}

export function markAsNotSpam(uid: number, folder: string) {
  return moveMessage(uid, folder, 'Inbox')
}

export async function downloadAttachment(uid: number, folder: string, index: number, filename: string) {
  const session = getStoredSession()
  const res = await fetch(
    `${API_BASE}/mail/messages/${uid}/attachments/${index}?folder=${encodeURIComponent(folder)}`,
    { headers: session ? { Authorization: `Bearer ${session.token}` } : {} },
  )
  if (!res.ok) throw new ApiError(`Failed to download attachment (${res.status})`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function deleteMessage(uid: number, folder: string) {
  return apiFetch(`/mail/messages/${uid}?folder=${encodeURIComponent(folder)}`, { method: 'DELETE' })
}

export function sendMail(opts: {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  from?: string
  attachments?: File[]
}) {
  const form = new FormData()
  form.set('to', opts.to)
  if (opts.cc) form.set('cc', opts.cc)
  if (opts.bcc) form.set('bcc', opts.bcc)
  form.set('subject', opts.subject)
  form.set('body', opts.body)
  if (opts.from) form.set('from', opts.from)
  for (const file of opts.attachments || []) form.append('attachments', file)
  return apiFetch('/mail/send', { method: 'POST', body: form })
}

export function saveDraft(opts: {
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  body?: string
  from?: string
  draftUid?: number
  draftFolder?: string
  attachments?: File[]
}): Promise<{ ok: boolean; uid: number; folder: string }> {
  const form = new FormData()
  if (opts.to) form.set('to', opts.to)
  if (opts.cc) form.set('cc', opts.cc)
  if (opts.bcc) form.set('bcc', opts.bcc)
  form.set('subject', opts.subject || '')
  form.set('body', opts.body || '')
  if (opts.from) form.set('from', opts.from)
  if (opts.draftUid != null) form.set('draftUid', String(opts.draftUid))
  if (opts.draftFolder) form.set('draftFolder', opts.draftFolder)
  for (const file of opts.attachments || []) form.append('attachments', file)
  return apiFetch('/mail/drafts', { method: 'POST', body: form })
}

export function discardDraft(uid: number, folder: string) {
  return apiFetch(`/mail/drafts/${uid}?folder=${encodeURIComponent(folder)}`, { method: 'DELETE' })
}

export interface ApiAlias {
  id: number
  source: string
}

export function getAliases(): Promise<{ aliases: ApiAlias[] }> {
  return apiFetch('/mail/aliases')
}

export function createAlias(alias: string) {
  return apiFetch('/mail/aliases', { method: 'POST', body: JSON.stringify({ alias }) })
}

export function deleteAlias(id: number) {
  return apiFetch(`/mail/aliases/${id}`, { method: 'DELETE' })
}
