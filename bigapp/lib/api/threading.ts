// Groups messages into conversations the same way real mail clients do:
// walk the References chain back to its root, falling back to In-Reply-To,
// falling back to the message's own id if it never replied to anything.
export function computeThreadId(headers: {
  messageId?: string
  inReplyTo?: string
  references?: string[]
}): string {
  if (headers.references && headers.references.length > 0) return headers.references[0]
  return headers.inReplyTo || headers.messageId || ''
}

export function normalizeReferences(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}
