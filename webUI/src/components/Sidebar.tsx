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
} from 'lucide-react'
import type { FolderId } from '../types'
import { folders } from '../data/mockData'

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  inbox: Inbox,
  star: Star,
  send: Send,
  'file-text': FileText,
  archive: Archive,
  'shield-alert': ShieldAlert,
  'trash-2': Trash2,
}

interface SidebarProps {
  activeFolder: FolderId
  onSelectFolder: (id: FolderId) => void
  onCompose: () => void
  unreadCounts: Record<string, number>
  open: boolean
  onClose: () => void
}

export function Sidebar({ activeFolder, onSelectFolder, onCompose, unreadCounts, open, onClose }: SidebarProps) {
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

        <nav className="flex flex-col gap-0.5">
          {folders.map((folder) => {
            const Icon = ICONS[folder.icon]
            const isActive = folder.id === activeFolder
            const count = unreadCounts[folder.id] ?? 0
            return (
              <button
                key={folder.id}
                onClick={() => {
                  onSelectFolder(folder.id)
                  onClose()
                }}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition"
                style={{
                  background: isActive ? 'var(--bg-selected)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: isActive ? 600 : 500,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent'
                }}
              >
                <Icon size={17} />
                <span className="flex-1 text-left">{folder.name}</span>
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
            )
          })}
        </nav>

        <div className="mt-auto px-2 pb-1 pt-4 text-xs" style={{ color: 'var(--text-faint)' }}>
          <div className="flex items-center justify-between">
            <span>2.1 GB of 15 GB used</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--bg-hover)' }}>
            <div className="h-full rounded-full" style={{ width: '14%', background: 'var(--accent)' }} />
          </div>
        </div>
      </aside>
    </>
  )
}
