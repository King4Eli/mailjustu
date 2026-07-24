export type FolderId = 'inbox' | 'starred' | 'sent' | 'drafts' | 'archive' | 'spam' | 'trash'

export interface Folder {
  id: FolderId
  name: string
  icon: string
}

export interface Attachment {
  name: string
  size: string
}

export interface EmailMessage {
  id: string
  folder: FolderId
  from: { name: string; email: string }
  to: string[]
  subject: string
  preview: string
  body: string
  date: string
  read: boolean
  starred: boolean
  labels?: string[]
  attachments?: Attachment[]
}
