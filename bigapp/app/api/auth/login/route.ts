import { NextRequest } from "next/server";
import { withImap } from "@/lib/api/imap";
import { createSession, isSuperAdminEmail } from "@/lib/api/auth";
import { pool } from "@/lib/api/db";
import { apiError, withApiErrors } from "@/lib/api/handler";
import {
  isRateLimited,
  recordFailedAttempt,
  clearAttempts,
} from "@/lib/api/rateLimit";
import type { RowDataPacket } from "mysql2";

const LOGIN_RATE_LIMIT_MAX_ATTEMPTS =
  Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS) || 5;
// A single IP hitting many different accounts is throttled more loosely
// than one account being brute-forced, since it also has to cover
// legitimate shared-IP traffic (offices, NAT, mobile carriers).
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP =
  Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP) || 20;
const LOGIN_RATE_LIMIT_WINDOW_MS =
  (Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES) || 15) * 60 * 1000;

function clientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  return withApiErrors(async () => {
    const { email, password } = (await req.json().catch(() => ({}))) || {};
    if (!email || !password) {
      return apiError(400, "email and password are required");
    }
    const normalizedEmail = email.trim().toLowerCase();
    const emailKey = `login:email:${normalizedEmail}`;
    const ipKey = `login:ip:${clientIp(req)}`;

    const emailStatus = isRateLimited(emailKey, LOGIN_RATE_LIMIT_MAX_ATTEMPTS);
    const ipStatus = isRateLimited(ipKey, LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP);
    if (emailStatus.limited || ipStatus.limited) {
      const retryAfterSeconds = Math.max(
        emailStatus.retryAfterSeconds,
        ipStatus.retryAfterSeconds,
      );
      return apiError(
        429,
        `Too many login attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
      );
    }

    try {
      await withImap(normalizedEmail, password, async () => {});
    } catch (err) {
      recordFailedAttempt(emailKey, LOGIN_RATE_LIMIT_WINDOW_MS);
      recordFailedAttempt(ipKey, LOGIN_RATE_LIMIT_WINDOW_MS);
      console.error("IMAP login failed for", normalizedEmail, err);
      return apiError(401, "Invalid email or password");
    }
    clearAttempts(emailKey);
    clearAttempts(ipKey);

    const [[row]] = await pool.query<RowDataPacket[]>(
      `SELECT vu.is_admin, vd.name AS domain
       FROM virtual_users vu JOIN virtual_domains vd ON vu.domain_id = vd.id
       WHERE vu.email = ?`,
      [normalizedEmail],
    );
    const record =
      (row as { is_admin?: boolean; domain?: string } | undefined) || undefined;
    const domain = record?.domain || normalizedEmail.split("@")[1];
    const role = isSuperAdminEmail(normalizedEmail)
      ? "super"
      : record?.is_admin
        ? "domain"
        : "user";

    const token = createSession(normalizedEmail, password, role, domain);
    return Response.json({ token, email: normalizedEmail, role, domain });
  });
}
