// Rspamd's controller HTTP API -- same host/port/password already used by
// app/api/admin/stats & health (see there for the request shape). Rspamd
// is an optional overlay (docker-compose.rspamd.yml); every call here
// fails silently so a mark-as-spam/not-spam click still succeeds (the
// IMAP move is what actually matters to the user) even when the overlay
// isn't running or the controller is briefly unreachable.
export async function learnMessage(
  raw: Buffer,
  isSpam: boolean,
): Promise<void> {
  const host = process.env.RSPAMD_HOST;
  const port = process.env.RSPAMD_PORT;
  if (!host || !port) return;
  try {
    await fetch(`http://${host}:${port}/${isSpam ? "learnspam" : "learnham"}`, {
      method: "POST",
      headers: {
        Password: process.env.RSPAMD_CONTROLLER_PASSWORD || "",
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(raw),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Best-effort training signal, not a user-facing operation -- see
    // comment above.
  }
}
