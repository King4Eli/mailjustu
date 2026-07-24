import { useState, useEffect } from 'react'
import { X, Minus, Paperclip, Send, ChevronDown } from 'lucide-react'

export interface ComposeDraft {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  from?: string
}

interface ComposeModalProps {
  initialDraft: ComposeDraft
  onClose: () => void
  onSend: (draft: ComposeDraft) => void
  primaryEmail: string
  aliases: string[]
}

export function ComposeModal({ initialDraft, onClose, onSend, primaryEmail, aliases }: ComposeModalProps) {
  const [draft, setDraft] = useState<ComposeDraft>({ from: primaryEmail, ...initialDraft })
  const [minimized, setMinimized] = useState(false)
  const [showCc, setShowCc] = useState(Boolean(initialDraft.cc || initialDraft.bcc))

  useEffect(() => {
    setDraft({ from: primaryEmail, ...initialDraft })
    setShowCc(Boolean(initialDraft.cc || initialDraft.bcc))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft])

  if (minimized) {
    return (
      <div
        className="fixed bottom-0 right-6 z-50 w-72 cursor-pointer rounded-t-xl border border-b-0 px-4 py-3 shadow-lg"
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
        onClick={() => setMinimized(false)}
      >
        <div className="flex items-center justify-between">
          <span className="truncate text-sm font-medium" style={{ color: 'var(--text)' }}>
            {draft.subject || 'New message'}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            style={{ color: 'var(--text-faint)' }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-0 right-6 z-50 flex w-full max-w-md flex-col overflow-hidden rounded-t-xl border border-b-0 shadow-2xl sm:right-6 sm:w-[440px]"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', maxHeight: '32rem' }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: 'var(--accent)' }}
      >
        <span className="text-sm font-medium text-white">New message</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setMinimized(true)} className="rounded p-1 text-white/90 hover:bg-white/10">
            <Minus size={15} />
          </button>
          <button onClick={onClose} className="rounded p-1 text-white/90 hover:bg-white/10">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-0 border-b" style={{ borderColor: 'var(--border)' }}>
        {aliases.length > 0 && (
          <div className="relative border-b" style={{ borderColor: 'var(--border)' }}>
            <select
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              className="w-full appearance-none px-4 py-2.5 text-sm outline-none"
              style={{ color: 'var(--text)', background: 'transparent' }}
            >
              <option value={primaryEmail}>From: {primaryEmail}</option>
              {aliases.map((alias) => (
                <option key={alias} value={alias}>
                  From: {alias}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
          </div>
        )}
        <div className="flex items-center">
          <input
            value={draft.to}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            placeholder="To"
            className="flex-1 border-b px-4 py-2.5 text-sm outline-none"
            style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'transparent' }}
          />
          {!showCc && (
            <button
              onClick={() => setShowCc(true)}
              className="border-b px-3 py-2.5 text-xs font-medium"
              style={{ borderColor: 'var(--border)', color: 'var(--text-faint)' }}
            >
              Cc/Bcc
            </button>
          )}
        </div>
        {showCc && (
          <>
            <input
              value={draft.cc || ''}
              onChange={(e) => setDraft({ ...draft, cc: e.target.value })}
              placeholder="Cc"
              className="border-b px-4 py-2.5 text-sm outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'transparent' }}
            />
            <input
              value={draft.bcc || ''}
              onChange={(e) => setDraft({ ...draft, bcc: e.target.value })}
              placeholder="Bcc"
              className="border-b px-4 py-2.5 text-sm outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'transparent' }}
            />
          </>
        )}
        <input
          value={draft.subject}
          onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          placeholder="Subject"
          className="px-4 py-2.5 text-sm outline-none"
          style={{ color: 'var(--text)', background: 'transparent' }}
        />
      </div>

      <textarea
        value={draft.body}
        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        placeholder="Write your message..."
        className="flex-1 resize-none px-4 py-3 text-sm outline-none"
        style={{ color: 'var(--text)', background: 'transparent', minHeight: '180px' }}
      />

      <div
        className="flex items-center justify-between border-t px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          onClick={() => onSend(draft)}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          style={{ background: 'var(--accent)' }}
        >
          Send
          <Send size={14} />
        </button>
        <button style={{ color: 'var(--text-faint)' }} className="rounded-lg p-2 hover:opacity-80">
          <Paperclip size={17} />
        </button>
      </div>
    </div>
  )
}
