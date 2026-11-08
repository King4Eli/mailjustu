import { NextResponse } from "next/server";
import { ApiAuthError } from "./auth";

export function apiError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

// Low-level socket / driver errors (DB or IMAP/SMTP host down). Their raw
// messages ("connect ECONNREFUSED 172.18.0.4:993") mean nothing to users.
const UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  // imapflow's own timeout / connection codes
  "ETIMEOUT",
  "CONNECT_TIMEOUT",
  "GREETING_TIMEOUT",
  "UPGRADE_TIMEOUT",
  "NoConnection",
  "PROTOCOL_CONNECTION_LOST",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
  "ER_CON_COUNT_ERROR",
]);

export function isServiceUnavailableError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return !!code && UNAVAILABLE_CODES.has(code);
}

// Mirrors the original Express app's per-route `catch (err) { res.status(...).json({ error: err.message }) }`
// pattern, plus its top-level `app.use((err, req, res, next) => ...)` catch-all.
export async function withApiErrors(
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiAuthError) return apiError(err.status, err.message);
    console.error(err);
    if (isServiceUnavailableError(err)) {
      return apiError(
        503,
        "A backend service is temporarily unavailable. Please try again shortly.",
      );
    }
    return apiError(
      500,
      err instanceof Error ? err.message : "Internal server error",
    );
  }
}
