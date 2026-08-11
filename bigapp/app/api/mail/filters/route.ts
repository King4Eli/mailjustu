import { NextRequest } from "next/server";
import { requireSession } from "@/lib/api/auth";
import { pool } from "@/lib/api/db";
import { apiError, withApiErrors } from "@/lib/api/handler";
import { regenerateAndInstallFilters } from "@/lib/api/sieve";
import type { RowDataPacket } from "mysql2";

const FIELDS = new Set(["from", "to", "subject"]);
const MATCH_TYPES = new Set(["contains", "equals"]);
const ACTIONS = new Set(["move", "delete", "mark_read", "star"]);

export async function GET(req: NextRequest) {
  return withApiErrors(async () => {
    const { email } = requireSession(req);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, field, match_type, value, action, action_folder, position, enabled
       FROM mail_filters WHERE mailbox_email = ? ORDER BY position, id`,
      [email],
    );
    return Response.json({ filters: rows });
  });
}

// Every mutation here regenerates the mailbox's whole Sieve script from
// the current mail_filters rows and reinstalls it over ManageSieve (see
// lib/api/sieve.ts) -- rules take effect at Dovecot's next delivery, not
// just next time this app polls, and work from any mail client, not only
// this one.
export async function POST(req: NextRequest) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req);
    const body = (await req.json().catch(() => ({}))) || {};
    const { name, field, matchType, value, action, actionFolder } = body;
    if (!name?.trim()) return apiError(400, "name is required");
    if (!FIELDS.has(field)) return apiError(400, "field must be from/to/subject");
    if (!MATCH_TYPES.has(matchType))
      return apiError(400, "matchType must be contains/equals");
    if (!value?.trim()) return apiError(400, "value is required");
    if (!ACTIONS.has(action))
      return apiError(400, "action must be move/delete/mark_read/star");
    if (action === "move" && !actionFolder?.trim())
      return apiError(400, "actionFolder is required for a move action");

    const [[{ maxPos }]] = await pool.query<RowDataPacket[]>(
      "SELECT COALESCE(MAX(position), -1) AS maxPos FROM mail_filters WHERE mailbox_email = ?",
      [email],
    );
    const [result] = await pool.query(
      `INSERT INTO mail_filters
        (mailbox_email, name, field, match_type, value, action, action_folder, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email,
        name.trim(),
        field,
        matchType,
        value.trim(),
        action,
        action === "move" ? actionFolder.trim() : null,
        (maxPos as number) + 1,
      ],
    );
    const id = (result as { insertId: number }).insertId;

    try {
      await regenerateAndInstallFilters(email, password);
    } catch (err) {
      // Don't leave a rule in the DB that isn't actually active in Sieve.
      await pool.query("DELETE FROM mail_filters WHERE id = ?", [id]);
      return apiError(
        502,
        err instanceof Error ? err.message : "Failed to install filter",
      );
    }
    return Response.json({ ok: true, id }, { status: 201 });
  });
}
