'use client'

import dynamic from 'next/dynamic'

// App.jsx uses localStorage/window throughout -- it's inherently a
// client-only SPA, so skip Next's server-render/prerender pass entirely
// rather than guarding every browser API call.
const AdminRoot = dynamic(() => import('./AdminRoot'), { ssr: false })

export default function AdminPageClient({ title, mailHost }: { title: string; mailHost: string }) {
  return <AdminRoot title={title} mailHost={mailHost} />
}
