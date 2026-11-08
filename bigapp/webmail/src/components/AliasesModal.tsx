import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import type { ApiAlias } from "../api";

interface AliasesModalProps {
  aliases: ApiAlias[];
  onClose: () => void;
  onCreate: (alias: string) => Promise<void>;
  onDelete: (id: number) => void;
}

export function AliasesModal({
  aliases,
  onClose,
  onCreate,
  onDelete,
}: AliasesModalProps) {
  const [alias, setAlias] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onCreate(alias.trim());
      setAlias("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create alias");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border p-5 shadow-xl"
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
            Your aliases
            {aliases.length > 0 && (
              <span
                className="ml-1.5 font-normal"
                style={{ color: "var(--text-faint)" }}
              >
                ({aliases.length})
              </span>
            )}
          </h2>
          <button onClick={onClose} style={{ color: "var(--text-faint)" }}>
            <X size={20} />
          </button>
        </div>

        <p className="mb-3 text-xs" style={{ color: "var(--text-faint)" }}>
          Mail to an alias lands here. You can send as any of them too.
        </p>

        <form onSubmit={handleCreate} className="mb-4 flex gap-2">
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="alias@mail.example.com"
            required
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              borderColor: "var(--border)",
              color: "var(--text)",
              background: "transparent",
            }}
          />
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            <Plus size={17} /> Add
          </button>
        </form>
        {error && (
          <p className="mb-3 text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-2">
          {aliases.map((a) => (
            <div
              key={a.id}
              className="flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--bg-hover)", color: "var(--text)" }}
            >
              <span className="min-w-0 truncate" title={a.source}>
                {a.source}
              </span>
              <button
                onClick={() => onDelete(a.id)}
                aria-label={`Delete alias ${a.source}`}
                className="shrink-0"
                style={{ color: "var(--text-faint)" }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {aliases.length === 0 && (
            <p
              className="py-2 text-center text-sm"
              style={{ color: "var(--text-faint)" }}
            >
              No aliases yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
