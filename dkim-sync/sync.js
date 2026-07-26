// Syncs virtual_domains.dkim_private_key into OpenDKIM's KeyTable/
// SigningTable and reloads it via SIGHUP, using the PID namespace shared
// with mail_justu_opendkim (docker-compose.opendkim.yml) -- no Docker
// socket needed. mysql2, not a native mysql/mariadb CLI: Alpine's client
// can't do MySQL 8's caching_sha2_password auth at all.
const mysql = require('mysql2/promise')
const fs = require('fs')
const path = require('path')

const KEYS_DIR = '/etc/opendkim/keys'
const CONF_DIR = '/etc/opendkim/conf.d'
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

// Image ships verify-only (Mode "v") -- add signing config once.
function bootstrapOpendkimConf() {
  fs.mkdirSync(KEYS_DIR, { recursive: true })
  fs.mkdirSync(CONF_DIR, { recursive: true })
  const conf = fs.readFileSync('/etc/opendkim/opendkim.conf', 'utf8')
  if (/^KeyTable/m.test(conf)) return
  const patched = `${conf.replace(/^Mode.*$/m, 'Mode                    sv')}
KeyTable                ${CONF_DIR}/KeyTable
SigningTable            ${CONF_DIR}/SigningTable
InternalHosts           ${CONF_DIR}/TrustedHosts
ExternalIgnoreList      ${CONF_DIR}/TrustedHosts
`
  fs.writeFileSync('/etc/opendkim/opendkim.conf', patched)
  fs.writeFileSync(path.join(CONF_DIR, 'TrustedHosts'), '127.0.0.1\n::1\nmail_justu_postfix\n')
}

function findOpendkimPid() {
  for (const entry of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      const argv0 = fs.readFileSync(`/proc/${entry}/cmdline`, 'utf8').split('\0')[0]
      if (argv0 === 'opendkim' || argv0.endsWith('/opendkim')) return Number(entry)
    } catch {
      // process exited between readdir and read, or no permission -- skip
    }
  }
  return null
}

function reloadOpendkim() {
  const pid = findOpendkimPid()
  if (pid) process.kill(pid, 'SIGHUP')
  else console.error('opendkim process not found to signal')
}

async function syncOnce() {
  const [rows] = await pool.query(
    'SELECT name, dkim_selector, dkim_private_key FROM virtual_domains WHERE dkim_private_key IS NOT NULL',
  )

  let keyTable = ''
  let signingTable = ''
  for (const row of rows) {
    const domain = row.name
    const selector = row.dkim_selector
    if (!DOMAIN_RE.test(domain)) {
      console.error(`skipping unsafe domain name from DB: ${domain}`)
      continue
    }
    const keyFile = path.join(KEYS_DIR, `${domain}.private`)
    fs.writeFileSync(keyFile, row.dkim_private_key, { mode: 0o600 })
    // 90:91 = opendkim:opendkim's fixed uid/gid in instrumentisto/opendkim
    fs.chownSync(keyFile, 90, 91)
    keyTable += `${selector}._domainkey.${domain} ${domain}:${selector}:${keyFile}\n`
    signingTable += `${domain} ${selector}._domainkey.${domain}\n`
  }

  const keyTablePath = path.join(CONF_DIR, 'KeyTable')
  const signingTablePath = path.join(CONF_DIR, 'SigningTable')
  const prevKeyTable = fs.existsSync(keyTablePath) ? fs.readFileSync(keyTablePath, 'utf8') : null
  const prevSigningTable = fs.existsSync(signingTablePath) ? fs.readFileSync(signingTablePath, 'utf8') : null

  if (keyTable !== prevKeyTable || signingTable !== prevSigningTable) {
    fs.writeFileSync(keyTablePath, keyTable)
    fs.writeFileSync(signingTablePath, signingTable)
    console.log(`${new Date().toISOString()} KeyTable/SigningTable changed -- reloading opendkim`)
    reloadOpendkim()
    await pool.query(
      'UPDATE virtual_domains SET dkim_synced_at = NOW() WHERE dkim_private_key IS NOT NULL AND dkim_synced_at IS NULL',
    )
  }
}

async function main() {
  bootstrapOpendkimConf()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await syncOnce()
    } catch (err) {
      console.error(new Date().toISOString(), 'sync failed:', err.message)
    }
    await new Promise((resolve) => setTimeout(resolve, 15000))
  }
}

main()
