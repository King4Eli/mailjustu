// Two lightweight in-process pollers, started once from instrumentation.ts
// (Next.js's documented server-startup hook). Same "single long-running
// Node process" assumption as auth.ts's session pruning -- see the
// comment there.
import { pool } from "./db";
import { compileAndRelay } from "./mailSend";
import type { RowDataPacket } from "mysql2";

const SCHEDULED_SEND_POLL_MS =
  (Number(process.env.SCHEDULED_SEND_POLL_SECONDS) || 5) * 1000;
const SNOOZE_POLL_MS = (Number(process.env.SNOOZE_POLL_SECONDS) || 60) * 1000;

interface ScheduledSendRow extends RowDataPacket {
  id: number;
  from_address: string;
  to_addresses: string;
  cc_addresses: string | null;
  bcc_addresses: string | null;
  subject: string;
  body: string;
  html: string | null;
  in_reply_to: string | null;
  message_references: string | null;
}

interface ScheduledSendAttachmentRow extends RowDataPacket {
  filename: string;
  content_type: string;
  content: Buffer;
}

// Sends via the mynetworks-trusted Postfix relay (see mailSend.ts) -- no
// mailbox password needed, so this works even though whichever session
// created the row may be long gone by the time it fires. What it can't do
// without that session is append a Sent-folder copy; scheduled sends
// intentionally skip that rather than persist a password to cover it (see
// the comment on the scheduled_sends table in _docs/schema.sql).
async function processDueScheduledSends() {
  const [rows] = await pool.query<ScheduledSendRow[]>(
    `SELECT id, from_address, to_addresses, cc_addresses, bcc_addresses,
            subject, body, html, in_reply_to, message_references
     FROM scheduled_sends
     WHERE status = 'pending' AND send_at <= NOW()
     ORDER BY send_at
     LIMIT 20`,
  );
  for (const row of rows) {
    // Claim atomically under a WHERE status='pending' guard before doing
    // any I/O, so an overlapping tick (or a future multi-instance
    // deployment) can't double-send the same row.
    const [claimResult] = await pool.query(
      "UPDATE scheduled_sends SET status = 'sent', sent_at = NOW() WHERE id = ? AND status = 'pending'",
      [row.id],
    );
    if ((claimResult as { affectedRows: number }).affectedRows === 0) continue;

    try {
      const [attachmentRows] = await pool.query<ScheduledSendAttachmentRow[]>(
        "SELECT filename, content_type, content FROM scheduled_send_attachments WHERE scheduled_send_id = ?",
        [row.id],
      );
      await compileAndRelay({
        from: row.from_address,
        to: row.to_addresses,
        cc: row.cc_addresses || undefined,
        bcc: row.bcc_addresses || undefined,
        subject: row.subject,
        text: row.body,
        html: row.html || undefined,
        attachments: attachmentRows.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.content_type,
        })),
        inReplyTo: row.in_reply_to || undefined,
        references: row.message_references
          ? row.message_references.split(/\s+/).filter(Boolean)
          : undefined,
      });
      await pool.query(
        "DELETE FROM scheduled_send_attachments WHERE scheduled_send_id = ?",
        [row.id],
      );
    } catch (err) {
      await pool.query(
        "UPDATE scheduled_sends SET status = 'failed', error = ? WHERE id = ?",
        [err instanceof Error ? err.message : String(err), row.id],
      );
    }
  }
}

// Snooze itself needs no background action -- see the comment on the
// snoozed_messages table in _docs/schema.sql: a message "wakes up" simply
// by GET /api/mail/messages stopping to exclude it once wake_at passes,
// no IMAP move involved. This is just periodic housekeeping so the table
// doesn't grow forever with rows nothing will ever query again.
async function pruneWokenSnoozes() {
  await pool.query("DELETE FROM snoozed_messages WHERE wake_at <= NOW()");
}

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;
  setInterval(() => {
    processDueScheduledSends().catch((err) =>
      console.error("scheduled-send poll failed", err),
    );
  }, SCHEDULED_SEND_POLL_MS).unref();
  setInterval(() => {
    pruneWokenSnoozes().catch((err) =>
      console.error("snooze prune failed", err),
    );
  }, SNOOZE_POLL_MS).unref();
}
