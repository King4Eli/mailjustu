import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'global_mysql',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'mail',
  waitForConnections: true,
  connectionLimit: 10,
})

export async function migrate() {
  const schemaPath = path.resolve(__dirname, '../../schema.sql')
  const sql = readFileSync(schemaPath, 'utf8')
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  const statements = withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length)
  const conn = await pool.getConnection()
  try {
    for (const statement of statements) {
      await conn.query(statement)
    }
    // Upgrade path for tables created before `source` was made UNIQUE.
    await conn.query('ALTER TABLE virtual_aliases ADD UNIQUE INDEX source (source)').catch((err) => {
      if (err.code !== 'ER_DUP_KEYNAME') throw err
    })
    // Upgrade path for domains created before per-domain limits existed.
    await conn.query('ALTER TABLE virtual_domains ADD COLUMN max_mailboxes INT NULL').catch((err) => {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err
    })
    await conn.query('ALTER TABLE virtual_domains ADD COLUMN max_aliases_per_mailbox INT NULL').catch((err) => {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err
    })
  } finally {
    conn.release()
  }
}
