import { NextResponse } from "next/server";
import { ApiAuthError } from "./auth";

export function apiError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
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
    return apiError(
      500,
      err instanceof Error ? err.message : "Internal server error",
    );
  }
}
