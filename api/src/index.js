import express from 'express'
import cors from 'cors'
import { migrate } from './db.js'
import { authRouter } from './routes/auth.js'
import { mailRouter } from './routes/mail.js'
import { aliasesRouter } from './routes/aliases.js'
import { mailboxesRouter } from './routes/mailboxes.js'
import { domainsRouter } from './routes/domains.js'
import { healthRouter } from './routes/health.js'
import { statsRouter } from './routes/stats.js'

const app = express()
app.use(cors({ origin: (process.env.CORS_ORIGIN || '').split(',').filter(Boolean) }))
app.use(express.json())

app.get('/api/ping', (req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)
app.use('/api/mail/aliases', aliasesRouter)
app.use('/api/mail', mailRouter)
app.use('/api/admin/mailboxes', mailboxesRouter)
app.use('/api/admin/domains', domainsRouter)
app.use('/api/admin/health', healthRouter)
app.use('/api/admin/stats', statsRouter)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

const port = Number(process.env.PORT) || 4000

migrate()
  .then(() => {
    app.listen(port, () => console.log(`api listening on :${port}`))
  })
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
