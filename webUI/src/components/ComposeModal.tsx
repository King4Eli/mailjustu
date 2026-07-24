import { useState, useEffect, useRef } from 'react'
import { X, Minus, Paperclip, Send, ChevronDown, File as FileIcon } from 'lucide-react'

export interface ComposeDraft {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  from?: string
  attachments?: File[]
  // Set when this draft was opened from the Drafts folder -- lets saving
  // and sending replace the original message instead of duplicating it.
  draftUid?: number
  draftFolder?: string
}

interface ComposeModalProps {
  initialDraft: ComposeDraft
  onClose: () => void
  onSaveDraft: (draft: ComposeDraft) => void
  onSend: (draft: ComposeDraft) => void
  primaryEmail: string
  aliases: string[]
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ComposeModal({ initialDraft, onClose, onSaveDraft, onSend, primaryEmail, aliases }: ComposeModalProps) {
  const [draft, setDraft] = useState<ComposeDraft>({ from: primaryEmail, attachments: [], ...initialDraft })
  const [minimized, setMinimized] = useState(false)
  const [showCc, setShowCc] = useState(Boolean(initialDraft.cc || initialDraft.bcc))
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleCloseWithSave() {
    const hasContent = draft.to.trim() || draft.subject.trim() || draft.body.trim() || (draft.attachments?.length ?? 0) > 0
    if (hasContent) onSaveDraft(draft)
    onClose()
  }

  useEffect(() => {
    setDraft({ from: primaryEmail, attachments: [], ...initialDraft })
    setShowCc(Boolean(initialDraft.cc || initialDraft.bcc))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft])

  function addFiles(files: FileList | null) {
    if (!files) return
    setDraft((d) => ({ ...d, attachments: [...(d.attachments || []), ...Array.from(files)] }))
  }

  function removeFile(index: number) {
    setDraft((d) => ({ ...d, attachments: (d.attachments || []).filter((_, i) => i !== index) }))
  }

  async function handleSend() {
    setSending(true)
    try {
      await onSend(draft)
    } finally {
      setSending(false)
    }
  }

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
              handleCloseWithSave()
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
          <button onClick={handleCloseWithSave} className="rounded p-1 text-white/90 hover:bg-white/10">
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
        style={{ color: 'var(--text)', background: 'transparent', minHeight: '140px' }}
      />

      {(draft.attachments?.length || 0) > 0 && (
        <div className="flex flex-wrap gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          {draft.attachments!.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              <FileIcon size={13} />
              <span className="max-w-[140px] truncate">{file.name}</span>
              <span style={{ color: 'var(--text-faint)' }}>{formatSize(file.size)}</span>
              <button onClick={() => removeFile(i)} style={{ color: 'var(--text-faint)' }}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className="flex items-center justify-between border-t px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          onClick={handleSend}
          disabled={sending}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ background: 'var(--accent)' }}
        >
          {sending ? 'Sending…' : 'Send'}
          <Send size={14} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ color: 'var(--text-faint)' }}
          className="rounded-lg p-2 hover:opacity-80"
          title="Attach files"
        >
          <Paperclip size={17} />
        </button>
      </div>
    </div>
  )
}
