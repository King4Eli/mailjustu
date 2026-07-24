import { Router } from 'express'
import { pool } from '../db.js'
import { requireSuperAdmin } from '../middleware/auth.js'

export const statsRouter = Router()
// Domain admins never see background services -- super admin only. Their
// own mailbox/alias counts are already visible via the scoped
// /admin/mailboxes and /admin/domains responses.
statsRouter.use(requireSuperAdmin)

statsRouter.get('/', async (req, res) => {
  const [[{ mailboxCount }]] = await pool.query('SELECT COUNT(*) AS mailboxCount FROM virtual_users')
  const [[{ domainCount }]] = await pool.query('SELECT COUNT(*) AS domainCount FROM virtual_domains')

  let rspamd = null
  try {
    const host = process.env.RSPAMD_HOST || 'mailjustu_rspamd'
    const port = process.env.RSPAMD_PORT || '11334'
    const response = await fetch(`http://${host}:${port}/stat`, {
      headers: { Password: process.env.RSPAMD_CONTROLLER_PASSWORD || '' },
      signal: AbortSignal.timeout(2000),
    })
    if (response.ok) {
      const data = await response.json()
      rspamd = {
        scanned: data.scanned,
        learned: data.learned,
        actions: data.actions,
        uptime: data.uptime,
      }
    }
  } catch {
    rspamd = null
  }

  res.json({
    mailboxCount,
    domainCount,
    rspamd,
    rspamdAvailable: rspamd !== null,
  })
})
