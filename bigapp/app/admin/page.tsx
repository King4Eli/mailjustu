import AdminPageClient from './AdminPageClient'

// Without this, Next.js statically prerenders this page at `next build`
// time (confirmed by testing -- it showed up as a Static route and baked
// in whatever ADMIN_TITLE/MAIL_HOST were set during the build), which
// defeats the entire point of reading them here instead of at build time.
export const dynamic = 'force-dynamic'

// A real Server Component: this reads live container env vars on every
// request, no build/bake step involved -- change .env/webfront.env and
// restart the container, no rebuild needed.
export default function AdminPage() {
  const title = process.env.ADMIN_TITLE || 'Postmaster'
  const mailHost = process.env.MAIL_HOST || 'mail.example.com'
  return <AdminPageClient title={title} mailHost={mailHost} />
}
