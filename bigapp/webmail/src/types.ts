export interface Attachment {
  index: number
  name: string
  size: string
}

export interface EmailMessage {
  id: string
  from: { name: string; email: string }
  to: string[]
  cc?: string[]
  subject: string
  preview: string
  body: string
  html?: string
  date: string
  read: boolean
  starred: boolean
  attachments?: Attachment[]
  // Only set in the aggregated "Starred" view, so actions know which real
  // IMAP folder the message actually lives in.
  sourceFolder?: string
  messageId?: string
  inReplyTo?: string
  references?: string[]
  // Root of this message's References chain -- messages sharing a
  // threadId are the same conversation even if they live in different
  // folders (e.g. their reply landed in Sent, not Inbox).
  threadId?: string
  // Populated only on the representative (most recent) message of a
  // conversation with more than one message, in thread-grouped views --
  // the full conversation, oldest first, for the reading pane to stack.
  threadMessages?: EmailMessage[]
}

export interface FolderInfo {
  id: string
  name: string
  icon: string
  unseen: number
  messages: number
}

export type MessageFilter = 'all' | 'unread' | 'read' | 'starred' | 'attachments'
