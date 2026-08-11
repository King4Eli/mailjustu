// Root of the References chain, falling back to In-Reply-To, then id.
export function computeThreadId(headers: {
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
}): string {
  if (headers.references && headers.references.length > 0)
    return headers.references[0];
  return headers.inReplyTo || headers.messageId || "";
}

export function normalizeReferences(
  value: string | string[] | undefined,
): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
