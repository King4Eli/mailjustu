import { Router } from 'express'
import net from 'node:net'
import { requireAdmin } from '../middleware/auth.js'

export const healthRouter = Router()
healthRouter.use(requireAdmin)

const SERVICES = [
  { name: 'Postfix', detail: 'SMTP · ports 25, 465, 587', host: 'mailjustu_postfix', port: 25 },
  { name: 'Dovecot', detail: 'IMAP · ports 143, 993', host: 'mailjustu_dovecot', port: 31143 },
  { name: 'Rspamd', detail: 'Spam filtering', host: 'mailjustu_rspamd', port: 11334, optional: true },
  { name: 'OpenDKIM', detail: 'DKIM signing', host: 'mailjustu_opendkim', port: 8891, optional: true },
  { name: 'ClamAV', detail: 'Malware scanning', host: 'mailjustu_clamav', port: 3310, optional: true },
  { name: 'MySQL', detail: 'Account metadata', host: 'mailjustu_mysql', port: 3306 },
  { name: 'Redis', detail: 'Rspamd cache', host: 'mailjustu_redis', port: 6379, optional: true },
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
