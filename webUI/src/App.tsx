import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { MessageList } from './components/MessageList'
import { ReadingPane } from './components/ReadingPane'
import { ComposeModal, type ComposeDraft } from './components/ComposeModal'
import { Login } from './components/Login'
import * as api from './api'
import type { ApiFolder, ApiMessage } from './api'
import type { EmailMessage, FolderInfo } from './types'

function toEmailMessage(m: ApiMessage, sourceFolder?: string): EmailMessage {
  return {
    id: String(m.uid),
    from: m.from,
    to: m.to,
    subject: m.subject,
    preview: m.preview || '',
    body: m.body || '',
    date: m.date,
    read: m.read,
    starred: m.starred,
    attachments: m.attachments,
    sourceFolder,
  }
}

function toFolderInfo(f: ApiFolder): FolderInfo {
  return { id: f.path, name: f.name, icon: f.specialUse || 'inbox', unseen: f.unseen }
}

export default function App() {
  const [email, setEmail] = useState<string | null>(() => api.getStoredSession()?.email ?? null)
  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [activeFolder, setActiveFolder] = useState('INBOX')
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null)

  async function loadFolders() {
    try {
      const { folders: apiFolders } = await api.getFolders()
      const mapped = apiFolders.map(toFolderInfo)
      const inboxIndex = mapped.findIndex((f) => f.icon === '\\Inbox')
      const starred: FolderInfo = { id: 'STARRED', name: 'Starred', icon: 'starred', unseen: 0 }
      const withStarred =
        inboxIndex >= 0
          ? [...mapped.slice(0, inboxIndex + 1), starred, ...mapped.slice(inboxIndex + 1)]
          : [starred, ...mapped]
      setFolders(withStarred)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folders')
    }
  }

  async function loadMessages(folderId: string) {
    setLoading(true)
    setError('')
    try {
      if (folderId === 'STARRED') {
        const realFolders = folders.filter((f) => f.id !== 'STARRED')
        const results = await Promise.all(
          realFolders.map(async (f) => {
            const { messages: apiMessages } = await api.getMessages(f.id)
            return apiMessages.filter((m) => m.starred).map((m) => toEmailMessage(m, f.id))
          }),
        )
        const merged = results.flat().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setMessages(merged)
      } else {
        const { messages: apiMessages } = await api.getMessages(folderId)
        setMessages(
          apiMessages
            .map((m) => toEmailMessage(m))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (email) loadFolders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email])

  useEffect(() => {
    if (email && folders.length > 0) loadMessages(activeFolder)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, activeFolder, folders.length])

  if (!email) {
    return (
      <Login
        onLogin={(loggedInEmail) => {
          setEmail(loggedInEmail)
        }}
      />
    )
  }

  const folderMessages = query.trim()
    ? messages.filter(
        (m) =>
          m.subject.toLowerCase().includes(query.toLowerCase()) ||
          m.from.name.toLowerCase().includes(query.toLowerCase()) ||
          m.preview.toLowerCase().includes(query.toLowerCase()),
      )
    : messages

  const folderLabel = folders.find((f) => f.id === activeFolder)?.name || activeFolder

  async function handleSelect(message: EmailMessage) {
    setSelectedId(message.id)
    const folder = message.sourceFolder || activeFolder
    try {
      const { message: detail } = await api.getMessage(Number(message.id), folder)
      const full = toEmailMessage(detail, message.sourceFolder)
      setSelectedMessage(full)
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, read: true } : m)))
      loadFolders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load message')
    }
  }

  async function toggleStar(id: string) {
    const message = messages.find((m) => m.id === id) || (selectedMessage?.id === id ? selectedMessage : null)
    if (!message) return
    const folder = message.sourceFolder || activeFolder
    const nextStarred = !message.starred
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, starred: nextStarred } : m)))
    if (selectedMessage?.id === id) setSelectedMessage({ ...selectedMessage, starred: nextStarred })
    try {
      await api.setFlag(Number(id), folder, 'starred', nextStarred)
      if (activeFolder === 'STARRED' && !nextStarred) {
        setMessages((prev) => prev.filter((m) => m.id !== id))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update star')
    }
  }

  async function archiveMessage(id: string) {
    const message = messages.find((m) => m.id === id)
    const folder = message?.sourceFolder || activeFolder
    try {
      await api.moveMessage(Number(id), folder, 'Archive')
      setMessages((prev) => prev.filter((m) => m.id !== id))
      setSelectedId(null)
      setSelectedMessage(null)
      loadFolders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive message')
    }
  }

  async function removeMessage(id: string) {
    const message = messages.find((m) => m.id === id)
    const folder = message?.sourceFolder || activeFolder
    try {
      await api.deleteMessage(Number(id), folder)
      setMessages((prev) => prev.filter((m) => m.id !== id))
      setSelectedId(null)
      setSelectedMessage(null)
      loadFolders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete message')
    }
  }

  function handleReply(message: EmailMessage, mode: 'reply' | 'replyAll' | 'forward') {
    const quoted = `\n\nOn ${new Date(message.date).toLocaleString()}, ${message.from.name} wrote:\n${message.body
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')}`
    setComposeDraft({
      to: mode === 'forward' ? '' : message.from.email,
      subject:
        mode === 'forward'
          ? message.subject.startsWith('Fwd:')
            ? message.subject
            : `Fwd: ${message.subject}`
          : message.subject.startsWith('Re:')
            ? message.subject
            : `Re: ${message.subject}`,
      body: quoted,
    })
  }

  async function handleSend(draft: ComposeDraft) {
    try {
      await api.sendMail(draft.to, draft.subject, draft.body)
      setComposeDraft(null)
      loadFolders()
      if (activeFolder === 'Sent') loadMessages('Sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    }
  }

  async function handleLogout() {
    await api.logout()
    setEmail(null)
    setFolders([])
    setMessages([])
    setSelectedId(null)
    setSelectedMessage(null)
  }

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar
        folders={folders}
        activeFolder={activeFolder}
        onSelectFolder={(id) => {
          setActiveFolder(id)
          setSelectedId(null)
          setSelectedMessage(null)
        }}
        onCompose={() => setComposeDraft({ to: '', subject: '', body: '' })}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        email={email}
        onLogout={handleLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          query={query}
          onQueryChange={setQuery}
          theme={theme}
          onToggleTheme={() => {
            const next = theme === 'dark' ? 'light' : 'dark'
            setTheme(next)
            document.documentElement.setAttribute('data-theme', next)
          }}
          onToggleSidebar={() => setSidebarOpen(true)}
        />

        {error && (
          <div
            className="border-b px-4 py-2 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--danger)', background: 'var(--bg-elevated)' }}
          >
            {error}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div className={`${selectedMessage ? 'hidden md:flex' : 'flex'} w-full md:w-auto`}>
            <MessageList
              messages={folderMessages}
              selectedId={selectedId}
              onSelect={handleSelect}
              onToggleStar={toggleStar}
              folderLabel={loading ? `${folderLabel} · loading…` : folderLabel}
            />
          </div>

          <div className={`${selectedMessage ? 'flex' : 'hidden md:flex'} min-w-0 flex-1`}>
            <ReadingPane
              message={selectedMessage}
              onToggleStar={toggleStar}
              onArchive={archiveMessage}
              onDelete={removeMessage}
              onReply={handleReply}
              onBack={() => {
                setSelectedId(null)
                setSelectedMessage(null)
              }}
            />
          </div>
        </div>
      </div>

      {composeDraft && (
        <ComposeModal
          initialDraft={composeDraft}
          onClose={() => setComposeDraft(null)}
          onSend={handleSend}
        />
      )}
    </div>
  )
}
