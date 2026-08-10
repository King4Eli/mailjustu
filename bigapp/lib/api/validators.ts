// Small, dependency-free validation helpers shared by the admin/mail
// routes -- pulled out so they're unit-testable without a live DB/IMAP
// connection (see ../../api-test/).

export function normalizeMailboxEmail(
  email: string | undefined | null,
): { email: string; domain: string } | null {
  const match = /^([^@\s]+)@([^@\s]+)$/.exec(
    (email || "").trim().toLowerCase(),
  );
  if (!match) return null;
  return { email: match[0], domain: match[2] };
}

export function isValidFolderName(name: unknown): name is string {
  return Boolean(name) && typeof name === "string" && !/[/\\]/.test(name);
}
