import { Router } from 'express'
import net from 'node:net'
import { requireAdmin } from '../middleware/auth.js'

export const healthRouter = Router()
healthRouter.use(requireAdmin)

// Hostnames come from env so renaming a service in docker-compose.yml
// (and the corresponding .env file) is the only place that needs to change.
const SERVICES = [
  { name: 'Postfix', detail: 'SMTP · ports 25, 465, 587', host: process.env.SMTP_HOST || 'mail_justu_postfix', port: 25 },
  { name: 'Dovecot', detail: 'IMAP · ports 143, 993', host: process.env.IMAP_HOST || 'mail_justu_dovecot', port: 31143 },
  { name: 'Rspamd', detail: 'Spam filtering', host: process.env.RSPAMD_HOST || 'mail_justu_rspamd', port: 11334, optional: true },
  { name: 'OpenDKIM', detail: 'DKIM signing', host: process.env.OPENDKIM_HOST || 'mail_justu_opendkim', port: 8891, optional: true },
  { name: 'ClamAV', detail: 'Malware scanning', host: process.env.CLAMAV_HOST || 'mail_justu_clamav', port: 3310, optional: true },
  { name: 'MySQL', detail: 'Account metadata', host: process.env.DB_HOST || 'global_mysql', port: Number(process.env.DB_PORT) || 3306 },
  { name: 'Redis', detail: 'Rspamd cache', host: process.env.REDIS_HOST || 'mail_justu_redis', port: 6379, optional: true },
]

function pingPort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const start = Date.now()
    const socket = net.connect({ host, port })
    const done = (up) => {
      socket.destroy()
      resolve({ up, latencyMs: Date.now() - start })
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

healthRouter.get('/', async (req, res) => {
  const services = await Promise.all(
    SERVICES.map(async (service) => {
      const { up, latencyMs } = await pingPort(service.host, service.port)
      return {
        name: service.name,
        detail: service.detail,
        optional: Boolean(service.optional),
        status: up ? 'healthy' : service.optional ? 'not running' : 'down',
        latencyMs: up ? latencyMs : null,
      }
    }),
  )
  const required = services.filter((s) => !s.optional)
  const healthyRequired = required.filter((s) => s.status === 'healthy').length
  res.json({
    services,
    summary: {
      healthy: services.filter((s) => s.status === 'healthy').length,
      total: services.length,
      requiredHealthy: healthyRequired,
      requiredTotal: required.length,
    },
  })
})
