import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { MessageList } from './components/MessageList'
import { ReadingPane } from './components/ReadingPane'
import { ComposeModal, type ComposeDraft } from './components/ComposeModal'
import { AliasesModal } from './components/AliasesModal'
import { Login } from './components/Login'
import * as api from './api'
import type { ApiFolder, ApiMessage, ApiAlias } from './api'
import type { EmailMessage, FolderInfo, MessageFilter } from './types'

function toEmailMessage(m: ApiMessage, sourceFolder?: string): EmailMessage {
  return {
    id: String(m.uid),
    from: m.from,
    to: m.to,
    cc: m.cc,
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
  const name = f.specialUse === '\\Junk' ? 'Spam' : f.name
  return { id: f.path, name, icon: f.specialUse || 'inbox', unseen: f.unseen, messages: f.messages }
}

export default function App() {
  const [email, setEmail] = useState<string | null>(() => api.getStoredSession()?.email ?? null)
  const [role, setRole] = useState<'super' | 'domain' | 'user'>(() => api.getStoredSession()?.role ?? 'user')
  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [activeFolder, setActiveFolder] = useState('INBOX')
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<MessageFilter>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null)
  const [aliases, setAliases] = useState<ApiAlias[]>([])
  const [aliasesOpen, setAliasesOpen] = useState(false)
  const [usage, setUsage] = useState<{ usedBytes: number | null; quotaMb: number | null } | null>(null)

  async function loadFolders() {
    try {
      const { folders: apiFolders } = await api.getFolders()
      const mapped = apiFolders.map(toFolderInfo)
      const inboxIndex = mapped.findIndex((f) => f.icon === '\\Inbox')
      const starred: FolderInfo = { id: 'STARRED', name: 'Starred', icon: 'starred', unseen: 0, messages: 0 }
      const withStarred =
        inboxIndex >= 0
          ? [...mapped.slice(0, inboxIndex + 1), starred, ...mapped.slice(inboxIndex + 1)]
          : [starred, ...mapped]
      setFolders(withStarred)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folders')
    }
  }

  async function loadAliases() {
    try {
      const { aliases: apiAliases } = await api.getAliases()
      setAliases(apiAliases)
    } catch {
      // non-fatal, aliases are a secondary feature
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
    if (email) {
      loadFolders()
      loadAliases()
      api.getUsage().then(setUsage).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email])

  useEffect(() => {
    if (email && folders.length > 0) loadMessages(activeFolder)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, activeFolder, folders.length])

  if (!email) {
    return (
      <Login
        onLogin={(loggedInEmail, loggedInRole) => {
          setEmail(loggedInEmail)
          setRole(loggedInRole)
        }}
      />
    )
  }

  const searchedMessages = query.trim()
    ? messages.filter(
        (m) =>
          m.subject.toLowerCase().includes(query.toLowerCase()) ||
          m.from.name.toLowerCase().includes(query.toLowerCase()) ||
          m.preview.toLowerCase().includes(query.toLowerCase()),
      )
    : messages

  const folderMessages = searchedMessages.filter((m) => {
    switch (filter) {
      case 'unread':
        return !m.read
      case 'read':
        return m.read
      case 'starred':
        return m.starred
      case 'attachments':
        return (m.attachments?.length ?? 0) > 0
      default:
        return true
    }
  })

  const folderLabel = folders.find((f) => f.id === activeFolder)?.name || activeFolder
  const currentMessageFolder = selectedMessage?.sourceFolder || activeFolder
  const isSpamFolder = folders.find((f) => f.id === currentMessageFolder)?.icon === '\\Junk'

  async function handleSelect(message: EmailMessage) {
    const folder = message.sourceFolder || activeFolder
    const isDraft = folders.find((f) => f.id === folder)?.icon === '\\Drafts'
    if (isDraft) {
      try {
        const { message: detail } = await api.getMessage(Number(message.id), folder)
        setComposeDraft({
          to: detail.to.join(', '),
          cc: detail.cc && detail.cc.length > 0 ? detail.cc.join(', ') : undefined,
          subject: detail.subject === '(no subject)' ? '' : detail.subject,
          body: detail.body || '',
          from: email ?? undefined,
          draftUid: Number(message.id),
          draftFolder: folder,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load draft')
      }
      return
    }
    setSelectedId(message.id)
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

  async function saveDraft(draft: ComposeDraft) {
    try {
      await api.saveDraft(draft)
      loadFolders()
      const draftsFolderId = folders.find((f) => f.icon === '\\Drafts')?.id
      if (draftsFolderId && activeFolder === draftsFolderId) loadMessages(draftsFolderId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft')
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

  function clearSelectionAndRemove(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id))
    setSelectedId(null)
    setSelectedMessage(null)
    loadFolders()
  }

  async function archiveMessage(id: string) {
    const message = messages.find((m) => m.id === id)
    const folder = message?.sourceFolder || activeFolder
    try {
      await api.moveMessage(Number(id), folder, 'Archive')
      clearSelectionAndRemove(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive message')
    }
  }

  async function markSpam(id: string) {
    const message = messages.find((m) => m.id === id)
    const folder = message?.sourceFolder || activeFolder
    try {
      await api.markAsSpam(Number(id), folder)
      clearSelectionAndRemove(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as spam')
    }
  }

  async function markNotSpam(id: string) {
    const message = messages.find((m) => m.id === id)
    const folder = message?.sourceFolder || activeFolder
    try {
      await api.markAsNotSpam(Number(id), folder)
      clearSelectionAndRemove(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as not spam')
    }
  }

  async function downloadAttachment(messageId: string, index: number, filename: string) {
    const message = messageId === selectedMessage?.id ? selectedMessage : messages.find((m) => m.id === messageId)
    const folder = message?.sourceFolder || activeFolder
    try {
      await api.downloadAttachment(Number(messageId), folder, index, filename)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download attachment')
    }
  }

  async function moveTo(id: string, target: string) {
    const message = messages.find((m) => m.id === id)
    const folder = message?.sourceFolder || activeFolder
    try {
      await api.moveMessage(Number(id), folder, target)
      clearSelectionAndRemove(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move message')
    }
  }

  async function removeMessage(id: string) {
    const message = messages.find((m) => m.id === id)
    const folder = message?.sourceFolder || activeFolder
    try {
      await api.deleteMessage(Number(id), folder)
      clearSelectionAndRemove(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete message')
    }
  }

  async function createFolder(name: string) {
    try {
      await api.createFolder(name)
      loadFolders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder')
    }
  }

  async function deleteFolder(path: string) {
    try {
      await api.deleteFolder(path)
      if (activeFolder === path) setActiveFolder('INBOX')
      loadFolders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete folder')
    }
  }

  async function createAlias(alias: string) {
    await api.createAlias(alias)
    loadAliases()
  }

  async function deleteAlias(id: number) {
    try {
      await api.deleteAlias(id)
      loadAliases()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete alias')
    }
  }

  function handleReply(message: EmailMessage, mode: 'reply' | 'replyAll' | 'forward') {
    const quoted = `\n\nOn ${new Date(message.date).toLocaleString()}, ${message.from.name} wrote:\n${message.body
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')}`
    setComposeDraft({
      to: mode === 'forward' ? '' : message.from.email,
      cc: mode === 'replyAll' && message.cc ? message.cc.join(', ') : undefined,
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
      await api.sendMail({
        to: draft.to,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: draft.subject,
        body: draft.body,
        from: draft.from,
        attachments: draft.attachments,
      })
      if (draft.draftUid != null && draft.draftFolder) {
        await api.discardDraft(draft.draftUid, draft.draftFolder).catch(() => {})
      }
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
    setRole('user')
    setFolders([])
    setMessages([])
    setSelectedId(null)
    setSelectedMessage(null)
    setAliases([])
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
          setFilter('all')
        }}
        onCompose={() => setComposeDraft({ to: '', subject: '', body: '' })}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        email={email}
        onLogout={handleLogout}
        onCreateFolder={createFolder}
        onDeleteFolder={deleteFolder}
        onOpenAliases={() => setAliasesOpen(true)}
        adminUrl={role !== 'user' ? import.meta.env.VITE_ADMIN_URL : undefined}
        usage={usage}
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
              filter={filter}
              onFilterChange={setFilter}
            />
          </div>

          <div className={`${selectedMessage ? 'flex' : 'hidden md:flex'} min-w-0 flex-1`}>
            <ReadingPane
              message={selectedMessage}
              folders={folders}
              onToggleStar={toggleStar}
              onArchive={archiveMessage}
              onDelete={removeMessage}
              onMarkSpam={markSpam}
              onMarkNotSpam={markNotSpam}
              isSpamFolder={isSpamFolder}
              onMoveTo={moveTo}
              onDownloadAttachment={downloadAttachment}
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
          onSaveDraft={saveDraft}
          onSend={handleSend}
          primaryEmail={email}
          aliases={aliases.map((a) => a.source)}
        />
      )}

      {aliasesOpen && (
        <AliasesModal
          aliases={aliases}
          onClose={() => setAliasesOpen(false)}
          onCreate={createAlias}
          onDelete={deleteAlias}
        />
      )}
    </div>
  )
}
