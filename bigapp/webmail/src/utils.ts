import type { EmailMessage } from "./types";

// Merges Inbox + Sent into conversations. Only surfaces threads with an Inbox message.
export function buildInboxThreads(
  inboxMessages: EmailMessage[],
  sentMessages: EmailMessage[],
): EmailMessage[] {
  const inboxSet = new Set(inboxMessages);
  const byThread = new Map<string, EmailMessage[]>();
  const standalone: EmailMessage[] = [];

  for (const m of [...inboxMessages, ...sentMessages]) {
    if (!m.threadId) {
      standalone.push(m);
      continue;
    }
    const list = byThread.get(m.threadId);
    if (list) list.push(m);
    else byThread.set(m.threadId, [m]);
  }

  const result: EmailMessage[] = standalone.filter((m) => inboxSet.has(m));

  for (const group of byThread.values()) {
    if (!group.some((m) => inboxSet.has(m))) continue;
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const sorted = [...group].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    result.push({ ...sorted[sorted.length - 1], threadMessages: sorted });
  }

  return result.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export function formatListDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

export function formatFullDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  "#5b5bf5",
  "#e0433d",
  "#0d9488",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#059669",
  "#2563eb",
];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
