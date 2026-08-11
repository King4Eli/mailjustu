// Proxied to the real backend server-side by bigapp/next.config.ts --
// always same-origin, never needs a per-deployment value.
const API_BASE = "/api";

const TOKEN_KEY = "webui_token";
const EMAIL_KEY = "webui_email";
const ROLE_KEY = "webui_role";

export interface Session {
  token: string;
  email: string;
  role: "super" | "domain" | "user";
}

export function getStoredSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const email = localStorage.getItem(EMAIL_KEY);
  const role = (localStorage.getItem(ROLE_KEY) as Session["role"]) || "user";
  return token && email ? { token, email, role } : null;
}

function setSession(token: string, email: string, role: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EMAIL_KEY, email);
  localStorage.setItem(ROLE_KEY, role);
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(ROLE_KEY);
}

class ApiError extends Error {}

// App.tsx registers a listener on mount that resets its React state back to
// "logged out" -- fired synchronously as soon as any request comes back 401,
// so the UI drops straight to the Login screen instead of leaving the app
// rendered (and every subsequent request toasting its own "session expired"
// error) with a stale, no-longer-valid session.
let sessionExpiredHandler: (() => void) | null = null;

export function onSessionExpired(handler: () => void) {
  sessionExpiredHandler = handler;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const session = getStoredSession();
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(options.body && !isFormData
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    clearSession();
    sessionExpiredHandler?.();
    throw new ApiError("Session expired, please sign in again");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function login(email: string, password: string) {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setSession(data.token, data.email, data.role);
  return data as {
    token: string;
    email: string;
    role: Session["role"];
    domain: string;
  };
}

export async function logout() {
  await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
  clearSession();
}

export interface ApiFolder {
  path: string;
  name: string;
  specialUse: string | null;
  unseen: number;
  messages: number;
}

export function getUsage(): Promise<{
  usedBytes: number | null;
  quotaMb: number | null;
}> {
  return apiFetch("/mail/usage");
}

export function getFolders(): Promise<{ folders: ApiFolder[] }> {
  return apiFetch("/mail/folders");
}

export function createFolder(name: string) {
  return apiFetch("/mail/folders", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function deleteFolder(path: string) {
  return apiFetch("/mail/folders", {
    method: "DELETE",
    body: JSON.stringify({ path }),
  });
}

export interface ApiMessage {
  uid: number;
  subject: string;
  from: { name: string; email: string };
  to: string[];
  cc?: string[];
  date: string;
  read: boolean;
  starred: boolean;
  preview?: string;
  body?: string;
  html?: string;
  attachments?: { index: number; name: string; size: string }[];
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  threadId?: string;
}

export function getMessages(
  folder: string,
  before?: number | null,
): Promise<{
  folder: string;
  messages: ApiMessage[];
  nextBefore: number | null;
}> {
  const beforeParam = before != null ? `&before=${before}` : "";
  return apiFetch(
    `/mail/messages?folder=${encodeURIComponent(folder)}${beforeParam}`,
  );
}

// Real IMAP SEARCH (subject/from/body) across the whole folder, not just
// whatever page is already loaded client-side. No pagination cursor --
// capped server-side at SEARCH_RESULT_LIMIT.
export function searchMessages(
  folder: string,
  q: string,
): Promise<{ folder: string; messages: ApiMessage[] }> {
  return apiFetch(
    `/mail/messages?folder=${encodeURIComponent(folder)}&q=${encodeURIComponent(q)}`,
  );
}

export function emptyFolder(folder: string) {
  return apiFetch(`/mail/messages?folder=${encodeURIComponent(folder)}`, {
    method: "DELETE",
  });
}

export function getMessage(
  uid: number,
  folder: string,
): Promise<{ message: ApiMessage }> {
  return apiFetch(`/mail/messages/${uid}?folder=${encodeURIComponent(folder)}`);
}

export function setFlag(
  uid: number,
  folder: string,
  flag: "starred" | "read",
  value: boolean,
) {
  return apiFetch(
    `/mail/messages/${uid}?folder=${encodeURIComponent(folder)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ flag, value }),
    },
  );
}

export function moveMessage(uid: number, folder: string, to: string) {
  return apiFetch(
    `/mail/messages/${uid}/move?folder=${encodeURIComponent(folder)}`,
    {
      method: "POST",
      body: JSON.stringify({ to }),
    },
  );
}

export function markAsSpam(uid: number, folder: string) {
  return moveMessage(uid, folder, "Junk");
}

export function markAsNotSpam(uid: number, folder: string) {
  return moveMessage(uid, folder, "Inbox");
}

// Hides a message from its folder until wakeAt, then it reappears on its
// own -- no move involved, see app/api/mail/messages/[uid]/snooze/route.ts.
export function snoozeMessage(uid: number, folder: string, wakeAt: Date) {
  return apiFetch(
    `/mail/messages/${uid}/snooze?folder=${encodeURIComponent(folder)}`,
    { method: "POST", body: JSON.stringify({ wakeAt: wakeAt.toISOString() }) },
  );
}

export function unsnoozeMessage(uid: number, folder: string) {
  return apiFetch(
    `/mail/messages/${uid}/snooze?folder=${encodeURIComponent(folder)}`,
    { method: "DELETE" },
  );
}

export function getSnoozedMessages(): Promise<{
  messages: (ApiMessage & { sourceFolder: string; wakeAt: string })[];
}> {
  return apiFetch("/mail/snoozed");
}

export async function downloadAttachment(
  uid: number,
  folder: string,
  index: number,
  filename: string,
) {
  const session = getStoredSession();
  const res = await fetch(
    `${API_BASE}/mail/messages/${uid}/attachments/${index}?folder=${encodeURIComponent(folder)}`,
    { headers: session ? { Authorization: `Bearer ${session.token}` } : {} },
  );
  if (!res.ok)
    throw new ApiError(`Failed to download attachment (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function fetchAttachmentAsFile(
  uid: number,
  folder: string,
  index: number,
  filename: string,
): Promise<File> {
  const session = getStoredSession();
  const res = await fetch(
    `${API_BASE}/mail/messages/${uid}/attachments/${index}?folder=${encodeURIComponent(folder)}`,
    { headers: session ? { Authorization: `Bearer ${session.token}` } : {} },
  );
  if (!res.ok) throw new ApiError(`Failed to load attachment (${res.status})`);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}

export function deleteMessage(uid: number, folder: string) {
  return apiFetch(
    `/mail/messages/${uid}?folder=${encodeURIComponent(folder)}`,
    { method: "DELETE" },
  );
}

export interface SendMailOpts {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  html?: string;
  from?: string;
  attachments?: File[];
  inReplyTo?: string;
  references?: string[];
}

function buildMailForm(opts: SendMailOpts): FormData {
  const form = new FormData();
  form.set("to", opts.to);
  if (opts.cc) form.set("cc", opts.cc);
  if (opts.bcc) form.set("bcc", opts.bcc);
  form.set("subject", opts.subject);
  form.set("body", opts.body);
  if (opts.html) form.set("html", opts.html);
  if (opts.from) form.set("from", opts.from);
  if (opts.inReplyTo) form.set("inReplyTo", opts.inReplyTo);
  if (opts.references && opts.references.length > 0)
    form.set("references", opts.references.join(" "));
  for (const file of opts.attachments || []) form.append("attachments", file);
  return form;
}

export function sendMail(opts: SendMailOpts) {
  return apiFetch("/mail/send", { method: "POST", body: buildMailForm(opts) });
}

// Queues instead of sending immediately -- compose's "Undo send" (a short
// sendAt delay) and "Send later" (a user-picked one) are both this same
// call, they just differ in what they pass for sendAt. See
// app/api/mail/scheduled-sends/route.ts.
export function scheduleSend(
  opts: SendMailOpts,
  sendAt: Date,
): Promise<{ ok: boolean; id: number; sendAt: string }> {
  const form = buildMailForm(opts);
  form.set("sendAt", sendAt.toISOString());
  return apiFetch("/mail/scheduled-sends", { method: "POST", body: form });
}

export function cancelScheduledSend(id: number) {
  return apiFetch(`/mail/scheduled-sends/${id}`, { method: "DELETE" });
}

export interface ScheduledSendSummary {
  id: number;
  to_addresses: string;
  subject: string;
  send_at: string;
}

export function listScheduledSends(): Promise<{
  scheduled: ScheduledSendSummary[];
}> {
  return apiFetch("/mail/scheduled-sends");
}

export function saveDraft(opts: {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  from?: string;
  draftUid?: number;
  draftFolder?: string;
  attachments?: File[];
}): Promise<{ ok: boolean; uid: number; folder: string }> {
  const form = new FormData();
  if (opts.to) form.set("to", opts.to);
  if (opts.cc) form.set("cc", opts.cc);
  if (opts.bcc) form.set("bcc", opts.bcc);
  form.set("subject", opts.subject || "");
  form.set("body", opts.body || "");
  if (opts.from) form.set("from", opts.from);
  if (opts.draftUid != null) form.set("draftUid", String(opts.draftUid));
  if (opts.draftFolder) form.set("draftFolder", opts.draftFolder);
  for (const file of opts.attachments || []) form.append("attachments", file);
  return apiFetch("/mail/drafts", { method: "POST", body: form });
}

export function discardDraft(uid: number, folder: string) {
  return apiFetch(`/mail/drafts/${uid}?folder=${encodeURIComponent(folder)}`, {
    method: "DELETE",
  });
}

export interface ApiAlias {
  id: number;
  source: string;
}

export function getAliases(): Promise<{ aliases: ApiAlias[] }> {
  return apiFetch("/mail/aliases");
}

export function createAlias(alias: string) {
  return apiFetch("/mail/aliases", {
    method: "POST",
    body: JSON.stringify({ alias }),
  });
}

export function deleteAlias(id: number) {
  return apiFetch(`/mail/aliases/${id}`, { method: "DELETE" });
}

export interface MailFilter {
  id: number;
  name: string;
  field: "from" | "to" | "subject";
  match_type: "contains" | "equals" | "domain";
  value: string;
  action: "move" | "delete" | "mark_read" | "star" | "allow";
  action_folder: string | null;
  position: number;
  enabled: boolean;
}

export interface MailFilterInput {
  name: string;
  field: MailFilter["field"];
  matchType: MailFilter["match_type"];
  value: string;
  action: MailFilter["action"];
  actionFolder?: string;
  enabled?: boolean;
}

// Real server-side filters, installed as a Sieve script over ManageSieve
// (see lib/api/sieve.ts) -- these run at Dovecot delivery time, not just
// while this app is open.
export function getFilters(): Promise<{ filters: MailFilter[] }> {
  return apiFetch("/mail/filters");
}

export function createFilter(
  input: MailFilterInput,
): Promise<{ ok: boolean; id: number }> {
  return apiFetch("/mail/filters", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateFilter(id: number, input: Partial<MailFilterInput>) {
  return apiFetch(`/mail/filters/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteFilter(id: number) {
  return apiFetch(`/mail/filters/${id}`, { method: "DELETE" });
}
