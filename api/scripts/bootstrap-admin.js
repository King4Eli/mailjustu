import bcrypt from 'bcryptjs'
import { pool } from '../src/db.js'

const [, , email, password] = process.argv

if (!email || !password) {
  console.error('Usage: node scripts/bootstrap-admin.js <email> <password>')
  process.exit(1)
}

const match = /^([^@\s]+)@([^@\s]+)$/.exec(email.trim().toLowerCase())
if (!match) {
  console.error('email must look like user@domain')
  process.exit(1)
}
const [normalizedEmail, , domain] = match

const conn = await pool.getConnection()
try {
  await conn.beginTransaction()
  await conn.query('INSERT IGNORE INTO virtual_domains (name) VALUES (?)', [domain])
  const [[domainRow]] = await conn.query('SELECT id FROM virtual_domains WHERE name = ?', [domain])
  const hash = `{BLF-CRYPT}${bcrypt.hashSync(password, 10)}`

  const [[existing]] = await conn.query('SELECT id FROM virtual_users WHERE email = ?', [normalizedEmail])
  if (existing) {
    await conn.query('UPDATE virtual_users SET password = ?, is_admin = TRUE WHERE id = ?', [hash, existing.id])
    console.log(`Updated ${normalizedEmail}: password reset, is_admin=1 (domain admin for ${domain}).`)
  } else {
    await conn.query('INSERT INTO virtual_users (domain_id, email, password, is_admin) VALUES (?, ?, ?, TRUE)', [
      domainRow.id,
      normalizedEmail,
      hash,
    ])
    console.log(`Created ${normalizedEmail}: is_admin=1 (domain admin for ${domain}).`)
  }
  await conn.commit()
  console.log(`For full super-admin access, also add "${normalizedEmail}" to SUPER_ADMIN_EMAILS in ./.env/api.env and recreate the api container.`)
} catch (err) {
  await conn.rollback()
  console.error(err.message)
  process.exit(1)
} finally {
  conn.release()
  process.exit(0)
}
