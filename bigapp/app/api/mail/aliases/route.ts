import { NextRequest } from "next/server";
import { pool } from "@/lib/api/db";
import { requireSession } from "@/lib/api/auth";
import { apiError, withApiErrors } from "@/lib/api/handler";
import type { RowDataPacket } from "mysql2";

export async function GET(req: NextRequest) {
  return withApiErrors(async () => {
    const { email } = requireSession(req);
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, source FROM virtual_aliases WHERE destination = ? ORDER BY id DESC",
      [email],
    );
    return Response.json({ aliases: rows });
  });
}

export async function POST(req: NextRequest) {
  return withApiErrors(async () => {
    const { email } = requireSession(req);
    const { alias } = (await req.json().catch(() => ({}))) || {};
    const match = /^([^@\s]+)@([^@\s]+)$/.exec(
      (alias || "").trim().toLowerCase(),
    );
    if (!match) return apiError(400, "alias must look like user@domain");
    const [source, , domain] = match;
    if (source === email)
      return apiError(400, "That is already your primary address");

    // Aliases can only be created on your own domain -- not "anything".
    const ownDomain = email.split("@")[1];
    if (domain !== ownDomain) {
      return apiError(403, `Aliases must be on your own domain (${ownDomain})`);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[existingMailbox]] = await conn.query<RowDataPacket[]>(
        "SELECT 1 FROM virtual_users WHERE email = ?",
        [source],
      );
      if (existingMailbox) {
        await conn.rollback();
        return apiError(
          409,
          "That address is already a mailbox, not available as an alias",
        );
      }

      const [[domainRow]] = await conn.query<RowDataPacket[]>(
        "SELECT id, max_aliases_per_mailbox FROM virtual_domains WHERE name = ?",
        [ownDomain],
      );
      const limit =
        domainRow.max_aliases_per_mailbox ??
        Number(process.env.MAX_ALIASES_PER_MAILBOX) ??
        null;
      if (limit) {
        const [[{ count }]] = await conn.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS count FROM virtual_aliases WHERE destination = ?",
          [email],
        );
        if (count >= limit) {
          await conn.rollback();
          return apiError(409, `You're at your alias limit (${limit})`);
        }
      }

      const [result] = await conn.query<import("mysql2").ResultSetHeader>(
        "INSERT INTO virtual_aliases (domain_id, source, destination) VALUES (?, ?, ?)",
        [domainRow.id, source, email],
      );
      await conn.commit();
      return Response.json({ id: result.insertId, source }, { status: 201 });
    } catch (err) {
      await conn.rollback();
      if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
        return apiError(409, "That alias already exists");
      }
      throw err;
    } finally {
      conn.release();
    }
  });
}
