import { NextRequest } from "next/server";
import { withImap, resolveFolder } from "@/lib/api/imap";
import { requireSession } from "@/lib/api/auth";
import { pool } from "@/lib/api/db";
import {
  AttachmentLimitError,
  parseFormAttachments,
} from "@/lib/api/attachments";
import { apiError, withApiErrors } from "@/lib/api/handler";
import { compileAndRelay } from "@/lib/api/mailSend";
import type { RowDataPacket } from "mysql2";

export async function POST(req: NextRequest) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req);
    const form = await req.formData();
    const to = form.get("to") as string | null;
    const cc = form.get("cc") as string | null;
    const bcc = form.get("bcc") as string | null;
    const subject = form.get("subject") as string | null;
    const body = form.get("body") as string | null;
    const html = form.get("html") as string | null;
    const from = form.get("from") as string | null;
    const inReplyTo = (form.get("inReplyTo") as string | null) || undefined;
    const referencesRaw = (form.get("references") as string | null) || "";
    const references = referencesRaw.split(/\s+/).filter(Boolean);
    if (!to) return apiError(400, "to is required");

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

    const { raw, messageId } = await compileAndRelay({
      from: fromAddress,
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject: subject || "(no subject)",
      text: body || "",
      html: html || undefined,
      attachments,
      inReplyTo,
      references,
    });

    await withImap(email, password, async (client) => {
      const sent = await resolveFolder(client, email, "Sent");
      await client.append(sent, raw, ["\\Seen"]);
    }).catch(() => {});

    return Response.json({ ok: true, messageId });
  });
}
