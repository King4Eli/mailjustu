-- Virtual mailbox hosting schema for the `mail` database.
--
-- Queried directly by:
--   - Postfix, via the mysql: maps in ./volumes/postfix/mysql-virtual-*.cf
--   - Dovecot, via the SQL passdb in ./volumes/dovecot/conf.d/auth-sql.conf
--   - api/, which is the only thing that should ever write to these tables
--
-- Applied automatically by api/ on startup (idempotent, CREATE TABLE IF NOT
-- EXISTS). This file is the readable reference copy.

-- max_mailboxes / max_aliases_per_mailbox / quota_mb: NULL means "use the
-- MAX_MAILBOXES_PER_DOMAIN / MAX_ALIASES_PER_MAILBOX / DEFAULT_MAILBOX_QUOTA_MB
-- defaults from ./.env/api.env"; a non-NULL value here overrides that for
-- this domain. quota_mb is enforced per-mailbox by Dovecot's quota plugin
-- (see ./volumes/dovecot/conf.d/auth-sql.conf's quota_rule in userdb sql).
CREATE TABLE IF NOT EXISTS virtual_domains (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  max_mailboxes INT NULL,
  max_aliases_per_mailbox INT NULL,
  quota_mb INT NULL
);

-- is_admin: a domain admin for this mailbox's own domain -- can manage
-- mailboxes/aliases/limits for that one domain via the admin dashboard,
-- but never sees Services/health/stats (see api/src/middleware/auth.js).
-- Full cross-domain access is instead granted by listing an email in
-- ./.env/api.env's SUPER_ADMIN_EMAILS -- not a column here.
CREATE TABLE IF NOT EXISTS virtual_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  domain_id INT NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (domain_id) REFERENCES virtual_domains(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS virtual_aliases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  domain_id INT NOT NULL,
  source VARCHAR(255) NOT NULL UNIQUE,
  destination VARCHAR(255) NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES virtual_domains(id) ON DELETE CASCADE
);
