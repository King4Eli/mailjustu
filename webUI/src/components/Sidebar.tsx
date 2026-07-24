import {
  Inbox,
  Star,
  Send,
  FileText,
  Archive,
  ShieldAlert,
  Trash2,
  Pencil,
  Mail,
  LogOut,
  Plus,
  AtSign,
} from 'lucide-react'
import type { FolderInfo } from '../types'

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  '\\Inbox': Inbox,
  '\\Sent': Send,
  '\\Drafts': FileText,
  '\\Junk': ShieldAlert,
  '\\Trash': Trash2,
  '\\Archive': Archive,
  starred: Star,
}

interface SidebarProps {
  folders: FolderInfo[]
  activeFolder: string
  onSelectFolder: (id: string) => void
  onCompose: () => void
  open: boolean
  onClose: () => void
  email: string
  onLogout: () => void
  onCreateFolder: (name: string) => void
  onDeleteFolder: (path: string) => void
  onOpenAliases: () => void
}

export function Sidebar({
  folders,
  activeFolder,
  onSelectFolder,
  onCompose,
  open,
  onClose,
  email,
  onLogout,
  onCreateFolder,
  onDeleteFolder,
  onOpenAliases,
}: SidebarProps) {
  function handleNewFolder() {
    const name = window.prompt('New folder name')
    if (name && name.trim()) onCreateFolder(name.trim())
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed z-40 flex h-full w-64 flex-col gap-1 border-r p-3 transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
      >
        <div className="mb-4 flex items-center gap-2 px-2 py-1">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
            style={{ background: 'var(--accent)' }}
          >
            <Mail size={18} />
          </div>
          <span className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
            Mailbox
          </span>
        </div>

        <button
          onClick={onCompose}
          className="mb-4 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
          style={{ background: 'var(--accent)' }}
        >
          <Pencil size={16} />
          Compose
        </button>

        <nav className="flex flex-col gap-0.5 overflow-y-auto">
          {folders.map((folder) => {
            const Icon = ICONS[folder.icon] || Inbox
            const isActive = folder.id === activeFolder
            const count = folder.unseen
            const isCustom = folder.id !== 'STARRED' && !ICONS[folder.icon]
            return (
              <div
                key={folder.id}
                className="group flex items-center rounded-lg"
                style={{ background: isActive ? 'var(--bg-selected)' : 'transparent' }}
              >
                <button
                  onClick={() => {
                    onSelectFolder(folder.id)
                    onClose()
                  }}
                  className="flex flex-1 items-center gap-3 px-3 py-2 text-sm transition"
                  style={{
                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: isActive ? 600 : 500,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.parentElement!.style.background = 'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.parentElement!.style.background = 'transparent'
                  }}
                >
                  <Icon size={17} />
                  <span className="flex-1 truncate text-left">{folder.name}</span>
                  {count > 0 && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-xs font-semibold"
                      style={{
                        background: isActive ? 'var(--accent)' : 'var(--bg-hover)',
                        color: isActive ? 'white' : 'var(--text-muted)',
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
                {isCustom && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete folder "${folder.name}"?`)) onDeleteFolder(folder.id)
                    }}
                    className="hidden pr-2 group-hover:block"
                    style={{ color: 'var(--text-faint)' }}
                    title={`Delete ${folder.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )
          })}
          <button
            onClick={handleNewFolder}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition"
            style={{ color: 'var(--text-faint)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Plus size={17} />
            <span>New folder</span>
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-2 border-t px-2 pt-3" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onOpenAliases}
            className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-xs"
            style={{ color: 'var(--text-faint)' }}
          >
            <AtSign size={15} />
            <span>Manage aliases</span>
          </button>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex-1 truncate" style={{ color: 'var(--text-faint)' }} title={email}>
              {email}
            </span>
            <button
              onClick={onLogout}
              title="Sign out"
              className="rounded-lg p-1.5"
              style={{ color: 'var(--text-faint)' }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
