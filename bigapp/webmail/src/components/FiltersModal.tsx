import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import type { MailFilter, MailFilterInput } from "../api";
import type { FolderInfo } from "../types";

interface FiltersModalProps {
  filters: MailFilter[];
  folders: FolderInfo[];
  onClose: () => void;
  onCreate: (input: MailFilterInput) => Promise<void>;
  onToggle: (id: number, enabled: boolean) => void;
  onDelete: (id: number) => void;
}

const FIELD_LABELS: Record<MailFilter["field"], string> = {
  from: "From",
  to: "To",
  subject: "Subject",
};

const ACTION_LABELS: Record<MailFilter["action"], string> = {
  move: "Move to",
  delete: "Delete it",
  mark_read: "Mark as read",
  star: "Star it",
  allow: "Always allow it through",
};

function describeFilter(f: MailFilter): string {
  const match =
    f.match_type === "equals"
      ? "is"
      : f.match_type === "domain"
        ? "is from domain"
        : "contains";
  const action =
    f.action === "move"
      ? `${ACTION_LABELS.move} ${f.action_folder}`
      : ACTION_LABELS[f.action];
  return `If ${FIELD_LABELS[f.field]} ${match} "${f.value}" → ${action}`;
}

export function FiltersModal({
  filters,
  folders,
  onClose,
  onCreate,
  onToggle,
  onDelete,
}: FiltersModalProps) {
  const [name, setName] = useState("");
  const [field, setField] = useState<MailFilter["field"]>("from");
  const [matchType, setMatchType] =
    useState<MailFilter["match_type"]>("contains");
  const [value, setValue] = useState("");
  const [action, setAction] = useState<MailFilter["action"]>("move");
  const [actionFolder, setActionFolder] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const movableFolders = folders.filter((f) => f.id !== "STARRED");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !value.trim()) {
      setError("Name and value are required");
      return;
    }
    if (action === "move" && !actionFolder) {
      setError("Pick a folder to move matching mail into");
      return;
    }
    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        field,
        matchType,
        value: value.trim(),
        action,
        actionFolder: action === "move" ? actionFolder : undefined,
      });
      setName("");
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create filter");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        className="w-full max-w-lg rounded-2xl border p-5 shadow-xl"
        style={{
          background: "var(--bg-elevated)",
          borderColor: "var(--border)",
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--text)" }}
          >
            Mail filters
          </h2>
          <button onClick={onClose} style={{ color: "var(--text-faint)" }}>
            <X size={18} />
          </button>
        </div>

        <p className="mb-3 text-xs" style={{ color: "var(--text-faint)" }}>
          Runs even when this app is closed.
        </p>

        <form
          onSubmit={handleCreate}
          className="mb-4 flex flex-col gap-2 rounded-lg border p-3"
          style={{ borderColor: "var(--border)" }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rule name (e.g. Newsletter)"
            className="rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              borderColor: "var(--border)",
              color: "var(--text)",
              background: "transparent",
            }}
          />
          <div className="flex gap-2">
            <select
              value={field}
              onChange={(e) => setField(e.target.value as MailFilter["field"])}
              className="flex-1 rounded-lg border px-2 py-2 text-sm outline-none"
              style={{
                borderColor: "var(--border)",
                color: "var(--text)",
                background: "transparent",
              }}
            >
              <option value="from">From</option>
              <option value="to">To</option>
              <option value="subject">Subject</option>
            </select>
            <select
              value={matchType}
              onChange={(e) =>
                setMatchType(e.target.value as MailFilter["match_type"])
              }
              className="flex-1 rounded-lg border px-2 py-2 text-sm outline-none"
              style={{
                borderColor: "var(--border)",
                color: "var(--text)",
                background: "transparent",
              }}
            >
              <option value="contains">contains</option>
              <option value="equals">is exactly</option>
              <option value="domain">is from domain</option>
            </select>
          </div>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Value to match"
            className="rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              borderColor: "var(--border)",
              color: "var(--text)",
              background: "transparent",
            }}
          />
          <div className="flex gap-2">
            <select
              value={action}
              onChange={(e) =>
                setAction(e.target.value as MailFilter["action"])
              }
              className="flex-1 rounded-lg border px-2 py-2 text-sm outline-none"
              style={{
                borderColor: "var(--border)",
                color: "var(--text)",
                background: "transparent",
              }}
            >
              <option value="move">Move to folder</option>
              <option value="delete">Delete it</option>
              <option value="mark_read">Mark as read</option>
              <option value="star">Star it</option>
              <option value="allow">Always allow it through</option>
            </select>
            {action === "move" && (
              <select
                value={actionFolder}
                onChange={(e) => setActionFolder(e.target.value)}
                className="flex-1 rounded-lg border px-2 py-2 text-sm outline-none"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text)",
                  background: "transparent",
                }}
              >
                <option value="">Choose folder...</option>
                {movableFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            <Plus size={15} />
            {busy ? "Saving…" : "Add rule"}
          </button>
        </form>

        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {filters.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--bg-hover)", color: "var(--text)" }}
            >
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={(e) => onToggle(f.id, e.target.checked)}
                className="h-4 w-4 shrink-0 cursor-pointer"
                style={{ accentColor: "var(--accent)" }}
                title={f.enabled ? "Enabled" : "Disabled"}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{f.name}</p>
                <p
                  className="truncate text-xs"
                  style={{ color: "var(--text-faint)" }}
                >
                  {describeFilter(f)}
                </p>
              </div>
              <button
                onClick={() => onDelete(f.id)}
                style={{ color: "var(--text-faint)" }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {filters.length === 0 && (
            <p
              className="py-2 text-center text-sm"
              style={{ color: "var(--text-faint)" }}
            >
              No filters yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
