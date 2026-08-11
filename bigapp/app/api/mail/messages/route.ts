import { NextRequest } from "next/server";
import { simpleParser } from "mailparser";
import { withImap, resolveFolder } from "@/lib/api/imap";
import { requireSession } from "@/lib/api/auth";
import { apiError, withApiErrors } from "@/lib/api/handler";
import { computeThreadId, normalizeReferences } from "@/lib/api/threading";

const LIST_LIMIT = 30;

function cleanPreview(text: string | undefined) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

export async function GET(req: NextRequest) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req);
    const folder = req.nextUrl.searchParams.get("folder") || "INBOX";
    // Older-than cursor: sequence number of the oldest message already
    // loaded by the client. Omitted on the first page, which fetches the
    // newest LIST_LIMIT messages instead.
    const beforeParam = req.nextUrl.searchParams.get("before");
    const before = beforeParam ? Number(beforeParam) : null;
    const result = await withImap(email, password, async (client) => {
      const mailbox = await client.mailboxOpen(folder);
      const to = before != null ? before - 1 : mailbox.exists;
      if (mailbox.exists === 0 || to < 1) return { messages: [], nextBefore: null };
      const from = Math.max(1, to - LIST_LIMIT + 1);
      const nextBefore = from > 1 ? from : null;
      const out = [];
      for await (const msg of client.fetch(`${from}:${to}`, {
        envelope: true,
        flags: true,
        uid: true,
        internalDate: true,
        source: true,
      })) {
        const parsed = await simpleParser(msg.source!);
        const envelope = msg.envelope!;
        const messageId = parsed.messageId;
        const inReplyTo = parsed.inReplyTo;
        const references = normalizeReferences(parsed.references);
        out.push({
          uid: msg.uid,
          subject: envelope.subject || "(no subject)",
          from: envelope.from?.[0]
            ? {
                name: envelope.from[0].name || envelope.from[0].address,
                email: envelope.from[0].address,
              }
            : { name: "Unknown", email: "" },
          to: (envelope.to || []).map((t) => t.address),
          cc: (envelope.cc || []).map((t) => t.address),
          date: new Date(
            msg.internalDate || envelope.date || new Date(),
          ).toISOString(),
          read: msg.flags!.has("\\Seen"),
          starred: msg.flags!.has("\\Flagged"),
          preview: cleanPreview(parsed.text),
          messageId,
          inReplyTo,
          references,
          threadId: computeThreadId({ messageId, inReplyTo, references }),
          // Inline (cid-referenced) images render in the body itself, not
          // as a downloadable attachment -- keep the paperclip icon and
          // "Attachments" filter limited to real, separately-listed files.
          attachments: (parsed.attachments || [])
            .map((a, index) => ({
              index,
              name: a.filename || "attachment",
              size: `${Math.ceil(a.size / 1024)} KB`,
              inline: Boolean(a.cid && a.related),
            }))
            .filter((a) => !a.inline)
            .map(({ index, name, size }) => ({ index, name, size })),
        });
      }
      return { messages: out.reverse(), nextBefore };
    });
    return Response.json({ folder, ...result });
  });
}

// Permanently deletes every message in a folder -- only allowed for
// Trash/Spam, where "empty" means gone for good rather than moved.
export async function DELETE(req: NextRequest) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req);
    const folder = req.nextUrl.searchParams.get("folder");
    if (!folder) return apiError(400, "folder is required");
    try {
      await withImap(email, password, async (client) => {
        const trash = await resolveFolder(client, email, "Trash");
        const junk = await resolveFolder(client, email, "Junk");
        if (folder !== trash && folder !== junk) {
          throw Object.assign(
            new Error("Only Trash or Spam can be emptied"),
            { invalidFolder: true },
          );
        }
        await client.mailboxOpen(folder);
        await client.messageDelete({ all: true });
      });
      return Response.json({ ok: true });
    } catch (err) {
      return apiError(
        (err as { invalidFolder?: boolean }).invalidFolder ? 400 : 500,
        (err as Error).message,
      );
    }
  });
}
