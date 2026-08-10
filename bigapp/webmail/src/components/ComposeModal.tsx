import { useState, useEffect, useRef } from "react";
import {
  X,
  Minus,
  Paperclip,
  Send,
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  Trash2,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { getComposeStyle, setComposeStyle } from "../settings";

export interface ComposeDraft {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  from?: string;
  attachments?: File[];
  // Set when this draft was opened from the Drafts folder -- lets saving
  // and sending replace the original message instead of duplicating it.
  draftUid?: number;
  draftFolder?: string;
  // Set when replying/forwarding -- carried through to the outgoing
  // In-Reply-To/References headers so the message threads with its parent.
  inReplyTo?: string;
  references?: string[];
  // Set when replying/forwarding -- the previous message's content, kept
  // out of `body` so it renders as its own read-only block instead of
  // sharing the textarea with what the user is actively typing. Appended
  // back onto `body` at send time (see App.tsx's handleSend).
  quoteHeading?: string;
  quoteBody?: string;
}

interface ComposeModalProps {
  initialDraft: ComposeDraft;
  onClose: () => void;
  onSaveDraft: (draft: ComposeDraft) => void;
  onSend: (draft: ComposeDraft) => void;
  onDeleteDraft?: (draft: ComposeDraft) => void;
  onValidationError: (message: string) => void;
  primaryEmail: string;
  aliases: string[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// A small bottom-right popup (the default desktop "compose style") doesn't
// work on a phone screen -- there's no room for it next to real content, and
// the on-screen keyboard eats whatever little height it had. Every mobile
// mail client (Gmail, Apple Mail, ...) opens compose full-screen instead, so
// force that below the `md` breakpoint regardless of the user's desktop
// popup/full preference (see `full`/`toggleFull` below, still desktop-only).
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export function ComposeModal({
  initialDraft,
  onClose,
  onSaveDraft,
  onSend,
  onDeleteDraft,
  onValidationError,
  primaryEmail,
  aliases,
}: ComposeModalProps) {
  const [draft, setDraft] = useState<ComposeDraft>({
    from: primaryEmail,
    attachments: [],
    ...initialDraft,
  });
  const [minimized, setMinimized] = useState(false);
  const [full, setFull] = useState(() => getComposeStyle() === "full");
  const isMobile = useIsMobile();
  const effectiveFull = full || isMobile;
  const [showCc, setShowCc] = useState(
    Boolean(initialDraft.cc || initialDraft.bcc),
  );
  const [quoteExpanded, setQuoteExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function isEmpty(d: ComposeDraft) {
    return (
      !d.subject.trim() &&
      !d.body.trim() &&
      !d.quoteBody?.trim() &&
      (d.attachments?.length ?? 0) === 0
    );
  }

  function toggleFull() {
    const next = !full;
    setFull(next);
    setComposeStyle(next ? "full" : "popup");
  }

  function handleCloseWithSave() {
    const hasContent =
      draft.to.trim() ||
      draft.subject.trim() ||
      draft.body.trim() ||
      (draft.attachments?.length ?? 0) > 0;
    if (hasContent) onSaveDraft(draft);
    onClose();
  }

  useEffect(() => {
    setDraft({ from: primaryEmail, attachments: [], ...initialDraft });
    setShowCc(Boolean(initialDraft.cc || initialDraft.bcc));
    setQuoteExpanded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    // Snapshot into a real array synchronously, here -- the file input's
    // onChange clears the input (e.target.value = '') right after this
    // returns, which also empties the live FileList e.target.files still
    // references. Array.from(files) deferred into the setState updater
    // (React doesn't always run updater functions synchronously) would
    // iterate that already-emptied FileList and silently drop every file.
    const picked = Array.from(files);
    setDraft((d) => ({
      ...d,
      attachments: [...(d.attachments || []), ...picked],
    }));
  }

  function removeFile(index: number) {
    setDraft((d) => ({
      ...d,
      attachments: (d.attachments || []).filter((_, i) => i !== index),
    }));
  }

  async function handleSend() {
    if (!draft.to.trim()) {
      onValidationError("Add at least one recipient before sending");
      return;
    }
    if (isEmpty(draft)) {
      onValidationError(
        "Cannot send an empty message -- add a subject, body, or attachment",
      );
      return;
    }
    setSending(true);
    try {
      await onSend(draft);
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (!onDeleteDraft) return;
    setDeleting(true);
    try {
      await onDeleteDraft(draft);
    } finally {
      setDeleting(false);
    }
  }

  if (minimized) {
    return (
      <div
        className="fixed bottom-0 right-3 z-50 w-72 max-w-[calc(100vw-1.5rem)] cursor-pointer rounded-t-xl border border-b-0 px-4 py-3 shadow-lg sm:right-6"
        style={{
          background: "var(--bg-elevated)",
          borderColor: "var(--border)",
        }}
        onClick={() => setMinimized(false)}
      >
        <div className="flex items-center justify-between">
          <span
            className="truncate text-sm font-medium"
            style={{ color: "var(--text)" }}
          >
            {draft.subject || "New message"}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCloseWithSave();
            }}
            style={{ color: "var(--text-faint)" }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        effectiveFull
          ? "fixed inset-0 z-50 flex flex-col overflow-hidden border-0 shadow-2xl sm:inset-4 sm:rounded-xl sm:border md:inset-10"
          : "fixed bottom-0 inset-x-3 z-50 flex flex-col overflow-hidden rounded-t-xl border border-b-0 shadow-2xl sm:inset-x-auto sm:right-6 sm:w-[440px]"
      }
      style={{
        background: "var(--bg-elevated)",
        borderColor: "var(--border)",
        maxHeight: effectiveFull ? undefined : "min(32rem, 85vh)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: "var(--accent)" }}
      >
        <span className="text-sm font-medium text-white">New message</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="rounded p-1 text-white/90 hover:bg-white/10"
          >
            <Minus size={15} />
          </button>
          {!isMobile && (
            <button
              onClick={toggleFull}
              className="rounded p-1 text-white/90 hover:bg-white/10"
              title={full ? "Restore" : "Maximize"}
            >
              {full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}
          <button
            onClick={handleCloseWithSave}
            className="rounded p-1 text-white/90 hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Scrolls independently of the header/footer so the Send button
          below stays reachable even when the on-screen keyboard (mobile)
          or a long quote/attachment list eats most of the modal's height. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div
          className="flex flex-col gap-0 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          {aliases.length > 0 && (
            <div
              className="relative border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <select
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                className="w-full appearance-none px-4 py-2.5 text-base outline-none sm:text-sm"
                style={{ color: "var(--text)", background: "transparent" }}
              >
                <option value={primaryEmail}>From: {primaryEmail}</option>
                {aliases.map((alias) => (
                  <option key={alias} value={alias}>
                    From: {alias}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-faint)" }}
              />
            </div>
          )}
          <div className="flex items-center">
            <input
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              placeholder="To"
              className="flex-1 border-b px-4 py-2.5 text-base outline-none sm:text-sm"
              style={{
                borderColor: "var(--border)",
                color: "var(--text)",
                background: "transparent",
              }}
            />
            {!showCc && (
              <button
                onClick={() => setShowCc(true)}
                className="border-b px-3 py-2.5 text-xs font-medium"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-faint)",
                }}
              >
                Cc/Bcc
              </button>
            )}
          </div>
          {showCc && (
            <>
              <input
                value={draft.cc || ""}
                onChange={(e) => setDraft({ ...draft, cc: e.target.value })}
                placeholder="Cc"
                className="border-b px-4 py-2.5 text-base outline-none sm:text-sm"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text)",
                  background: "transparent",
                }}
              />
              <input
                value={draft.bcc || ""}
                onChange={(e) => setDraft({ ...draft, bcc: e.target.value })}
                placeholder="Bcc"
                className="border-b px-4 py-2.5 text-base outline-none sm:text-sm"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text)",
                  background: "transparent",
                }}
              />
            </>
          )}
          <input
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            placeholder="Subject"
            className="px-4 py-2.5 text-base outline-none sm:text-sm"
            style={{ color: "var(--text)", background: "transparent" }}
          />
        </div>

        <textarea
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          placeholder="Write your message..."
          className="flex-1 resize-none px-4 py-3 text-base outline-none sm:text-sm"
          style={{
            color: "var(--text)",
            background: "transparent",
            minHeight: "140px",
          }}
        />

        {(draft.quoteBody || draft.quoteHeading) && (
          <div
            className="shrink-0 border-t"
            style={{ borderColor: "var(--border)" }}
          >
            <button
              onClick={() => setQuoteExpanded((v) => !v)}
              className="flex w-full items-center gap-1.5 px-4 py-2 text-xs font-medium"
              style={{ color: "var(--text-faint)" }}
            >
              {quoteExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span>
                {quoteExpanded ? "Hide quoted text" : "Show quoted text"}
              </span>
            </button>
            {quoteExpanded && (
              <div
                className="mx-4 mb-3 max-h-48 overflow-y-auto rounded-lg border-l-4 px-3 py-2 text-xs leading-relaxed"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-faint)",
                }}
              >
                {draft.quoteHeading && (
                  <p
                    className="mb-1.5 whitespace-pre-wrap font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {draft.quoteHeading}
                  </p>
                )}
                {draft.quoteBody && (
                  <pre className="whitespace-pre-wrap font-sans">
                    {draft.quoteBody}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        {(draft.attachments?.length || 0) > 0 && (
          <div
            className="flex flex-wrap gap-2 border-t px-4 py-3"
            style={{ borderColor: "var(--border)" }}
          >
            {draft.attachments!.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-muted)",
                }}
              >
                <FileIcon size={13} />
                <span className="max-w-[140px] truncate">{file.name}</span>
                <span style={{ color: "var(--text-faint)" }}>
                  {formatSize(file.size)}
                </span>
                <button
                  onClick={() => removeFile(i)}
                  style={{ color: "var(--text-faint)" }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className="flex items-center justify-between border-t px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={handleSend}
          disabled={sending}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {sending ? "Sending…" : "Send"}
          <Send size={14} />
        </button>
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ color: "var(--text-faint)" }}
            className="rounded-lg p-2 hover:opacity-80"
            title="Attach files"
          >
            <Paperclip size={17} />
          </button>
          {onDeleteDraft && draft.draftUid != null && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ color: "var(--danger)" }}
              className="rounded-lg p-2 hover:opacity-80 disabled:opacity-60"
              title="Delete draft"
            >
              <Trash2 size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
