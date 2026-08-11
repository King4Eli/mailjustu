import { useState } from "react";
import { X, Plus, Trash2, Ban, ShieldCheck, AtSign, Globe } from "lucide-react";
import type { MailFilter } from "../api";

type SenderMatchType = "equals" | "domain";

interface BlockListModalProps {
  filters: MailFilter[];
  onClose: () => void;
  onAddBlocked: (value: string, matchType: SenderMatchType) => Promise<void>;
  onAddAllowed: (value: string, matchType: SenderMatchType) => Promise<void>;
  onRemove: (id: number) => void;
}

function isSenderRule(f: MailFilter, action: MailFilter["action"]) {
  return (
    f.field === "from" &&
    (f.match_type === "equals" || f.match_type === "domain") &&
    f.action === action
  );
}

// Accepts a pasted full address ("user@spammer.com") when adding a
// domain entry and just keeps the part after "@", so pasting an email by
// habit still does the right thing instead of erroring.
function normalizeDomainInput(raw: string): string {
  const trimmed = raw.trim().replace(/^@+/, "");
  const at = trimmed.indexOf("@");
  return at >= 0 ? trimmed.slice(at + 1) : trimmed;
}

function AddressList({
  title,
  icon: Icon,
  entries,
  onAdd,
  onRemove,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number }>;
  entries: MailFilter[];
  onAdd: (value: string, matchType: SenderMatchType) => Promise<void>;
  onRemove: (id: number) => void;
}) {
  const [matchType, setMatchType] = useState<SenderMatchType>("equals");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const normalized =
      matchType === "domain" ? normalizeDomainInput(value) : value.trim();
    if (!normalized) return;
    setBusy(true);
    try {
      await onAdd(normalized, matchType);
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3
        className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--text-faint)" }}
      >
        <Icon size={13} />
        {title}
      </h3>
      <form onSubmit={handleAdd} className="mb-2 flex flex-col gap-1.5">
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              matchType === "domain" ? "spammer.com" : "someone@example.com"
            }
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
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="flex gap-3 px-1">
          <label
            className="flex items-center gap-1.5 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <input
              type="radio"
              checked={matchType === "equals"}
              onChange={() => setMatchType("equals")}
              style={{ accentColor: "var(--accent)" }}
            />
            <AtSign size={12} />
            Exact address
          </label>
          <label
            className="flex items-center gap-1.5 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <input
              type="radio"
              checked={matchType === "domain"}
              onChange={() => setMatchType("domain")}
              style={{ accentColor: "var(--accent)" }}
            />
            <Globe size={12} />
            Whole domain
          </label>
        </div>
      </form>
      {error && (
        <p className="mb-2 text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <div className="flex flex-col gap-1">
        {entries.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
            style={{ background: "var(--bg-hover)", color: "var(--text)" }}
          >
            {f.match_type === "domain" ? (
              <Globe size={12} style={{ color: "var(--text-faint)" }} />
            ) : (
              <AtSign size={12} style={{ color: "var(--text-faint)" }} />
            )}
            <span className="flex-1 truncate">
              {f.match_type === "domain" ? `*@${f.value}` : f.value}
            </span>
            <button
              onClick={() => onRemove(f.id)}
              style={{ color: "var(--text-faint)" }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="py-1 text-xs" style={{ color: "var(--text-faint)" }}>
            None yet.
          </p>
        )}
      </div>
    </div>
  );
}

export function BlockListModal({
  filters,
  onClose,
  onAddBlocked,
  onAddAllowed,
  onRemove,
}: BlockListModalProps) {
  const blocked = filters.filter((f) => isSenderRule(f, "delete"));
  const allowed = filters.filter((f) => isSenderRule(f, "allow"));

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
            Allow &amp; block lists
          </h2>
          <button onClick={onClose} style={{ color: "var(--text-faint)" }}>
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-xs" style={{ color: "var(--text-faint)" }}>
          Blocked senders/domains are silently discarded at delivery -- they
          never reach any folder. Allowed senders/domains always get
          through, even if a block rule below would otherwise also match
          them.
        </p>

        <div className="flex flex-col gap-5">
          <AddressList
            title="Blocked"
            icon={Ban}
            entries={blocked}
            onAdd={onAddBlocked}
            onRemove={onRemove}
          />
          <AddressList
            title="Allowed"
            icon={ShieldCheck}
            entries={allowed}
            onAdd={onAddAllowed}
            onRemove={onRemove}
          />
        </div>
      </div>
    </div>
  );
}
