import { NextRequest } from "next/server";
import { requireSession } from "@/lib/api/auth";
import { pool } from "@/lib/api/db";
import { apiError, withApiErrors } from "@/lib/api/handler";

type Ctx = { params: Promise<{ id: string }> };

// Cancels a still-pending send. Scoped to 'pending' so it can't race the poller.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  return withApiErrors(async () => {
    const { email } = requireSession(req);
    const id = Number((await params).id);
    const [result] = await pool.query(
      "UPDATE scheduled_sends SET status = 'canceled' WHERE id = ? AND mailbox_email = ? AND status = 'pending'",
      [id, email],
    );
    if ((result as { affectedRows: number }).affectedRows === 0) {
      return apiError(404, "Not found, already sent, or already canceled");
    }
    await pool.query(
      "DELETE FROM scheduled_send_attachments WHERE scheduled_send_id = ?",
      [id],
    );
    return Response.json({ ok: true });
  });
}
