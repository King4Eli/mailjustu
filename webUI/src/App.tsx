import { useMemo, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { MessageList } from './components/MessageList'
import { ReadingPane } from './components/ReadingPane'
import { ComposeModal, type ComposeDraft } from './components/ComposeModal'
import { folders as folderList, messages as initialMessages } from './data/mockData'
import type { EmailMessage, FolderId } from './types'

const FOLDER_NAMES: Record<FolderId, string> = Object.fromEntries(
  folderList.map((f) => [f.id, f.name]),
) as Record<FolderId, string>

export default function App() {
  const [messages, setMessages] = useState<EmailMessage[]>(initialMessages)
  const [activeFolder, setActiveFolder] = useState<FolderId>('inbox')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null)

  const folderMessages = useMemo(() => {
    const inFolder =
      activeFolder === 'starred'
        ? messages.filter((m) => m.starred)
        : messages.filter((m) => m.folder === activeFolder)
    const q = query.trim().toLowerCase()
    const filtered = q
      ? inFolder.filter(
          (m) =>
            m.subject.toLowerCase().includes(q) ||
            m.from.name.toLowerCase().includes(q) ||
            m.preview.toLowerCase().includes(q),
        )
      : inFolder
    return [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [messages, activeFolder, query])

  const selectedMessage = messages.find((m) => m.id === selectedId) ?? null

  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const folder of folderList) {
      counts[folder.id] =
        folder.id === 'starred'
          ? messages.filter((m) => m.starred && !m.read).length
          : messages.filter((m) => m.folder === folder.id && !m.read).length
    }
    return counts
  }, [messages])

  function handleSelect(message: EmailMessage) {
    setSelectedId(message.id)
    if (!message.read) {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, read: true } : m)))
    }
  }

  function toggleStar(id: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, starred: !m.starred } : m)))
  }

  function archiveMessage(id: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, folder: 'archive' } : m)))
    setSelectedId(null)
  }

  function deleteMessage(id: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, folder: 'trash' } : m)))
    setSelectedId(null)
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

  function handleSend(draft: ComposeDraft) {
    const newMessage: EmailMessage = {
      id: `sent-${Date.now()}`,
      folder: 'sent',
      from: { name: 'Me', email: 'me@example.com' },
      to: draft.to
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      subject: draft.subject || '(no subject)',
      preview: draft.body.slice(0, 120),
      body: draft.body,
      date: new Date().toISOString(),
      read: true,
      starred: false,
    }
    setMessages((prev) => [newMessage, ...prev])
    setComposeDraft(null)
  }

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar
        activeFolder={activeFolder}
        onSelectFolder={(id) => {
          setActiveFolder(id)
          setSelectedId(null)
        }}
        onCompose={() => setComposeDraft({ to: '', subject: '', body: '' })}
        unreadCounts={unreadCounts}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
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

        <div className="flex min-h-0 flex-1">
          <div className={`${selectedMessage ? 'hidden md:flex' : 'flex'} w-full md:w-auto`}>
            <MessageList
              messages={folderMessages}
              selectedId={selectedId}
              onSelect={handleSelect}
              onToggleStar={toggleStar}
              folderLabel={FOLDER_NAMES[activeFolder]}
            />
          </div>

          <div className={`${selectedMessage ? 'flex' : 'hidden md:flex'} min-w-0 flex-1`}>
            <ReadingPane
              message={selectedMessage}
              onToggleStar={toggleStar}
              onArchive={archiveMessage}
              onDelete={deleteMessage}
              onReply={handleReply}
              onBack={() => setSelectedId(null)}
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
