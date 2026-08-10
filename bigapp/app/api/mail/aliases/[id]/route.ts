import { NextRequest } from "next/server";
import { pool } from "@/lib/api/db";
import { requireSession } from "@/lib/api/auth";
import { withApiErrors } from "@/lib/api/handler";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrors(async () => {
    const { email } = requireSession(req);
    const { id } = await params;
    // Ownership check: only ever delete an alias that actually points at you.
    await pool.query(
      "DELETE FROM virtual_aliases WHERE id = ? AND destination = ?",
      [id, email],
    );
    return Response.json({ ok: true });
  });
}
