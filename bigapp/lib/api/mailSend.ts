import crypto from "node:crypto";
import nodemailer from "nodemailer";

// Shared by the immediate POST /api/mail/send route and the scheduled-send
// poller (lib/api/scheduler.ts) -- compiles a message to raw MIME once and
// relays it through Postfix, trusted via mynetworks (see
// docker-compose's MYNETWORKS / postfix.env), no SASL/mailbox password
// needed either way. The two callers differ only in what they do
// afterwards: the immediate route also does a live IMAP Sent-folder
// append; the poller can't (no session), so it skips that -- see the
// comment on the scheduled_sends table in _docs/schema.sql.
export interface OutgoingMail {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
  inReplyTo?: string;
  references?: string[];
}

export async function compileAndRelay(
  mail: OutgoingMail,
): Promise<{ raw: Buffer; messageId: string }> {
  const mailOptions = {
    from: mail.from,
    to: mail.to,
    cc: mail.cc || undefined,
    bcc: mail.bcc || undefined,
    subject: mail.subject || "(no subject)",
    text: mail.text || "",
    html: mail.html || undefined,
    attachments: (mail.attachments || []).map((f) => ({
      filename: f.filename,
      content: f.content,
      contentType: f.contentType,
    })),
    messageId: `<${crypto.randomUUID()}@${mail.from.split("@")[1]}>`,
    inReplyTo: mail.inReplyTo,
    references:
      mail.references && mail.references.length > 0
        ? mail.references
        : undefined,
  };

  // Compile once (no network I/O) so the exact same MIME source --
  // attachments included -- both goes out over SMTP and (for the
  // immediate-send path) gets saved to Sent, instead of building the
  // message twice.
  const compiler = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
  });
  const { message: raw, messageId } = (await compiler.sendMail(
    mailOptions,
  )) as { message: Buffer; messageId: string };

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "mail_justu_postfix",
    port: Number(process.env.SMTP_PORT) || 25,
    secure: false,
    tls: { rejectUnauthorized: false },
  });
  const envelopeTo = [mail.to, mail.cc, mail.bcc]
    .filter(Boolean)
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await transport.sendMail({
    envelope: { from: mail.from, to: envelopeTo },
    raw,
  });

  return { raw, messageId };
}
