import { NextRequest } from "next/server";
import { requireSession } from "@/lib/api/auth";
import { pool } from "@/lib/api/db";
import { apiError, withApiErrors } from "@/lib/api/handler";
import { regenerateAndInstallFilters } from "@/lib/api/sieve";
import type { RowDataPacket } from "mysql2";

type Ctx = { params: Promise<{ id: string }> };

const FIELDS = new Set(["from", "to", "subject"]);
const MATCH_TYPES = new Set(["contains", "equals", "domain"]);
const ACTIONS = new Set(["move", "delete", "mark_read", "star", "allow"]);
const DOMAIN_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req);
    const id = Number((await params).id);
    const body = (await req.json().catch(() => ({}))) || {};

    const [[existing]] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM mail_filters WHERE id = ? AND mailbox_email = ?",
      [id, email],
    );
    if (!existing) return apiError(404, "Filter not found");

    const name =
      body.name !== undefined ? String(body.name).trim() : existing.name;
    const field = body.field !== undefined ? body.field : existing.field;
    const matchType =
      body.matchType !== undefined ? body.matchType : existing.match_type;
    const value =
      body.value !== undefined ? String(body.value).trim() : existing.value;
    const action = body.action !== undefined ? body.action : existing.action;
    const actionFolder =
      body.actionFolder !== undefined
        ? String(body.actionFolder).trim()
        : existing.action_folder;
    const enabled =
      body.enabled !== undefined
        ? Boolean(body.enabled)
        : Boolean(existing.enabled);

    if (!name) return apiError(400, "name is required");
    if (!FIELDS.has(field))
      return apiError(400, "field must be from/to/subject");
    if (!MATCH_TYPES.has(matchType))
      return apiError(400, "matchType must be contains/equals/domain");
    if (!value) return apiError(400, "value is required");
    if (matchType === "domain" && !DOMAIN_PATTERN.test(value))
      return apiError(400, "value must be a bare domain, e.g. spammer.com");
    if (!ACTIONS.has(action))
      return apiError(400, "action must be move/delete/mark_read/star/allow");
    if (action === "move" && !actionFolder)
      return apiError(400, "actionFolder is required for a move action");

    await pool.query(
      `UPDATE mail_filters
       SET name = ?, field = ?, match_type = ?, value = ?, action = ?, action_folder = ?, enabled = ?
       WHERE id = ?`,
      [
        name,
        field,
        matchType,
        value,
        action,
        action === "move" ? actionFolder : null,
        enabled,
        id,
      ],
    );

    try {
      await regenerateAndInstallFilters(email, password);
    } catch (err) {
      return apiError(
        502,
        err instanceof Error ? err.message : "Failed to update filter",
      );
    }
    return Response.json({ ok: true });
  });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req);
    const id = Number((await params).id);
    const [result] = await pool.query(
      "DELETE FROM mail_filters WHERE id = ? AND mailbox_email = ?",
      [id, email],
    );
    if ((result as { affectedRows: number }).affectedRows === 0) {
      return apiError(404, "Filter not found");
    }
    try {
      await regenerateAndInstallFilters(email, password);
    } catch (err) {
      return apiError(
        502,
        err instanceof Error ? err.message : "Failed to update filter script",
      );
    }
    return Response.json({ ok: true });
  });
}
