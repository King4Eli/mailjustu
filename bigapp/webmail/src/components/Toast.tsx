import { useCallback, useRef, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

export interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error";
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, type: ToastItem["type"] = "error") => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev, { id, message, type }]);
      window.setTimeout(() => dismiss(id), type === "error" ? 6000 : 3500);
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg"
          style={{
            background: "var(--bg-elevated)",
            borderColor:
              toast.type === "error" ? "var(--danger)" : "var(--border)",
            color: "var(--text)",
          }}
        >
          {toast.type === "error" ? (
            <XCircle
              size={16}
              className="mt-0.5 shrink-0"
              style={{ color: "var(--danger)" }}
            />
          ) : (
            <CheckCircle2
              size={16}
              className="mt-0.5 shrink-0"
              style={{ color: "var(--accent)" }}
            />
          )}
          <span className="min-w-0 flex-1">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            style={{ color: "var(--text-faint)" }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
