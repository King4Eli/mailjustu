import crypto from "node:crypto";

export interface Session {
  email: string;
  password: string;
  role: "super" | "domain" | "user";
  domain: string;
  expires: number;
}

export interface AdminScope {
  role: "domain" | "super";
  domain: string | null;
}

// Safe as a plain Map -- single long-running Node process, no clustering.
const sessions = new Map<string, Session>();
const SESSION_TTL_MS =
  (Number(process.env.SESSION_TTL_MINUTES) || 120) * 60 * 1000;

export function isSuperAdminEmail(email: string): boolean {
  const list = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

// role: 'super' (sees everything) | 'domain' (scoped) | 'user' (webmail only).
export function createSession(
  email: string,
  password: string,
  role: Session["role"],
  domain: string,
): string {
  const token = crypto.randomUUID();
  sessions.set(token, {
    email,
    password,
    role,
    domain,
    expires: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function destroySession(token: string) {
  sessions.delete(token);
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" ? token : null;
}

function getSession(req: Request): Session | null {
  const token = bearerToken(req);
  const session = token ? sessions.get(token) : undefined;
  if (!session || session.expires < Date.now()) {
    if (token && session) sessions.delete(token);
    return null;
  }
  session.expires = Date.now() + SESSION_TTL_MS;
  return session;
}

export class ApiAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function requireSession(req: Request): Session {
  const session = getSession(req);
  if (!session) throw new ApiAuthError(401, "Not authenticated");
  return session;
}

// Domain admins and super admins. adminScope.domain is null for a super
// admin (no restriction); otherwise the one domain this caller may touch.
export function requireDomainAdmin(req: Request): {
  session: Session;
  adminScope: AdminScope;
} {
  const session = getSession(req);
  if (!session || (session.role !== "domain" && session.role !== "super")) {
    throw new ApiAuthError(401, "Not authorized");
  }
  return {
    session,
    adminScope: {
      role: session.role,
      domain: session.role === "super" ? null : session.domain,
    },
  };
}

// Super admins only -- Services/health/stats, domain creation/deletion.
export function requireSuperAdmin(req: Request): Session {
  const session = getSession(req);
  if (!session || session.role !== "super")
    throw new ApiAuthError(401, "Not authorized");
  return session;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expires < now) sessions.delete(token);
  }
}, 60_000).unref();
