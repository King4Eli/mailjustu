import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { MessageList } from "./components/MessageList";
import { ReadingPane } from "./components/ReadingPane";
import { ComposeModal, type ComposeDraft } from "./components/ComposeModal";
import { AliasesModal } from "./components/AliasesModal";
import { Login } from "./components/Login";
import { useToasts, ToastStack } from "./components/Toast";
import * as api from "./api";
import type { ApiFolder, ApiMessage, ApiAlias } from "./api";
import type { EmailMessage, FolderInfo, MessageFilter } from "./types";
import {
  getListWidth,
  setListWidth as persistListWidth,
  LIST_WIDTH_MIN,
  LIST_WIDTH_MAX,
} from "./settings";
import { buildInboxThreads } from "./utils";

function toEmailMessage(m: ApiMessage, sourceFolder?: string): EmailMessage {
  return {
    id: String(m.uid),
    from: m.from,
    to: m.to,
    cc: m.cc,
    subject: m.subject,
    preview: m.preview || "",
    body: m.body || "",
    html: m.html,
    date: m.date,
    read: m.read,
    starred: m.starred,
    attachments: m.attachments,
    sourceFolder,
    messageId: m.messageId,
    inReplyTo: m.inReplyTo,
    references: m.references,
    threadId: m.threadId,
  };
}

// Used by the silent auto-refresh path to fold a freshly-fetched first page
// into whatever's already on screen (including older pages pulled in by
// "load more") -- fresh entries win for flag/content updates, anything
// older that isn't in the fresh page is left alone rather than dropped.
function mergeById(prev: EmailMessage[], fresh: EmailMessage[]): EmailMessage[] {
  const freshIds = new Set(fresh.map((m) => m.id));
  const keep = prev.filter((m) => !freshIds.has(m.id));
  return [...fresh, ...keep].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

function toFolderInfo(f: ApiFolder): FolderInfo {
  const name = f.specialUse === "\\Junk" ? "Spam" : f.name;
  return {
    id: f.path,
    name,
    icon: f.specialUse || "inbox",
    unseen: f.unseen,
    messages: f.messages,
  };
}

// ComposeModal renders the quoted previous message as its own read-only
// block, separate from `body` (see ComposeDraft) -- but IMAP/SMTP only
// carry one plain-text body, so fold them back into one string wherever a
// draft is actually sent or saved.
function combinedBody(draft: ComposeDraft): string {
  return draft.quoteBody
    ? `${draft.body.trim()}\n\n${draft.quoteHeading ? `${draft.quoteHeading}\n` : ""}${draft.quoteBody}`
    : draft.body;
}

export default function App() {
  const [email, setEmail] = useState<string | null>(
    () => api.getStoredSession()?.email ?? null,
  );
  const [role, setRole] = useState<"super" | "domain" | "user">(
    () => api.getStoredSession()?.role ?? "user",
  );
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [activeFolder, setActiveFolder] = useState("INBOX");
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MessageFilter>("all");
  const [loading, setLoading] = useState(false);
  const { toasts, push, dismiss } = useToasts();
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null);
  const [aliases, setAliases] = useState<ApiAlias[]>([]);
  const [aliasesOpen, setAliasesOpen] = useState(false);
  const [activeAlias, setActiveAlias] = useState<string | null>(null);
  const [usage, setUsage] = useState<{
    usedBytes: number | null;
    quotaMb: number | null;
  } | null>(null);
  const [listWidth, setListWidthState] = useState(() => getListWidth());
  const resizingRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Tracks any bulk/mass operation (bulk archive/delete/spam/move, or
  // emptying a whole folder) that can take a while -- lets the UI disable
  // controls and show a spinner instead of leaving the user unsure whether
  // their click registered.
  const [bulkBusy, setBulkBusy] = useState(false);
  // Pagination/refresh bookkeeping that doesn't need to trigger renders on
  // its own -- cursors for "load more", plus (for the merged Inbox+Sent
  // thread view only) the raw per-folder lists threads are rebuilt from,
  // since `messages` there is a derived, already-threaded view.
  const paginationRef = useRef<{
    mode: "single" | "inbox" | "none";
    before?: number | null;
    inboxBefore?: number | null;
    sentBefore?: number | null;
    inboxRaw?: EmailMessage[];
    sentRaw?: EmailMessage[];
  }>({ mode: "none" });

  async function loadFolders() {
    try {
      const { folders: apiFolders } = await api.getFolders();
      const mapped = apiFolders.map(toFolderInfo);
      const inboxIndex = mapped.findIndex((f) => f.icon === "\\Inbox");
      const starred: FolderInfo = {
        id: "STARRED",
        name: "Starred",
        icon: "starred",
        unseen: 0,
        messages: 0,
      };
      const withStarred =
        inboxIndex >= 0
          ? [
              ...mapped.slice(0, inboxIndex + 1),
              starred,
              ...mapped.slice(inboxIndex + 1),
            ]
          : [starred, ...mapped];
      setFolders(withStarred);
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to load folders");
    }
  }

  async function loadAliases() {
    try {
      const { aliases: apiAliases } = await api.getAliases();
      setAliases(apiAliases);
    } catch {
      // non-fatal, aliases are a secondary feature
    }
  }

  async function loadMessages(folderId: string) {
    setLoading(true);
    setHasMore(false);
    try {
      if (folderId === "STARRED") {
        // Aggregated client-side view across every folder's first page --
        // no stable per-folder cursor to page further on, so pagination is
        // intentionally not offered here.
        paginationRef.current = { mode: "none" };
        const realFolders = folders.filter((f) => f.id !== "STARRED");
        const results = await Promise.all(
          realFolders.map(async (f) => {
            const { messages: apiMessages } = await api.getMessages(f.id);
            return apiMessages
              .filter((m) => m.starred)
              .map((m) => toEmailMessage(m, f.id));
          }),
        );
        const merged = results
          .flat()
          .sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          );
        setMessages(merged);
      } else {
        const inboxFolder = folders.find((f) => f.icon === "\\Inbox");
        const sentFolder = folders.find((f) => f.icon === "\\Sent");
        if (inboxFolder && sentFolder && folderId === inboxFolder.id) {
          const [inboxRes, sentRes] = await Promise.all([
            api.getMessages(inboxFolder.id),
            api.getMessages(sentFolder.id),
          ]);
          const inboxMessages = inboxRes.messages.map((m) =>
            toEmailMessage(m, inboxFolder.id),
          );
          const sentMessages = sentRes.messages.map((m) =>
            toEmailMessage(m, sentFolder.id),
          );
          paginationRef.current = {
            mode: "inbox",
            inboxBefore: inboxRes.nextBefore,
            sentBefore: sentRes.nextBefore,
            inboxRaw: inboxMessages,
            sentRaw: sentMessages,
          };
          setHasMore(Boolean(inboxRes.nextBefore || sentRes.nextBefore));
          setMessages(buildInboxThreads(inboxMessages, sentMessages));
        } else {
          const { messages: apiMessages, nextBefore } =
            await api.getMessages(folderId);
          paginationRef.current = { mode: "single", before: nextBefore };
          setHasMore(nextBefore != null);
          setMessages(
            apiMessages
              .map((m) => toEmailMessage(m))
              .sort(
                (a, b) =>
                  new Date(b.date).getTime() - new Date(a.date).getTime(),
              ),
          );
        }
      }
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreMessages() {
    const p = paginationRef.current;
    if (loadingMore || !hasMore || p.mode === "none") return;
    setLoadingMore(true);
    try {
      if (p.mode === "single") {
        if (p.before == null) return;
        const { messages: apiMessages, nextBefore } = await api.getMessages(
          activeFolder,
          p.before,
        );
        const older = apiMessages.map((m) => toEmailMessage(m));
        setMessages((prev) =>
          [...prev, ...older].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          ),
        );
        paginationRef.current = { ...p, before: nextBefore };
        setHasMore(nextBefore != null);
      } else if (p.mode === "inbox") {
        const inboxFolder = folders.find((f) => f.icon === "\\Inbox");
        const sentFolder = folders.find((f) => f.icon === "\\Sent");
        if (!inboxFolder || !sentFolder) return;
        const [inboxRes, sentRes] = await Promise.all([
          p.inboxBefore != null
            ? api.getMessages(inboxFolder.id, p.inboxBefore)
            : Promise.resolve({ messages: [], nextBefore: null }),
          p.sentBefore != null
            ? api.getMessages(sentFolder.id, p.sentBefore)
            : Promise.resolve({ messages: [], nextBefore: null }),
        ]);
        const olderInbox = inboxRes.messages.map((m) =>
          toEmailMessage(m, inboxFolder.id),
        );
        const olderSent = sentRes.messages.map((m) =>
          toEmailMessage(m, sentFolder.id),
        );
        const allInbox = [...(p.inboxRaw || []), ...olderInbox];
        const allSent = [...(p.sentRaw || []), ...olderSent];
        paginationRef.current = {
          ...p,
          inboxBefore: inboxRes.nextBefore,
          sentBefore: sentRes.nextBefore,
          inboxRaw: allInbox,
          sentRaw: allSent,
        };
        setHasMore(Boolean(inboxRes.nextBefore || sentRes.nextBefore));
        setMessages(buildInboxThreads(allInbox, allSent));
      }
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to load more messages");
    } finally {
      setLoadingMore(false);
    }
  }

  // Polls the active folder in the background so new mail shows up without
  // a page reload or router navigation. Merges into whatever's already
  // rendered (see mergeById) instead of replacing it outright, so it
  // doesn't clobber older pages the user has scrolled/loaded into view.
  async function silentRefresh() {
    if (!email || folders.length === 0 || loading || loadingMore) return;
    if (activeFolder === "STARRED") return;
    try {
      const inboxFolder = folders.find((f) => f.icon === "\\Inbox");
      const sentFolder = folders.find((f) => f.icon === "\\Sent");
      if (inboxFolder && sentFolder && activeFolder === inboxFolder.id) {
        const [inboxRes, sentRes] = await Promise.all([
          api.getMessages(inboxFolder.id),
          api.getMessages(sentFolder.id),
        ]);
        const freshInbox = inboxRes.messages.map((m) =>
          toEmailMessage(m, inboxFolder.id),
        );
        const freshSent = sentRes.messages.map((m) =>
          toEmailMessage(m, sentFolder.id),
        );
        const p = paginationRef.current;
        const mergedInbox = mergeById(p.inboxRaw || [], freshInbox);
        const mergedSent = mergeById(p.sentRaw || [], freshSent);
        paginationRef.current = {
          ...p,
          mode: "inbox",
          inboxRaw: mergedInbox,
          sentRaw: mergedSent,
          inboxBefore: p.inboxBefore ?? inboxRes.nextBefore,
          sentBefore: p.sentBefore ?? sentRes.nextBefore,
        };
        setMessages(buildInboxThreads(mergedInbox, mergedSent));
      } else {
        const { messages: apiMessages } = await api.getMessages(activeFolder);
        const fresh = apiMessages.map((m) => toEmailMessage(m));
        setMessages((prev) => mergeById(prev, fresh));
      }
      loadFolders();
    } catch {
      // Background refresh -- fail quietly rather than toasting on every
      // missed poll (transient network hiccups shouldn't nag the user).
    }
  }

  useEffect(() => {
    if (email) {
      loadFolders();
      loadAliases();
      api
        .getUsage()
        .then(setUsage)
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  // Registered once -- api.ts calls this the moment any request comes back
  // 401, so an expired session drops straight to the Login screen instead
  // of leaving the app rendered with stale data and a toast per failed
  // request. Only resets local React state (see handleLogout for the
  // explicit sign-out path, which also calls the server) -- the token's
  // already invalid server-side, so there's nothing left to tell it.
  useEffect(() => {
    api.onSessionExpired(resetLocalSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (email && folders.length > 0) loadMessages(activeFolder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, activeFolder, folders.length]);

  // Auto-refresh: re-polls the active folder every 30s without a page
  // reload or navigation (see silentRefresh above for the merge logic).
  useEffect(() => {
    if (!email || folders.length === 0) return;
    const interval = setInterval(() => {
      silentRefresh();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, activeFolder, folders.length]);

  if (!email) {
    return (
      <Login
        onLogin={(loggedInEmail, loggedInRole) => {
          setEmail(loggedInEmail);
          setRole(loggedInRole);
        }}
      />
    );
  }

  const searchedMessages = query.trim()
    ? messages.filter(
        (m) =>
          m.subject.toLowerCase().includes(query.toLowerCase()) ||
          m.from.name.toLowerCase().includes(query.toLowerCase()) ||
          m.preview.toLowerCase().includes(query.toLowerCase()),
      )
    : messages;

  const folderMessages = searchedMessages.filter((m) => {
    switch (filter) {
      case "unread":
        return !m.read;
      case "read":
        return m.read;
      case "starred":
        return m.starred;
      case "attachments":
        return (m.attachments?.length ?? 0) > 0;
      default:
        return true;
    }
  });

  // Alias filter is a second, independent axis on top of the folder/pill
  // filters above -- stays active across folder switches so "only mail to
  // sales@..." can be checked in Inbox, then Spam, without re-selecting it.
  const aliasFilteredMessages = activeAlias
    ? folderMessages.filter((m) => {
        const addr = activeAlias.toLowerCase();
        return (
          m.to.some((t) => t.toLowerCase() === addr) ||
          (m.cc || []).some((c) => c.toLowerCase() === addr)
        );
      })
    : folderMessages;

  const folderLabel =
    folders.find((f) => f.id === activeFolder)?.name || activeFolder;
  const currentMessageFolder = selectedMessage?.sourceFolder || activeFolder;
  const isSpamFolder =
    folders.find((f) => f.id === currentMessageFolder)?.icon === "\\Junk";
  const activeFolderIcon = folders.find((f) => f.id === activeFolder)?.icon;
  const canEmptyActiveFolder =
    activeFolderIcon === "\\Trash" || activeFolderIcon === "\\Junk";

  async function handleSelect(message: EmailMessage) {
    const folder = message.sourceFolder || activeFolder;
    const isDraft = folders.find((f) => f.id === folder)?.icon === "\\Drafts";
    if (isDraft) {
      try {
        const { message: detail } = await api.getMessage(
          Number(message.id),
          folder,
        );
        const attachments = await Promise.all(
          (detail.attachments || []).map((a) =>
            api.fetchAttachmentAsFile(
              Number(message.id),
              folder,
              a.index,
              a.name,
            ),
          ),
        );
        setComposeDraft({
          to: detail.to.join(", "),
          cc:
            detail.cc && detail.cc.length > 0
              ? detail.cc.join(", ")
              : undefined,
          subject: detail.subject === "(no subject)" ? "" : detail.subject,
          body: detail.body || "",
          from: email ?? undefined,
          attachments,
          draftUid: Number(message.id),
          draftFolder: folder,
        });
      } catch (err) {
        push(err instanceof Error ? err.message : "Failed to load draft");
      }
      return;
    }
    setSelectedId(message.id);
    try {
      if (message.threadMessages && message.threadMessages.length > 1) {
        const details = await Promise.all(
          message.threadMessages.map(async (m) => {
            const { message: detail } = await api.getMessage(
              Number(m.id),
              m.sourceFolder || folder,
            );
            return toEmailMessage(detail, m.sourceFolder);
          }),
        );
        const sorted = details.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
        setSelectedMessage({
          ...sorted[sorted.length - 1],
          threadMessages: sorted,
        });
      } else {
        const { message: detail } = await api.getMessage(
          Number(message.id),
          folder,
        );
        setSelectedMessage(toEmailMessage(detail, message.sourceFolder));
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, read: true } : m)),
      );
      loadFolders();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to load message");
    }
  }

  async function saveDraft(draft: ComposeDraft) {
    try {
      await api.saveDraft({ ...draft, body: combinedBody(draft) });
      loadFolders();
      const draftsFolderId = folders.find((f) => f.icon === "\\Drafts")?.id;
      if (draftsFolderId && activeFolder === draftsFolderId)
        loadMessages(draftsFolderId);
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to save draft");
    }
  }

  async function handleDeleteDraft(draft: ComposeDraft) {
    if (draft.draftUid == null || !draft.draftFolder) {
      setComposeDraft(null);
      return;
    }
    try {
      await api.discardDraft(draft.draftUid, draft.draftFolder);
      setComposeDraft(null);
      loadFolders();
      const draftsFolderId = folders.find((f) => f.icon === "\\Drafts")?.id;
      if (draftsFolderId && activeFolder === draftsFolderId)
        loadMessages(draftsFolderId);
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to delete draft");
    }
  }

  async function toggleStar(id: string) {
    const message =
      messages.find((m) => m.id === id) ||
      (selectedMessage?.id === id ? selectedMessage : null);
    if (!message) return;
    const folder = message.sourceFolder || activeFolder;
    const nextStarred = !message.starred;
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, starred: nextStarred } : m)),
    );
    if (selectedMessage?.id === id)
      setSelectedMessage({ ...selectedMessage, starred: nextStarred });
    try {
      await api.setFlag(Number(id), folder, "starred", nextStarred);
      if (activeFolder === "STARRED" && !nextStarred) {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to update star");
    }
  }

  function clearSelectionAndRemove(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    setSelectedId(null);
    setSelectedMessage(null);
    loadFolders();
  }

  function toggleMessageSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === aliasFilteredMessages.length &&
      aliasFilteredMessages.length > 0
        ? new Set()
        : new Set(aliasFilteredMessages.map((m) => m.id)),
    );
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function removeMessagesFromList(ids: string[]) {
    const idSet = new Set(ids);
    setMessages((prev) => prev.filter((m) => !idSet.has(m.id)));
    setSelectedIds(new Set());
    if (selectedId && idSet.has(selectedId)) {
      setSelectedId(null);
      setSelectedMessage(null);
    }
    loadFolders();
  }

  async function bulkAction(
    action: (id: string, folder: string) => Promise<unknown>,
    failMessage: string,
    successMessage: (n: number) => string,
  ) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        ids.map((id) => {
          const message = messages.find((m) => m.id === id);
          const folder = message?.sourceFolder || activeFolder;
          return action(id, folder);
        }),
      );
      removeMessagesFromList(ids);
      push(successMessage(ids.length), "success");
    } catch (err) {
      push(err instanceof Error ? err.message : failMessage);
    } finally {
      setBulkBusy(false);
    }
  }

  function bulkArchive() {
    return bulkAction(
      (id, folder) => api.moveMessage(Number(id), folder, "Archive"),
      "Failed to archive messages",
      (n) => `Archived ${n} message${n === 1 ? "" : "s"}`,
    );
  }

  function bulkDelete() {
    return bulkAction(
      (id, folder) => api.deleteMessage(Number(id), folder),
      "Failed to delete messages",
      (n) => `Deleted ${n} message${n === 1 ? "" : "s"}`,
    );
  }

  function bulkMarkSpam() {
    return bulkAction(
      (id, folder) => api.markAsSpam(Number(id), folder),
      "Failed to mark messages as spam",
      (n) => `Marked ${n} message${n === 1 ? "" : "s"} as spam`,
    );
  }

  function bulkMarkNotSpam() {
    return bulkAction(
      (id, folder) => api.markAsNotSpam(Number(id), folder),
      "Failed to mark messages as not spam",
      (n) => `Marked ${n} message${n === 1 ? "" : "s"} as not spam`,
    );
  }

  function bulkMoveTo(target: string) {
    return bulkAction(
      (id, folder) => api.moveMessage(Number(id), folder, target),
      "Failed to move messages",
      (n) => `Moved ${n} message${n === 1 ? "" : "s"}`,
    );
  }

  async function emptyCurrentFolder() {
    if (
      !window.confirm(
        `Permanently delete all messages in "${folderLabel}"? This can't be undone.`,
      )
    )
      return;
    setBulkBusy(true);
    try {
      await api.emptyFolder(activeFolder);
      setMessages([]);
      setSelectedIds(new Set());
      setSelectedId(null);
      setSelectedMessage(null);
      loadFolders();
      push(`${folderLabel} emptied`, "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to empty folder");
    } finally {
      setBulkBusy(false);
    }
  }

  async function refreshAll() {
    setRefreshing(true);
    try {
      await Promise.all([loadFolders(), loadMessages(activeFolder)]);
    } finally {
      setRefreshing(false);
    }
  }

  async function archiveMessage(id: string) {
    const message = messages.find((m) => m.id === id);
    const folder = message?.sourceFolder || activeFolder;
    try {
      await api.moveMessage(Number(id), folder, "Archive");
      clearSelectionAndRemove(id);
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to archive message");
    }
  }

  async function markSpam(id: string) {
    const message = messages.find((m) => m.id === id);
    const folder = message?.sourceFolder || activeFolder;
    try {
      await api.markAsSpam(Number(id), folder);
      clearSelectionAndRemove(id);
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to mark as spam");
    }
  }

  async function markNotSpam(id: string) {
    const message = messages.find((m) => m.id === id);
    const folder = message?.sourceFolder || activeFolder;
    try {
      await api.markAsNotSpam(Number(id), folder);
      clearSelectionAndRemove(id);
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to mark as not spam");
    }
  }

  // Attachments can be downloaded from any message inside an expanded
  // thread, not just the representative (latest) one shown in the list --
  // look inside its threadMessages too before falling back to activeFolder.
  function findAnyMessage(id: string): EmailMessage | undefined {
    if (selectedMessage?.id === id) return selectedMessage;
    return (
      selectedMessage?.threadMessages?.find((m) => m.id === id) ||
      messages.find((m) => m.id === id)
    );
  }

  async function downloadAttachment(
    messageId: string,
    index: number,
    filename: string,
  ) {
    const message = findAnyMessage(messageId);
    const folder = message?.sourceFolder || activeFolder;
    try {
      await api.downloadAttachment(Number(messageId), folder, index, filename);
    } catch (err) {
      push(
        err instanceof Error ? err.message : "Failed to download attachment",
      );
    }
  }

  async function moveTo(id: string, target: string) {
    const message = messages.find((m) => m.id === id);
    const folder = message?.sourceFolder || activeFolder;
    try {
      await api.moveMessage(Number(id), folder, target);
      clearSelectionAndRemove(id);
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to move message");
    }
  }

  async function removeMessage(id: string) {
    const message = messages.find((m) => m.id === id);
    const folder = message?.sourceFolder || activeFolder;
    try {
      await api.deleteMessage(Number(id), folder);
      clearSelectionAndRemove(id);
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to delete message");
    }
  }

  async function createFolder(name: string) {
    try {
      await api.createFolder(name);
      loadFolders();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to create folder");
    }
  }

  async function deleteFolder(path: string) {
    try {
      await api.deleteFolder(path);
      if (activeFolder === path) setActiveFolder("INBOX");
      loadFolders();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to delete folder");
    }
  }

  async function createAlias(alias: string) {
    await api.createAlias(alias);
    loadAliases();
  }

  async function deleteAlias(id: number) {
    try {
      await api.deleteAlias(id);
      loadAliases();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to delete alias");
    }
  }

  // A message may have arrived at an alias rather than the primary
  // address (e.g. sales@... forwarding into this mailbox) -- default the
  // reply's From to whichever of the user's own addresses it was actually
  // sent to, so the reply goes out under the identity the sender used,
  // not always the primary one. Falls back to the primary address.
  function pickReplyFrom(message: EmailMessage): string | undefined {
    const recipients = [...message.to, ...(message.cc || [])].map((a) =>
      a.toLowerCase(),
    );
    const aliasMatch = aliases.find((a) =>
      recipients.includes(a.source.toLowerCase()),
    );
    if (aliasMatch) return aliasMatch.source;
    return email ?? undefined;
  }

  function handleReply(
    message: EmailMessage,
    mode: "reply" | "replyAll" | "forward",
  ) {
    // Quoted content is kept separate from `body` (see ComposeDraft) so it
    // renders as its own read-only block instead of sharing the textarea
    // with what's actually being typed -- combined back into one string
    // at send time in handleSend.
    const isForward = mode === "forward";
    const quoteHeading = isForward
      ? `---------- Forwarded message ----------\nFrom: ${message.from.name} <${message.from.email}>\nDate: ${new Date(message.date).toLocaleString()}\nSubject: ${message.subject}\nTo: ${message.to.join(", ")}`
      : `On ${new Date(message.date).toLocaleString()}, ${message.from.name} wrote:`;
    const quoteBody = message.body
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    // In-Reply-To/References keep the reply threaded to this conversation
    // (both in this webmail's own Inbox+Sent merge and in any other mail
    // client that reads these headers) instead of starting a new one.
    setComposeDraft({
      to: isForward ? "" : message.from.email,
      cc: mode === "replyAll" && message.cc ? message.cc.join(", ") : undefined,
      from: pickReplyFrom(message),
      subject: isForward
        ? message.subject.startsWith("Fwd:")
          ? message.subject
          : `Fwd: ${message.subject}`
        : message.subject.startsWith("Re:")
          ? message.subject
          : `Re: ${message.subject}`,
      body: "",
      quoteHeading,
      quoteBody,
      inReplyTo: isForward ? undefined : message.messageId,
      references: isForward
        ? undefined
        : [...(message.references || []), message.messageId].filter(
            (id): id is string => Boolean(id),
          ),
    });
  }

  async function handleSend(draft: ComposeDraft) {
    try {
      await api.sendMail({
        to: draft.to,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: draft.subject,
        body: combinedBody(draft),
        from: draft.from,
        attachments: draft.attachments,
        inReplyTo: draft.inReplyTo,
        references: draft.references,
      });
      if (draft.draftUid != null && draft.draftFolder) {
        await api
          .discardDraft(draft.draftUid, draft.draftFolder)
          .catch(() => {});
      }
      setComposeDraft(null);
      push("Message sent", "success");
      loadFolders();
      // Refreshes whatever's currently open -- for the Inbox this re-merges
      // threads so a reply just sent shows up in its conversation right away.
      loadMessages(activeFolder);
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to send message");
    }
  }

  function resetLocalSession() {
    setEmail(null);
    setRole("user");
    setFolders([]);
    setMessages([]);
    setSelectedId(null);
    setSelectedMessage(null);
    setSelectedIds(new Set());
    setAliases([]);
    setActiveAlias(null);
  }

  async function handleLogout() {
    await api.logout();
    resetLocalSession();
  }

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = listWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function clamp(width: number) {
      return Math.min(LIST_WIDTH_MAX, Math.max(LIST_WIDTH_MIN, width));
    }
    function onMove(moveEvent: MouseEvent) {
      if (!resizingRef.current) return;
      setListWidthState(clamp(startWidth + (moveEvent.clientX - startX)));
    }
    function onUp(upEvent: MouseEvent) {
      resizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      persistListWidth(clamp(startWidth + (upEvent.clientX - startX)));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      <Sidebar
        folders={folders}
        activeFolder={activeFolder}
        onSelectFolder={(id) => {
          setActiveFolder(id);
          setSelectedId(null);
          setSelectedMessage(null);
          setSelectedIds(new Set());
          setFilter("all");
        }}
        onCompose={() => setComposeDraft({ to: "", subject: "", body: "" })}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCreateFolder={createFolder}
        onDeleteFolder={deleteFolder}
        onOpenAliases={() => setAliasesOpen(true)}
        usage={usage}
        aliases={aliases}
        activeAlias={activeAlias}
        onSelectAlias={(source) =>
          setActiveAlias((prev) => (prev === source ? null : source))
        }
        onRefresh={refreshAll}
        refreshing={refreshing || loading}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          query={query}
          onQueryChange={setQuery}
          theme={theme}
          onToggleTheme={() => {
            const next = theme === "dark" ? "light" : "dark";
            setTheme(next);
            document.documentElement.setAttribute("data-theme", next);
          }}
          onToggleSidebar={() => setSidebarOpen(true)}
          email={email}
          adminUrl={role !== "user" ? "/admin" : undefined}
          onLogout={handleLogout}
        />

        <div className="flex min-h-0 flex-1">
          <div
            className={`${selectedMessage ? "hidden md:flex" : "flex"} w-full md:w-auto`}
          >
            <MessageList
              messages={aliasFilteredMessages}
              selectedId={selectedId}
              onSelect={handleSelect}
              onToggleStar={toggleStar}
              folderLabel={loading ? `${folderLabel} · loading…` : folderLabel}
              filter={filter}
              onFilterChange={setFilter}
              width={listWidth}
              activeAliasFilter={activeAlias}
              onClearAliasFilter={() => setActiveAlias(null)}
              selectedIds={selectedIds}
              onToggleSelect={toggleMessageSelect}
              onToggleSelectAll={toggleSelectAll}
              onClearSelection={clearSelection}
              folders={folders}
              isSpamFolder={isSpamFolder}
              onBulkArchive={bulkArchive}
              onBulkDelete={bulkDelete}
              onBulkMarkSpam={bulkMarkSpam}
              onBulkMarkNotSpam={bulkMarkNotSpam}
              onBulkMoveTo={bulkMoveTo}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMoreMessages}
              onEmptyFolder={canEmptyActiveFolder ? emptyCurrentFolder : undefined}
              busy={bulkBusy}
            />
          </div>

          <div
            onMouseDown={handleResizeStart}
            className="hidden w-1 shrink-0 cursor-col-resize md:block"
            style={{ background: "var(--border)" }}
          />

          <div
            className={`${selectedMessage ? "flex" : "hidden md:flex"} min-w-0 flex-1`}
          >
            <ReadingPane
              message={selectedMessage}
              folders={folders}
              onToggleStar={toggleStar}
              onArchive={archiveMessage}
              onDelete={removeMessage}
              onMarkSpam={markSpam}
              onMarkNotSpam={markNotSpam}
              isSpamFolder={isSpamFolder}
              onMoveTo={moveTo}
              onDownloadAttachment={downloadAttachment}
              onReply={handleReply}
              onBack={() => {
                setSelectedId(null);
                setSelectedMessage(null);
              }}
            />
          </div>
        </div>
      </div>

      {composeDraft && (
        <ComposeModal
          initialDraft={composeDraft}
          onClose={() => setComposeDraft(null)}
          onSaveDraft={saveDraft}
          onSend={handleSend}
          onDeleteDraft={handleDeleteDraft}
          onValidationError={(message) => push(message, "error")}
          primaryEmail={email}
          aliases={aliases.map((a) => a.source)}
        />
      )}

      {aliasesOpen && (
        <AliasesModal
          aliases={aliases}
          onClose={() => setAliasesOpen(false)}
          onCreate={createAlias}
          onDelete={deleteAlias}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
