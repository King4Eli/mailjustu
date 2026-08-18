import { NextRequest } from "next/server";
import { requireSession } from "@/lib/api/auth";
import { pool } from "@/lib/api/db";
import { apiError, withApiErrors } from "@/lib/api/handler";
import {
  AttachmentLimitError,
  parseFormAttachments,
} from "@/lib/api/attachments";
import type { RowDataPacket } from "mysql2";

// This mailbox's still-pending scheduled/undo-window sends.
export async function GET(req: NextRequest) {
  return withApiErrors(async () => {
    const { email } = requireSession(req);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, to_addresses, subject, send_at
       FROM scheduled_sends
       WHERE mailbox_email = ? AND status = 'pending'
       ORDER BY send_at`,
      [email],
    );
    return Response.json({ scheduled: rows });
  });
}

// Same shape as POST /api/mail/send, plus sendAt -- queues instead of sending.
export async function POST(req: NextRequest) {
  return withApiErrors(async () => {
    const { email } = requireSession(req);
    const form = await req.formData();
    const to = form.get("to") as string | null;
    const cc = form.get("cc") as string | null;
    const bcc = form.get("bcc") as string | null;
    const subject = form.get("subject") as string | null;
    const body = form.get("body") as string | null;
    const html = form.get("html") as string | null;
    const from = form.get("from") as string | null;
    const inReplyTo = (form.get("inReplyTo") as string | null) || null;
    const referencesRaw = (form.get("references") as string | null) || "";
    const sendAtRaw = form.get("sendAt") as string | null;
    const delaySecondsRaw = form.get("delaySeconds") as string | null;
    if (!to) return apiError(400, "to is required");

    // Undo Send: a relative delay, so send_at is computed from the
    // server's own clock instead of trusting the client's -- a client with
    // a skewed clock would otherwise silently queue the send far off from
    // the real "N seconds from now" the user was told.
    let sendAt: Date;
    if (delaySecondsRaw != null) {
      const delaySeconds = Number(delaySecondsRaw);
      if (
        !Number.isFinite(delaySeconds) ||
        delaySeconds < 0 ||
        delaySeconds > 300
      )
        return apiError(400, "delaySeconds is invalid");
      sendAt = new Date(Date.now() + delaySeconds * 1000);
    } else {
      if (!sendAtRaw) return apiError(400, "sendAt is required");
      sendAt = new Date(sendAtRaw);
      if (Number.isNaN(sendAt.getTime()))
        return apiError(400, "sendAt is not a valid date");
    }

    let attachments;
    try {
      attachments = await parseFormAttachments(form);
    } catch (err) {
      if (err instanceof AttachmentLimitError)
        return apiError(400, err.message);
      throw err;
    }

    if (!subject?.trim() && !body?.trim() && attachments.length === 0) {
      return apiError(
        400,
        "Message is empty -- add a subject, body, or attachment before sending",
      );
    }

    let fromAddress = email;
    if (from && from !== email) {
      const [[owned]] = await pool.query<RowDataPacket[]>(
        "SELECT 1 FROM virtual_aliases WHERE source = ? AND destination = ?",
        [from, email],
      );
      if (!owned)
        return apiError(
          403,
          "You can only send from your own address or an alias you own",
        );
      fromAddress = from;
    }

    const [result] = await pool.query(
      `INSERT INTO scheduled_sends
        (mailbox_email, from_address, to_addresses, cc_addresses, bcc_addresses,
         subject, body, html, in_reply_to, message_references, send_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email,
        fromAddress,
        to,
        cc || null,
        bcc || null,
        subject || "(no subject)",
        body || "",
        html || null,
        inReplyTo,
        referencesRaw || null,
        sendAt,
      ],
    );
    const id = (result as { insertId: number }).insertId;

    for (const a of attachments) {
      await pool.query(
        `INSERT INTO scheduled_send_attachments
          (scheduled_send_id, filename, content_type, content)
         VALUES (?, ?, ?, ?)`,
        [id, a.filename, a.contentType, a.content],
      );
    }

    return Response.json(
      { ok: true, id, sendAt: sendAt.toISOString() },
      { status: 201 },
    );
  });
}
