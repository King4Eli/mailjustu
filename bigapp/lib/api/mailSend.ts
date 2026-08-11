import crypto from "node:crypto";
import nodemailer from "nodemailer";

// Shared by the immediate send route and the scheduled-send poller.
// Relays through Postfix's trusted mynetworks, no password needed.
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

  // Compile once so the same MIME source is both sent and saved to Sent.
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
