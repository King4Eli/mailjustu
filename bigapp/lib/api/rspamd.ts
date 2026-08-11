// Rspamd's controller API. Optional overlay -- fails silently if unreachable.
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
    // best-effort
  }
}
