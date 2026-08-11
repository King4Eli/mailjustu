import { NextRequest } from "next/server";
import { withImap, resolveFolder } from "@/lib/api/imap";
import { requireSession } from "@/lib/api/auth";
import { apiError, withApiErrors } from "@/lib/api/handler";
import { pool } from "@/lib/api/db";
import {
  parseMessageSummary,
  MESSAGE_FETCH_QUERY,
} from "@/lib/api/messageParsing";
import type { RowDataPacket } from "mysql2";

const LIST_LIMIT = Number(process.env.MESSAGE_LIST_PAGE_SIZE) || 30;
const SEARCH_RESULT_LIMIT = Number(process.env.SEARCH_RESULT_LIMIT) || 100;

export async function GET(req: NextRequest) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req);
    const folder = req.nextUrl.searchParams.get("folder") || "INBOX";
    const q = req.nextUrl.searchParams.get("q")?.trim() || null;
    // Older-than cursor: sequence number of the oldest message already
    // loaded by the client. Omitted on the first page, which fetches the
    // newest LIST_LIMIT messages instead. Not used in search mode -- a
    // search runs over the whole folder in one shot, capped at
    // SEARCH_RESULT_LIMIT, rather than paging.
    const beforeParam = req.nextUrl.searchParams.get("before");
    const before = beforeParam ? Number(beforeParam) : null;

    // Currently-snoozed uids in this folder -- excluded below so a snoozed
    // message actually disappears from its folder until it wakes (see
    // _docs/schema.sql's snoozed_messages comment: no IMAP move involved,
    // just this filter).
    const [snoozedRows] = await pool.query<RowDataPacket[]>(
      "SELECT uid FROM snoozed_messages WHERE mailbox_email = ? AND folder = ? AND wake_at > NOW()",
      [email, folder],
    );
    const snoozedUids = new Set(snoozedRows.map((r) => r.uid as number));

    const result = await withImap(email, password, async (client) => {
      const mailbox = await client.mailboxOpen(folder);
      if (mailbox.exists === 0) return { messages: [], nextBefore: null };

      let fetchRange: string | number[];
      let useUid = false;
      let nextBefore: number | null = null;
      if (q) {
        // Real IMAP SEARCH across the whole folder (subject/from/body),
        // not just whatever page happens to already be loaded client-side.
        const uids = await client.search(
          { or: [{ subject: q }, { from: q }, { text: q }] },
          { uid: true },
        );
        if (!uids || uids.length === 0)
          return { messages: [], nextBefore: null };
        fetchRange = uids.slice(-SEARCH_RESULT_LIMIT);
        useUid = true;
      } else {
        const to = before != null ? before - 1 : mailbox.exists;
        if (to < 1) return { messages: [], nextBefore: null };
        const from = Math.max(1, to - LIST_LIMIT + 1);
        nextBefore = from > 1 ? from : null;
        fetchRange = `${from}:${to}`;
      }

      const out = [];
      for await (const msg of client.fetch(
        fetchRange,
        MESSAGE_FETCH_QUERY,
        useUid ? { uid: true } : undefined,
      )) {
        if (snoozedUids.has(msg.uid)) continue;
        out.push(await parseMessageSummary(msg));
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
          throw Object.assign(new Error("Only Trash or Spam can be emptied"), {
            invalidFolder: true,
          });
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
