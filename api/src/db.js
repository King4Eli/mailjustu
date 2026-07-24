import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mailjustu_mysql',
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
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length && !s.startsWith('--'))
  const conn = await pool.getConnection()
  try {
    for (const statement of statements) {
      await conn.query(statement)
    }
  } finally {
    conn.release()
  }
}
