import https from "node:https";

// Queries Dovecot's doveadm HTTP API (see ./.env/dovecot.env's
// DOVEADM_PASSWORD, consumed by the dovecot_config volume's
// `DOVEADM_PASSWORD = %{env:DOVEADM_PASSWORD | default}`) for a mailbox's
// real on-disk usage, summed across all its IMAP folders. Returns null
// (rather than throwing) on any failure so a Dovecot hiccup just hides the
// usage column instead of breaking the mailboxes list.
export function getMailboxUsageBytes(email: string): Promise<number | null> {
  const host = process.env.DOVEADM_HOST;
  const port = Number(process.env.DOVEADM_PORT) || 8080;
  const password = process.env.DOVEADM_PASSWORD;
  if (!host || !password) return Promise.resolve(null);

  const body = JSON.stringify([
    [
      "mailboxStatus",
      { user: email, field: "vsize", mailboxMask: "*" },
      "usage",
    ],
  ]);
  const auth = Buffer.from(`doveadm:${password}`).toString("base64");

  return new Promise((resolve) => {
    const req = https.request(
      {
        host,
        port,
        path: "/doveadm/v1",
        method: "POST",
        rejectUnauthorized: false,
        headers: {
          // Dovecot's HTTP server rejects Host headers containing
          // underscores (our service name is mail_justu_dovecot) as an
          // "invalid host identifier" -- override with an RFC-valid value;
          // it doesn't affect which host we actually connect to.
          Host: "dovecot",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Basic ${auth}`,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const [[, result]] = JSON.parse(data);
            if (!Array.isArray(result)) return resolve(null);
            resolve(
              result.reduce(
                (sum: number, row: { vsize?: number }) =>
                  sum + (Number(row.vsize) || 0),
                0,
              ),
            );
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.write(body);
    req.end();
  });
}
