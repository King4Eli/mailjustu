import { pool } from "./db";
import { installSieveScript } from "./manageSieve";
import type { RowDataPacket } from "mysql2";

export interface FilterRuleRow extends RowDataPacket {
  id: number;
  name: string;
  field: "from" | "to" | "subject";
  match_type: "contains" | "equals" | "domain";
  value: string;
  action: "move" | "delete" | "mark_read" | "star" | "allow";
  action_folder: string | null;
  position: number;
  enabled: boolean;
}

// One active script per mailbox, always regenerated in full.
const SCRIPT_NAME = "mailjustu-filters";

function sieveQuote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function generateSieveScript(rules: FilterRuleRow[]): string {
  // "allow" rules always run first, so they win over a block/move rule.
  const active = rules.filter((r) => r.enabled);
  const ordered = [
    ...active.filter((r) => r.action === "allow"),
    ...active.filter((r) => r.action !== "allow"),
  ];

  const requires = new Set<string>(["fileinto"]);
  if (active.some((r) => r.action === "move")) requires.add("mailbox");
  if (active.some((r) => r.action === "mark_read" || r.action === "star"))
    requires.add("imap4flags");

  const lines: string[] = [
    `require [${[...requires].map(sieveQuote).join(", ")}];`,
    "",
  ];

  for (const rule of ordered) {
    // "domain" is a wildcard match ("*@spammer.com"), not a substring.
    const test =
      rule.match_type === "equals"
        ? `header :is ${sieveQuote(rule.field)} ${sieveQuote(rule.value)}`
        : rule.match_type === "domain"
          ? `header :matches ${sieveQuote(rule.field)} ${sieveQuote(`*@${rule.value}`)}`
          : `header :contains ${sieveQuote(rule.field)} ${sieveQuote(rule.value)}`;
    lines.push(`# ${rule.name}`, `if ${test} {`);
    switch (rule.action) {
      case "move":
        lines.push(
          `  fileinto :create ${sieveQuote(rule.action_folder || "INBOX")};`,
        );
        break;
      case "delete":
        lines.push(`  discard;`);
        break;
      case "mark_read":
        lines.push(`  setflag "\\\\Seen";`, `  keep;`);
        break;
      case "star":
        lines.push(`  setflag "\\\\Flagged";`, `  keep;`);
        break;
      case "allow":
        lines.push(`  keep;`);
        break;
    }
    // Stop so each message is handled by its first matching rule only.
    lines.push(`  stop;`, `}`, "");
  }
  return lines.join("\n");
}

export async function regenerateAndInstallFilters(
  email: string,
  password: string,
): Promise<void> {
  const [rows] = await pool.query<FilterRuleRow[]>(
    `SELECT id, name, field, match_type, value, action, action_folder, position, enabled
     FROM mail_filters
     WHERE mailbox_email = ?
     ORDER BY position, id`,
    [email],
  );
  const script = generateSieveScript(rows);
  await installSieveScript(email, password, SCRIPT_NAME, script);
}
