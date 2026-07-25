'use client'

import dynamic from 'next/dynamic'

// App.tsx uses localStorage/window throughout -- it's inherently a
// client-only SPA, so skip Next's server-render/prerender pass entirely
// rather than guarding every browser API call.
const WebmailRoot = dynamic(() => import('./WebmailRoot'), { ssr: false })

export default function WebmailPage() {
  return <WebmailRoot />
}
