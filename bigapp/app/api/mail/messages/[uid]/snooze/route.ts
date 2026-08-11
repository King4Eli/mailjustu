import { NextRequest } from "next/server";
import { requireSession } from "@/lib/api/auth";
import { pool } from "@/lib/api/db";
import { apiError, withApiErrors } from "@/lib/api/handler";

type Ctx = { params: Promise<{ uid: string }> };

// Snoozing is a DB-only "hide until" marker, not an IMAP move -- see the
// comment on the snoozed_messages table in _docs/schema.sql for why (no
// mailbox credentials needed at wake time, only at snooze/unsnooze time,
// same as every other authenticated request here).
export async function POST(req: NextRequest, { params }: Ctx) {
  return withApiErrors(async () => {
    const { email } = requireSession(req);
    const folder = req.nextUrl.searchParams.get("folder") || "INBOX";
    const uid = Number((await params).uid);
    const { wakeAt } = (await req.json().catch(() => ({}))) || {};
    if (!wakeAt) return apiError(400, "wakeAt is required");
    const wake = new Date(wakeAt);
    if (Number.isNaN(wake.getTime()) || wake.getTime() <= Date.now())
      return apiError(400, "wakeAt must be a valid future date");
    await pool.query(
      `INSERT INTO snoozed_messages (mailbox_email, folder, uid, wake_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE wake_at = VALUES(wake_at)`,
      [email, folder, uid, wake],
    );
    return Response.json({ ok: true, wakeAt: wake.toISOString() });
  });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  return withApiErrors(async () => {
    const { email } = requireSession(req);
    const folder = req.nextUrl.searchParams.get("folder") || "INBOX";
    const uid = Number((await params).uid);
    await pool.query(
      "DELETE FROM snoozed_messages WHERE mailbox_email = ? AND folder = ? AND uid = ?",
      [email, folder, uid],
    );
    return Response.json({ ok: true });
  });
}
