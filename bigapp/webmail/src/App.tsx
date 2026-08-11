import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { MessageList } from "./components/MessageList";
import { ReadingPane } from "./components/ReadingPane";
import { ComposeModal, type ComposeDraft } from "./components/ComposeModal";
import { AliasesModal } from "./components/AliasesModal";
import { SignatureModal } from "./components/SignatureModal";
import { FiltersModal } from "./components/FiltersModal";
import { BlockListModal } from "./components/BlockListModal";
import { Login } from "./components/Login";
import { useToasts, ToastStack } from "./components/Toast";
import * as api from "./api";
import type { ApiFolder, ApiMessage, ApiAlias, MailFilter } from "./api";
import type { EmailMessage, FolderInfo, MessageFilter } from "./types";
import {
  getListWidth,
  setListWidth as persistListWidth,
  LIST_WIDTH_MIN,
  LIST_WIDTH_MAX,
  getSignature,
  setSignature as persistSignature,
} from "./settings";
import { buildInboxThreads } from "./utils";
import {
  updateFaviconBadge,
  requestNotificationPermission,
  notifyNewMail,
} from "./notifications";

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
function mergeById(
  prev: EmailMessage[],
  fresh: EmailMessage[],
): EmailMessage[] {
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// HTML counterpart to combinedBody -- the compose editor already produces
// real HTML for whatever the user typed (see ComposeModal's contentEditable
// body), so this just needs to fold the plain-text quoted block in as a
// <blockquote>. Returns undefined for a plain, unformatted, non-reply
// message so a trivial send doesn't grow a redundant HTML alternative part.
function combinedHtml(draft: ComposeDraft): string | undefined {
  const hasRichContent = Boolean(draft.html?.trim());
  if (!hasRichContent && !draft.quoteBody) return undefined;
  const bodyHtml = hasRichContent
    ? draft.html
    : `<div>${escapeHtml(draft.body).replace(/\n/g, "<br>")}</div>`;
  const quoteHtml = draft.quoteBody
    ? `<blockquote style="border-left:2px solid #ccc;margin:1em 0 0;padding-left:1em;color:#666;">${
        draft.quoteHeading ? `<p>${escapeHtml(draft.quoteHeading)}</p>` : ""
      }<div>${escapeHtml(draft.quoteBody).replace(/\n/g, "<br>")}</div></blockquote>`
    : "";
  return `${bodyHtml}${quoteHtml}`;
}

// Appended to a fresh draft's body (new compose or reply/forward, not a
// reopened saved draft) if the user has one configured -- see
// SignatureModal / settings.ts.
function withSignature(body: string): string {
  const sig = getSignature();
  if (!sig) return body;
  return body ? `${body}\n\n${sig}` : sig;
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
  // True while `messages` holds server-side search results rather than the
  // active folder's normal contents -- disables pagination/auto-refresh
  // (see loadMoreMessages/silentRefresh) so they don't clobber a search.
  const [searching, setSearching] = useState(false);
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
  const [filters, setFilters] = useState<MailFilter[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [blockListOpen, setBlockListOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [activeAlias, setActiveAlias] = useState<string | null>(null);
  // Accumulates (email -> display name) across every folder/message this
  // session has loaded, for compose's To/Cc autocomplete -- not a real
  // address book, just "people you've already exchanged mail with lately".
  // A ref (not state) since it's read fresh at render time and mutating it
  // shouldn't itself trigger a re-render.
  const contactsRef = useRef<Map<string, string>>(new Map());
  const [usage, setUsage] = useState<{
    usedBytes: number | null;
    quotaMb: number | null;
  } | null>(null);
  const [listWidth, setListWidthState] = useState(() => getListWidth());
  const resizingRef = useRef(false);
  // null until the first folders load -- distinguishes "haven't checked
  // yet" from "checked and it's zero" so the notification effect below
  // doesn't fire for a mailbox's entire pre-existing unread backlog on
  // first load, only for genuine increases after that.
  const prevInboxUnseenRef = useRef<number | null>(null);
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
      const snoozed: FolderInfo = {
        id: "SNOOZED",
        name: "Snoozed",
        icon: "snoozed",
        unseen: 0,
        messages: 0,
      };
      const withPseudoFolders =
        inboxIndex >= 0
          ? [
              ...mapped.slice(0, inboxIndex + 1),
              starred,
              snoozed,
              ...mapped.slice(inboxIndex + 1),
            ]
          : [starred, snoozed, ...mapped];
      setFolders(withPseudoFolders);
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

  async function loadFilters() {
    try {
      const { filters: apiFilters } = await api.getFilters();
      setFilters(apiFilters);
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to load filters");
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
        const realFolders = folders.filter(
          (f) => f.id !== "STARRED" && f.id !== "SNOOZED",
        );
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
      } else if (folderId === "SNOOZED") {
        // Server-aggregated (see api.getSnoozedMessages/app/api/mail/snoozed)
        // -- unlike STARRED this can't be built from each folder's already-
        // fetched first page, since a snoozed message is deliberately
        // excluded from its folder's normal listing while asleep.
        paginationRef.current = { mode: "none" };
        const { messages: apiMessages } = await api.getSnoozedMessages();
        // Already sorted soonest-to-wake-first by the server -- keep that
        // order rather than the usual newest-first, since "when does this
        // come back" is the relevant ordering here.
        setMessages(apiMessages.map((m) => toEmailMessage(m, m.sourceFolder)));
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
    if (!email || folders.length === 0 || loading || loadingMore || searching)
      return;
    if (activeFolder === "STARRED" || activeFolder === "SNOOZED") return;
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
      loadFilters();
      api
        .getUsage()
        .then(setUsage)
        .catch(() => {});
      requestNotificationPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  // Favicon unread badge + desktop notification, driven by the Inbox's
  // unseen count (refreshed by every loadFolders() call, including the
  // auto-refresh poller) rather than by diffing message lists -- see
  // notifications.ts for why that's simpler and folder-independent.
  useEffect(() => {
    const inboxUnseen = folders.find((f) => f.icon === "\\Inbox")?.unseen ?? 0;
    updateFaviconBadge(inboxUnseen);
    if (
      prevInboxUnseenRef.current != null &&
      inboxUnseen > prevInboxUnseenRef.current
    ) {
      notifyNewMail(inboxUnseen - prevInboxUnseenRef.current);
    }
    prevInboxUnseenRef.current = inboxUnseen;
  }, [folders]);

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
    if (email && folders.length > 0 && !query.trim())
      loadMessages(activeFolder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, activeFolder, folders.length]);

  // Folds this batch of messages' senders/recipients into the running
  // contacts list (see contactsRef above) -- fires on every folder
  // load/search/refresh, so it only ever grows across the session.
  useEffect(() => {
    for (const m of messages) {
      if (m.from?.email) {
        const key = m.from.email.toLowerCase();
        if (!contactsRef.current.has(key))
          contactsRef.current.set(key, m.from.name || m.from.email);
      }
      for (const addr of [...m.to, ...(m.cc || [])]) {
        const key = addr.toLowerCase();
        if (!contactsRef.current.has(key)) contactsRef.current.set(key, addr);
      }
    }
  }, [messages]);

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

  // Debounced server-side search (real IMAP SEARCH over the whole folder,
  // not just whatever's already loaded -- see api.searchMessages). Clearing
  // the box drops back to the normal paginated folder view.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      if (searching) {
        setSearching(false);
        if (email && folders.length > 0) loadMessages(activeFolder);
      }
      return;
    }
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const { messages: apiMessages } = await api.searchMessages(
          activeFolder,
          trimmed,
        );
        setMessages(
          apiMessages
            .map((m) => toEmailMessage(m))
            .sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
            ),
        );
        setSearching(true);
        setHasMore(false);
        paginationRef.current = { mode: "none" };
      } catch (err) {
        push(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeFolder]);

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

  // While searching, `messages` already holds the server's search results
  // (see the debounced search effect above) -- no further client-side
  // text filtering needed on top of it.
  const folderMessages = messages.filter((m) => {
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
  const isSnoozedFolder = activeFolder === "SNOOZED";

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

  async function snoozeMessage(id: string, wakeAt: Date) {
    const message = messages.find((m) => m.id === id);
    const folder = message?.sourceFolder || activeFolder;
    try {
      await api.snoozeMessage(Number(id), folder, wakeAt);
      clearSelectionAndRemove(id);
      push(`Snoozed until ${wakeAt.toLocaleString()}`, "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to snooze message");
    }
  }

  async function unsnoozeMessage(id: string) {
    const message = messages.find((m) => m.id === id);
    const folder = message?.sourceFolder || activeFolder;
    try {
      await api.unsnoozeMessage(Number(id), folder);
      clearSelectionAndRemove(id);
      push("Un-snoozed", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to un-snooze message");
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

  async function createFilter(input: api.MailFilterInput) {
    await api.createFilter(input);
    loadFilters();
  }

  async function toggleFilter(id: number, enabled: boolean) {
    try {
      await api.updateFilter(id, { enabled });
      loadFilters();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to update filter");
    }
  }

  async function deleteFilterRule(id: number) {
    try {
      await api.deleteFilter(id);
      loadFilters();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to delete filter");
    }
  }

  // One-click "Block sender" -- installs a real server-side block rule
  // (future mail from this exact address is discarded at delivery, see
  // lib/api/sieve.ts) and also gets the already-arrived message out of
  // the inbox, matching how Gmail/Outlook's "Block sender" behaves.
  // Shared by the three quick-action toolbar buttons below (Block sender,
  // Block domain, Allow sender) -- installs one "from" rule and shows an
  // Undo toast that removes it again by id. `andTrash` additionally moves
  // the currently-open message to Trash, which only makes sense for block
  // actions (Gmail/Outlook-style "block sender" also clears the one
  // that's already in front of you); allow doesn't touch it.
  async function quickSenderFilter(opts: {
    value: string;
    matchType: "equals" | "domain";
    action: "delete" | "allow";
    label: string;
    andTrash?: string;
  }) {
    try {
      const { id } = await api.createFilter({
        name: `${opts.action === "delete" ? "Blocked" : "Allowed"}${opts.matchType === "domain" ? " domain" : ""}: ${opts.value}`,
        field: "from",
        matchType: opts.matchType,
        value: opts.value,
        action: opts.action,
      });
      loadFilters();
      if (opts.andTrash) await removeMessage(opts.andTrash);
      push(opts.label, "success", {
        actionLabel: "Undo",
        onAction: () => {
          api.deleteFilter(id).then(
            () => {
              loadFilters();
              push("Removed", "success");
            },
            () => push("Failed to undo", "error"),
          );
        },
      });
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to update filters");
    }
  }

  function blockSender(message: EmailMessage) {
    const senderEmail = message.from.email;
    if (!senderEmail) return;
    quickSenderFilter({
      value: senderEmail,
      matchType: "equals",
      action: "delete",
      label: `Blocked ${senderEmail}`,
      andTrash: message.id,
    });
  }

  function blockDomain(message: EmailMessage) {
    const domain = message.from.email.split("@")[1];
    if (!domain) return;
    quickSenderFilter({
      value: domain,
      matchType: "domain",
      action: "delete",
      label: `Blocked everyone at ${domain}`,
      andTrash: message.id,
    });
  }

  function allowSender(message: EmailMessage) {
    const senderEmail = message.from.email;
    if (!senderEmail) return;
    quickSenderFilter({
      value: senderEmail,
      matchType: "equals",
      action: "allow",
      label: `Allowed ${senderEmail}`,
    });
  }

  // Allow/Block lists modal -- same underlying mail_filters mechanism as
  // blockSender above and the general Filters modal, just pre-configured
  // for the common "exact sender address" case.
  async function addBlockedSender(
    value: string,
    matchType: "equals" | "domain" = "equals",
  ) {
    await api.createFilter({
      name: matchType === "domain" ? `Blocked domain: ${value}` : `Blocked: ${value}`,
      field: "from",
      matchType,
      value,
      action: "delete",
    });
    loadFilters();
  }

  async function addAllowedSender(
    value: string,
    matchType: "equals" | "domain" = "equals",
  ) {
    await api.createFilter({
      name: matchType === "domain" ? `Allowed domain: ${value}` : `Allowed: ${value}`,
      field: "from",
      matchType,
      value,
      action: "allow",
    });
    loadFilters();
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
      body: withSignature(""),
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

  // Undo Send is implemented as a very-short scheduled send (see
  // api.scheduleSend / app/api/mail/scheduled-sends) rather than a plain
  // client-side setTimeout, deliberately -- a pure client-side delay would
  // silently lose the message if the tab closes during the undo window.
  // Going through the same DB-backed queue "Send later" uses means the
  // undo window survives a closed tab exactly like any other scheduled
  // send; the tradeoff is up to one poll interval (see
  // SCHEDULED_SEND_POLL_SECONDS) of extra latency after the undo window.
  const UNDO_SEND_DELAY_SECONDS = 10;

  function draftToSendOpts(draft: ComposeDraft): api.SendMailOpts {
    return {
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      body: combinedBody(draft),
      html: combinedHtml(draft),
      from: draft.from,
      attachments: draft.attachments,
      inReplyTo: draft.inReplyTo,
      references: draft.references,
    };
  }

  async function discardIfEditingDraft(draft: ComposeDraft) {
    if (draft.draftUid != null && draft.draftFolder) {
      await api.discardDraft(draft.draftUid, draft.draftFolder).catch(() => {});
    }
  }

  async function handleSend(draft: ComposeDraft) {
    try {
      const sendAt = new Date(Date.now() + UNDO_SEND_DELAY_SECONDS * 1000);
      const { id } = await api.scheduleSend(draftToSendOpts(draft), sendAt);
      await discardIfEditingDraft(draft);
      setComposeDraft(null);
      push(`Sending in ${UNDO_SEND_DELAY_SECONDS}s…`, "success", {
        actionLabel: "Undo",
        durationMs: UNDO_SEND_DELAY_SECONDS * 1000 + 1000,
        onAction: () => {
          api.cancelScheduledSend(id).then(
            () => push("Send canceled", "success"),
            () => push("Too late to undo -- already sent", "error"),
          );
        },
      });
      // The actual send (and best-effort Sent-folder append) happens
      // server-side once send_at passes, not synchronously here -- refresh
      // afterwards so Sent/thread views pick it up.
      window.setTimeout(
        () => {
          loadFolders();
          loadMessages(activeFolder);
        },
        UNDO_SEND_DELAY_SECONDS * 1000 + 1500,
      );
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to send message");
    }
  }

  async function handleScheduleSend(draft: ComposeDraft, sendAt: Date) {
    try {
      await api.scheduleSend(draftToSendOpts(draft), sendAt);
      await discardIfEditingDraft(draft);
      setComposeDraft(null);
      push(`Scheduled to send ${sendAt.toLocaleString()}`, "success");
      loadFolders();
    } catch (err) {
      push(err instanceof Error ? err.message : "Failed to schedule message");
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
    setQuery("");
    setSearching(false);
    // Re-arm the "skip the first load's backlog" guard (see the effect
    // that calls notifyNewMail) so logging back in doesn't immediately
    // notify for whatever's already unread.
    prevInboxUnseenRef.current = null;
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
        onCompose={() =>
          setComposeDraft({ to: "", subject: "", body: withSignature("") })
        }
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCreateFolder={createFolder}
        onDeleteFolder={deleteFolder}
        onOpenAliases={() => setAliasesOpen(true)}
        onOpenFilters={() => setFiltersOpen(true)}
        onOpenBlockList={() => setBlockListOpen(true)}
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
              onEmptyFolder={
                canEmptyActiveFolder ? emptyCurrentFolder : undefined
              }
              busy={bulkBusy}
              folderId={activeFolder}
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
              onBlockSender={blockSender}
              onBlockDomain={blockDomain}
              onAllowSender={allowSender}
              isSpamFolder={isSpamFolder}
              onMoveTo={moveTo}
              onSnooze={snoozeMessage}
              isSnoozedFolder={isSnoozedFolder}
              onUnsnooze={unsnoozeMessage}
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
          onScheduleSend={handleScheduleSend}
          onDeleteDraft={handleDeleteDraft}
          onValidationError={(message) => push(message, "error")}
          onEditSignature={() => setSignatureOpen(true)}
          primaryEmail={email}
          aliases={aliases.map((a) => a.source)}
          contacts={Array.from(contactsRef.current, ([email, name]) => ({
            email,
            name,
          }))}
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

      {signatureOpen && (
        <SignatureModal
          initialSignature={getSignature()}
          onClose={() => setSignatureOpen(false)}
          onSave={persistSignature}
        />
      )}

      {filtersOpen && (
        <FiltersModal
          filters={filters}
          folders={folders}
          onClose={() => setFiltersOpen(false)}
          onCreate={createFilter}
          onToggle={toggleFilter}
          onDelete={deleteFilterRule}
        />
      )}

      {blockListOpen && (
        <BlockListModal
          filters={filters}
          onClose={() => setBlockListOpen(false)}
          onAddBlocked={addBlockedSender}
          onAddAllowed={addAllowedSender}
          onRemove={deleteFilterRule}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
