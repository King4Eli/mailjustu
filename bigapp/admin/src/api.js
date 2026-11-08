// Proxied to the real backend server-side by bigapp/next.config.ts --
// always same-origin, never needs a per-deployment value.
const API_BASE = "/api";
const SESSION_KEY = "admin_session";

export function getStoredSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setStoredSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
}

class ApiError extends Error {}

function statusMessage(status) {
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "Not found.";
  if (status === 429) return "Too many requests. Please wait and try again.";
  if (status === 502 || status === 503 || status === 504)
    return "The server is unavailable right now. Please try again shortly.";
  if (status >= 500) return "Something went wrong on the server.";
  return `Request failed (${status})`;
}

async function rawFetch(path, options = {}) {
  const session = getStoredSession();
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      navigator.onLine === false
        ? "You're offline. Check your internet connection."
        : "Can't reach the server. Check your connection and try again.",
    );
  }
}

async function errorFromResponse(res) {
  const body = await res.json().catch(() => ({}));
  return new ApiError(
    (typeof body?.error === "string" && body.error) || statusMessage(res.status),
  );
}

async function apiFetch(path, options = {}) {
  const res = await rawFetch(path, options);
  if (res.status === 401) {
    clearStoredSession();
    throw new ApiError("Session expired, please sign in again");
  }
  if (!res.ok) throw await errorFromResponse(res);
  return res.json();
}

export async function login(email, password) {
  const res = await rawFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await errorFromResponse(res);
  const data = await res.json();
  if (data.role !== "super" && data.role !== "domain") {
    throw new ApiError("This account doesn't have admin access");
  }
  setStoredSession(data);
  return data;
}

export async function logout() {
  await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
  clearStoredSession();
}

export function getHealth() {
  return apiFetch("/admin/health");
}

export function getStats() {
  return apiFetch("/admin/stats");
}

export function getMailboxes() {
  return apiFetch("/admin/mailboxes");
}

export function createMailbox(email, password, isAdmin) {
  return apiFetch("/admin/mailboxes", {
    method: "POST",
    body: JSON.stringify({ email, password, isAdmin }),
  });
}

export function setMailboxAdmin(id, isAdmin) {
  return apiFetch(`/admin/mailboxes/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isAdmin }),
  });
}

export function resetMailboxPassword(id, password) {
  return apiFetch(`/admin/mailboxes/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
}

export function deleteMailbox(id) {
  return apiFetch(`/admin/mailboxes/${id}`, { method: "DELETE" });
}

export function getDomains() {
  return apiFetch("/admin/domains");
}

export function createDomain(
  name,
  maxMailboxes,
  maxAliasesPerMailbox,
  quotaMb,
) {
  return apiFetch("/admin/domains", {
    method: "POST",
    body: JSON.stringify({
      name,
      maxMailboxes: maxMailboxes || null,
      maxAliasesPerMailbox: maxAliasesPerMailbox || null,
      quotaMb: quotaMb || null,
    }),
  });
}

export function updateDomainLimits(
  id,
  maxMailboxes,
  maxAliasesPerMailbox,
  quotaMb,
) {
  return apiFetch(`/admin/domains/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      maxMailboxes: maxMailboxes || null,
      maxAliasesPerMailbox: maxAliasesPerMailbox || null,
      quotaMb: quotaMb || null,
    }),
  });
}

export function deleteDomain(id) {
  return apiFetch(`/admin/domains/${id}`, { method: "DELETE" });
}
