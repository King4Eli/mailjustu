export interface Attachment {
  name: string
  size: string
}

export interface EmailMessage {
  id: string
  from: { name: string; email: string }
  to: string[]
  subject: string
  preview: string
  body: string
  date: string
  read: boolean
  starred: boolean
  attachments?: Attachment[]
  // Only set in the aggregated "Starred" view, so actions know which real
  // IMAP folder the message actually lives in.
  sourceFolder?: string
}

export interface FolderInfo {
  id: string
  name: string
  icon: string
  unseen: number
}
