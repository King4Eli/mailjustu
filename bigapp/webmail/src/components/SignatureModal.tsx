import { useState } from "react";
import { X } from "lucide-react";

interface SignatureModalProps {
  initialSignature: string;
  onClose: () => void;
  onSave: (signature: string) => void;
}

export function SignatureModal({
  initialSignature,
  onClose,
  onSave,
}: SignatureModalProps) {
  const [signature, setSignature] = useState(initialSignature);

  function handleSave() {
    onSave(signature.trim());
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        className="w-full max-w-md rounded-2xl border p-5 shadow-xl"
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
            Signature
          </h2>
          <button onClick={onClose} style={{ color: "var(--text-faint)" }}>
            <X size={18} />
          </button>
        </div>

        <p className="mb-3 text-xs" style={{ color: "var(--text-faint)" }}>
          Appended to new messages and replies -- stored on this device only,
          not synced across browsers.
        </p>

        <textarea
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          rows={5}
          placeholder="Jane Doe&#10;jane@example.com"
          className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
          style={{
            borderColor: "var(--border)",
            color: "var(--text)",
            background: "transparent",
          }}
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg px-3 py-2 text-sm font-medium text-white"
            style={{ background: "var(--accent)" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
