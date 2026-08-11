import https from "node:https";

// Mailbox's real on-disk usage via doveadm HTTP API. Null on any failure.
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
          Host: "dovecot", // real service name has underscores, Dovecot rejects that
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
