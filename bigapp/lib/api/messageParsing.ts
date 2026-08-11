import { simpleParser } from "mailparser";
import type { FetchMessageObject } from "imapflow";
import { computeThreadId, normalizeReferences } from "./threading";

// Shared by the messages list/search route and the snoozed-message route.
export function cleanPreview(text: string | undefined) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

export async function parseMessageSummary(msg: FetchMessageObject) {
  const parsed = await simpleParser(msg.source!);
  const envelope = msg.envelope!;
  const messageId = parsed.messageId;
  const inReplyTo = parsed.inReplyTo;
  const references = normalizeReferences(parsed.references);
  return {
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
    // Inline (cid-referenced) images aren't real attachments.
    attachments: (parsed.attachments || [])
      .map((a, index) => ({
        index,
        name: a.filename || "attachment",
        size: `${Math.ceil(a.size / 1024)} KB`,
        inline: Boolean(a.cid && a.related),
      }))
      .filter((a) => !a.inline)
      .map(({ index, name, size }) => ({ index, name, size })),
  };
}

export const MESSAGE_FETCH_QUERY = {
  envelope: true,
  flags: true,
  uid: true,
  internalDate: true,
  source: true,
} as const;
