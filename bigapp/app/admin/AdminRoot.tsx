'use client'

import App from '../../admin/src/App'
import { config } from '../../admin/src/config'

export default function AdminRoot({ title, mailHost }: { title: string; mailHost: string }) {
  config.title = title
  config.mailHost = mailHost
  return <App />
}
