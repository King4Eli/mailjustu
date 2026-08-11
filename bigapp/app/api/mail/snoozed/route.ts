import { NextRequest } from "next/server";
import { withImap } from "@/lib/api/imap";
import { requireSession } from "@/lib/api/auth";
import { withApiErrors } from "@/lib/api/handler";
import { pool } from "@/lib/api/db";
import {
  parseMessageSummary,
  MESSAGE_FETCH_QUERY,
} from "@/lib/api/messageParsing";
import type { RowDataPacket } from "mysql2";

interface SnoozedRow extends RowDataPacket {
  folder: string;
  uid: number;
  wake_at: string;
}

// Backs the "Snoozed" pseudo-folder -- groups rows by folder, fetches by UID.
export async function GET(req: NextRequest) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req);
    const [rows] = await pool.query<SnoozedRow[]>(
      "SELECT folder, uid, wake_at FROM snoozed_messages WHERE mailbox_email = ? AND wake_at > NOW() ORDER BY wake_at",
      [email],
    );
    if (rows.length === 0) return Response.json({ messages: [] });

    const byFolder = new Map<string, number[]>();
    const wakeAtByKey = new Map<string, string>();
    for (const row of rows) {
      const list = byFolder.get(row.folder) || [];
      list.push(row.uid);
      byFolder.set(row.folder, list);
      wakeAtByKey.set(
        `${row.folder}:${row.uid}`,
        new Date(row.wake_at).toISOString(),
      );
    }

    const messages = await withImap(email, password, async (client) => {
      const out = [];
      for (const [folder, uids] of byFolder) {
        await client.mailboxOpen(folder).catch(() => null);
        for await (const msg of client.fetch(uids, MESSAGE_FETCH_QUERY, {
          uid: true,
        })) {
          const summary = await parseMessageSummary(msg);
          out.push({
            ...summary,
            sourceFolder: folder,
            wakeAt: wakeAtByKey.get(`${folder}:${msg.uid}`),
          });
        }
      }
      return out.sort(
        (a, b) => new Date(a.wakeAt!).getTime() - new Date(b.wakeAt!).getTime(),
      );
    });
    return Response.json({ messages });
  });
}
