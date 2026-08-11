import { useEffect, useRef, useState } from "react";
import {
  Star,
  Paperclip,
  AtSign,
  X,
  Archive,
  Trash2,
  ShieldAlert,
  ShieldCheck,
  FolderInput,
  Loader2,
} from "lucide-react";
import type { EmailMessage, FolderInfo, MessageFilter } from "../types";
import { formatListDate, initials, avatarColor } from "../utils";

interface MessageListProps {
  messages: EmailMessage[];
  selectedId: string | null;
  onSelect: (message: EmailMessage) => void;
  onToggleStar: (id: string) => void;
  folderLabel: string;
  filter: MessageFilter;
  onFilterChange: (filter: MessageFilter) => void;
  // User-resizable; only applied at the md+ breakpoint.
  width: number;
  // Set when a sidebar alias is selected -- narrows `messages` further.
  activeAliasFilter: string | null;
  onClearAliasFilter: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  folders: FolderInfo[];
  isSpamFolder: boolean;
  onBulkArchive: () => void;
  onBulkDelete: () => void;
  onBulkMarkSpam: () => void;
  onBulkMarkNotSpam: () => void;
  onBulkMoveTo: (target: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onEmptyFolder?: () => void;
  // True during a bulk action/empty-folder -- disables controls, shows a spinner.
  busy: boolean;
  // Used to re-arm the load-more trigger on folder switch (see armedRef).
  folderId: string;
}

// How close to the bottom (in px) triggers "load more".
const LOAD_MORE_THRESHOLD_PX = 200;

function useIsMdUp() {
  const [isMdUp, setIsMdUp] = useState(
    () => window.matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = () => setIsMdUp(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMdUp;
}

const FILTERS: { id: MessageFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "read", label: "Read" },
  { id: "starred", label: "Starred" },
  { id: "attachments", label: "Attachments" },
];

function BulkButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="rounded-lg p-1.5 transition disabled:cursor-not-allowed disabled:opacity-40"
      style={{ color: "var(--accent)" }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon size={15} />
    </button>
  );
}

export function MessageList({
  messages,
  selectedId,
  onSelect,
  onToggleStar,
  folderLabel,
  filter,
  onFilterChange,
  width,
  activeAliasFilter,
  onClearAliasFilter,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onClearSelection,
  folders,
  isSpamFolder,
  onBulkArchive,
  onBulkDelete,
  onBulkMarkSpam,
  onBulkMarkNotSpam,
  onBulkMoveTo,
  hasMore,
  loadingMore,
  onLoadMore,
  onEmptyFolder,
  busy,
  folderId,
}: MessageListProps) {
  const isMdUp = useIsMdUp();
  const allSelected =
    messages.length > 0 && selectedIds.size === messages.length;

  // Gates onLoadMore to one fire per approach to the bottom -- a ref (not
  // state) so it takes effect synchronously within the same scroll event.
  const armedRef = useRef(true);

  useEffect(() => {
    armedRef.current = true;
  }, [folderId]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom >= LOAD_MORE_THRESHOLD_PX) {
      armedRef.current = true;
      return;
    }
    if (armedRef.current && hasMore && !loadingMore) {
      armedRef.current = false;
      onLoadMore();
    }
  }

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden border-r"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-elevated)",
        ...(isMdUp ? { width } : {}),
      }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2.5">
          {messages.length > 0 && (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleSelectAll}
              title="Select all"
              className="h-4 w-4 cursor-pointer"
              style={{ accentColor: "var(--accent)" }}
            />
          )}
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--text)" }}
          >
            {folderLabel}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {onEmptyFolder && messages.length > 0 && (
            <button
              onClick={onEmptyFolder}
              disabled={busy}
              title={busy ? "Emptying…" : `Empty ${folderLabel}`}
              className="flex items-center gap-1 text-xs font-medium transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ color: "var(--text-faint)" }}
            >
              {busy ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Trash2 size={13} />
              )}
              {busy ? "Emptying…" : "Empty"}
            </button>
          )}
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>
            {messages.length} {messages.length === 1 ? "message" : "messages"}
          </span>
        </div>
      </div>

      {activeAliasFilter && (
        <div
          className="flex items-center gap-2 border-b px-4 py-2 text-xs font-medium"
          style={{
            borderColor: "var(--border)",
            background: "var(--accent-soft)",
            color: "var(--accent)",
          }}
        >
          <AtSign size={13} className="shrink-0" />
          <span className="flex-1 truncate">
            Only mail to {activeAliasFilter}
          </span>
          <button
            onClick={onClearAliasFilter}
            className="flex shrink-0 items-center gap-1 hover:opacity-80"
            title="Clear alias filter"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div
          className="flex items-center gap-1 border-b px-3 py-2"
          style={{
            borderColor: "var(--border)",
            background: "var(--accent-soft)",
          }}
        >
          {busy && (
            <Loader2
              size={14}
              className="shrink-0 animate-spin"
              style={{ color: "var(--accent)" }}
            />
          )}
          <span
            className="mr-1 shrink-0 text-xs font-semibold"
            style={{ color: "var(--accent)" }}
          >
            {busy ? "Working…" : `${selectedIds.size} selected`}
          </span>
          <BulkButton
            icon={Archive}
            label="Archive"
            onClick={onBulkArchive}
            disabled={busy}
          />
          {isSpamFolder ? (
            <BulkButton
              icon={ShieldCheck}
              label="Not spam"
              onClick={onBulkMarkNotSpam}
              disabled={busy}
            />
          ) : (
            <BulkButton
              icon={ShieldAlert}
              label="Mark as spam"
              onClick={onBulkMarkSpam}
              disabled={busy}
            />
          )}
          <BulkButton
            icon={Trash2}
            label="Delete"
            onClick={onBulkDelete}
            disabled={busy}
          />
          <div className="relative flex items-center">
            <FolderInput
              size={13}
              className="pointer-events-none absolute left-2"
              style={{ color: "var(--accent)" }}
            />
            <select
              value=""
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) onBulkMoveTo(e.target.value);
              }}
              title="Move to folder"
              className="appearance-none rounded-lg bg-transparent py-1.5 pl-7 pr-2 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-50"
              style={{ color: "var(--accent)" }}
            >
              <option value="" disabled>
                Move to...
              </option>
              {folders
                .filter((f) => f.id !== "STARRED" && f.id !== "SNOOZED")
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex-1" />
          <button
            onClick={onClearSelection}
            disabled={busy}
            className="shrink-0 text-xs font-medium hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: "var(--accent)" }}
          >
            Clear
          </button>
        </div>
      )}

      <div
        className="flex items-center gap-1 overflow-x-auto border-b px-3 py-2"
        style={{ borderColor: "var(--border)" }}
      >
        {FILTERS.map((f) => {
          const isActive = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => onFilterChange(f.id)}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition"
              style={{
                background: isActive ? "var(--accent)" : "var(--bg-hover)",
                color: isActive ? "white" : "var(--text-muted)",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm" style={{ color: "var(--text-faint)" }}>
              No messages here.
            </p>
          </div>
        )}
        {messages.map((message) => {
          const isSelected = message.id === selectedId;
          const isChecked = selectedIds.has(message.id);
          return (
            <div
              key={message.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(message)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(message);
                }
              }}
              className="flex w-full cursor-pointer items-start gap-3 border-b px-4 py-3 text-left transition"
              style={{
                borderColor: "var(--border)",
                background: isSelected ? "var(--bg-selected)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!isSelected)
                  e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isSelected)
                  e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                className="mt-1.5 flex shrink-0 items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleSelect(message.id)}
                  className="h-4 w-4 cursor-pointer"
                  style={{ accentColor: "var(--accent)" }}
                />
              </span>

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
                      color: "var(--text)",
                      fontWeight: message.read ? 500 : 700,
                    }}
                  >
                    {message.from.name}
                  </span>
                  <span
                    className="shrink-0 text-xs"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {formatListDate(message.date)}
                  </span>
                </div>
                <div
                  className="flex items-center gap-1.5 truncate text-sm"
                  style={{
                    color: "var(--text)",
                    fontWeight: message.read ? 400 : 600,
                  }}
                >
                  <span className="truncate">{message.subject}</span>
                  {message.threadMessages &&
                    message.threadMessages.length > 1 && (
                      <span
                        className="shrink-0 rounded-full px-1.5 text-xs font-semibold"
                        style={{
                          background: "var(--bg-hover)",
                          color: "var(--text-faint)",
                        }}
                      >
                        {message.threadMessages.length}
                      </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                  <p
                    className="truncate text-xs"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {message.preview}
                  </p>
                  {message.attachments && message.attachments.length > 0 && (
                    <Paperclip
                      size={12}
                      className="shrink-0"
                      style={{ color: "var(--text-faint)" }}
                    />
                  )}
                </div>
              </div>

              <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1.5">
                {!message.read && (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: "var(--unread-dot)" }}
                  />
                )}
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(message.id);
                  }}
                >
                  <Star
                    size={15}
                    fill={message.starred ? "var(--accent)" : "none"}
                    style={{
                      color: message.starred
                        ? "var(--accent)"
                        : "var(--text-faint)",
                    }}
                  />
                </span>
              </div>
            </div>
          );
        })}
        {loadingMore && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2
              size={16}
              className="animate-spin"
              style={{ color: "var(--text-faint)" }}
            />
            <span className="text-xs" style={{ color: "var(--text-faint)" }}>
              Loading more…
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
