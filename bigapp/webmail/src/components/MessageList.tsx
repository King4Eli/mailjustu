import { useEffect, useState } from 'react'
import { Star, Paperclip } from 'lucide-react'
import type { EmailMessage, MessageFilter } from '../types'
import { formatListDate, initials, avatarColor } from '../utils'

interface MessageListProps {
  messages: EmailMessage[]
  selectedId: string | null
  onSelect: (message: EmailMessage) => void
  onToggleStar: (id: string) => void
  folderLabel: string
  filter: MessageFilter
  onFilterChange: (filter: MessageFilter) => void
  // User-resizable (see App.tsx's drag handle) -- only applied at the md+
  // breakpoint; below that this column is always full-width.
  width: number
}

function useIsMdUp() {
  const [isMdUp, setIsMdUp] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = () => setIsMdUp(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMdUp
}

const FILTERS: { id: MessageFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
  { id: 'starred', label: 'Starred' },
  { id: 'attachments', label: 'Attachments' },
]

export function MessageList({
  messages,
  selectedId,
  onSelect,
  onToggleStar,
  folderLabel,
  filter,
  onFilterChange,
  width,
}: MessageListProps) {
  const isMdUp = useIsMdUp()
  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden border-r"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)', ...(isMdUp ? { width } : {}) }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          {folderLabel}
        </h2>
        <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
          {messages.length} {messages.length === 1 ? 'message' : 'messages'}
        </span>
      </div>

      <div
        className="flex items-center gap-1 overflow-x-auto border-b px-3 py-2"
        style={{ borderColor: 'var(--border)' }}
      >
        {FILTERS.map((f) => {
          const isActive = filter === f.id
          return (
            <button
              key={f.id}
              onClick={() => onFilterChange(f.id)}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition"
              style={{
                background: isActive ? 'var(--accent)' : 'var(--bg-hover)',
                color: isActive ? 'white' : 'var(--text-muted)',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
              No messages here.
            </p>
          </div>
        )}
        {messages.map((message) => {
          const isSelected = message.id === selectedId
          return (
            <button
              key={message.id}
              onClick={() => onSelect(message)}
              className="flex w-full items-start gap-3 border-b px-4 py-3 text-left transition"
              style={{
                borderColor: 'var(--border)',
                background: isSelected ? 'var(--bg-selected)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.background = 'transparent'
              }}
            >
              <div
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ background: avatarColor(message.from.email) }}
              >
                {initials(message.from.name)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="truncate text-sm"
                    style={{
                      color: 'var(--text)',
                      fontWeight: message.read ? 500 : 700,
                    }}
                  >
                    {message.from.name}
                  </span>
                  <span className="shrink-0 text-xs" style={{ color: 'var(--text-faint)' }}>
                    {formatListDate(message.date)}
                  </span>
                </div>
                <div
                  className="truncate text-sm"
                  style={{ color: 'var(--text)', fontWeight: message.read ? 400 : 600 }}
                >
                  {message.subject}
                </div>
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-xs" style={{ color: 'var(--text-faint)' }}>
                    {message.preview}
                  </p>
                  {message.attachments && message.attachments.length > 0 && (
                    <Paperclip size={12} className="shrink-0" style={{ color: 'var(--text-faint)' }} />
                  )}
                </div>
              </div>

              <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1.5">
                {!message.read && (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: 'var(--unread-dot)' }}
                  />
                )}
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleStar(message.id)
                  }}
                >
                  <Star
                    size={15}
                    fill={message.starred ? 'var(--accent)' : 'none'}
                    style={{ color: message.starred ? 'var(--accent)' : 'var(--text-faint)' }}
                  />
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
