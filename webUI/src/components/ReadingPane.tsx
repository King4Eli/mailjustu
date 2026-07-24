import {
  Star,
  Archive,
  Trash2,
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  MoreHorizontal,
  Mail,
  ArrowLeft,
} from 'lucide-react'
import type { EmailMessage } from '../types'
import { formatFullDate, initials, avatarColor } from '../utils'

interface ReadingPaneProps {
  message: EmailMessage | null
  onToggleStar: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onReply: (message: EmailMessage, mode: 'reply' | 'replyAll' | 'forward') => void
  onBack?: () => void
}

export function ReadingPane({ message, onToggleStar, onArchive, onDelete, onReply, onBack }: ReadingPaneProps) {
  if (!message) {
    return (
      <div className="hidden flex-1 flex-col items-center justify-center gap-3 md:flex">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: 'var(--bg-hover)' }}
        >
          <Mail size={28} style={{ color: 'var(--text-faint)' }} />
        </div>
        <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
          Select a message to read
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        className="flex items-center gap-1 border-b px-4 py-2.5"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
      >
        {onBack && (
          <button onClick={onBack} className="mr-1 rounded-lg p-2 md:hidden" style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={18} />
          </button>
        )}
        <ActionButton icon={Archive} label="Archive" onClick={() => onArchive(message.id)} />
        <ActionButton icon={Trash2} label="Delete" onClick={() => onDelete(message.id)} />
        <div className="mx-1 h-5 w-px" style={{ background: 'var(--border)' }} />
        <ActionButton icon={Reply} label="Reply" onClick={() => onReply(message, 'reply')} />
        <ActionButton icon={ReplyAll} label="Reply all" onClick={() => onReply(message, 'replyAll')} />
        <ActionButton icon={Forward} label="Forward" onClick={() => onReply(message, 'forward')} />
        <div className="flex-1" />
        <ActionButton icon={MoreHorizontal} label="More" onClick={() => {}} />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h1 className="text-xl font-semibold leading-snug" style={{ color: 'var(--text)' }}>
              {message.subject}
            </h1>
            <button onClick={() => onToggleStar(message.id)} className="shrink-0 pt-1">
              <Star
                size={18}
                fill={message.starred ? 'var(--accent)' : 'none'}
                style={{ color: message.starred ? 'var(--accent)' : 'var(--text-faint)' }}
              />
            </button>
          </div>

          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ background: avatarColor(message.from.email) }}
            >
              {initials(message.from.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {message.from.name}
                  <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-faint)' }}>
                    &lt;{message.from.email}&gt;
                  </span>
                </span>
                <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                  {formatFullDate(message.date)}
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                to {message.to.join(', ')}
              </p>
            </div>
          </div>

          <div
            className="mt-6 whitespace-pre-wrap text-sm leading-relaxed"
            style={{ color: 'var(--text)' }}
          >
            {message.body}
          </div>

          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {message.attachments.map((attachment) => (
                <div
                  key={attachment.name}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  <Paperclip size={14} />
                  <span className="font-medium" style={{ color: 'var(--text)' }}>
                    {attachment.name}
                  </span>
                  <span style={{ color: 'var(--text-faint)' }}>{attachment.size}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 flex gap-2">
            <button
              onClick={() => onReply(message, 'reply')}
              className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition hover:opacity-80"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <Reply size={15} />
              Reply
            </button>
            <button
              onClick={() => onReply(message, 'forward')}
              className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition hover:opacity-80"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <Forward size={15} />
              Forward
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="rounded-lg p-2 transition"
      style={{ color: 'var(--text-muted)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon size={17} />
    </button>
  )
}
