// multer's own errors (too many files, a file too large) used to get
// thrown from inside its middleware, before the route handler ever ran --
// left alone, that turned into an opaque "Internal server error" with no
// indication of what actually went wrong. Surface them properly instead.
export const MAX_ATTACHMENTS_PER_MESSAGE =
  Number(process.env.MAX_ATTACHMENTS_PER_MESSAGE) || 10;
export const MAX_ATTACHMENT_SIZE_MB =
  Number(process.env.MAX_ATTACHMENT_SIZE_MB) || 25;

export interface ParsedAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export class AttachmentLimitError extends Error {}

export async function parseFormAttachments(
  form: FormData,
): Promise<ParsedAttachment[]> {
  const files = form
    .getAll("attachments")
    .filter((f): f is File => f instanceof File);
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new AttachmentLimitError(
      `Too many attachments (max ${MAX_ATTACHMENTS_PER_MESSAGE}).`,
    );
  }
  const maxBytes = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;
  const oversized = files.find((f) => f.size > maxBytes);
  if (oversized) {
    throw new AttachmentLimitError(
      `Attachment too large (max ${MAX_ATTACHMENT_SIZE_MB} MB per file).`,
    );
  }
  return Promise.all(
    files.map(async (f) => ({
      filename: f.name,
      content: Buffer.from(await f.arrayBuffer()),
      contentType: f.type || "application/octet-stream",
    })),
  );
}
