-- Virtual mailbox hosting schema for the `mail` database.
--
-- Queried directly by:
--   - Postfix, via the mysql: maps in ./volumes/postfix/mysql-virtual-*.cf
--   - Dovecot, via the SQL passdb in ./volumes/dovecot/conf.d/auth-sql.conf
--   - api/, which is the only thing that should ever write to these tables
--
-- Applied automatically by api/ on startup (idempotent, CREATE TABLE IF NOT
-- EXISTS). This file is the readable reference copy.

CREATE TABLE IF NOT EXISTS virtual_domains (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS virtual_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  domain_id INT NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (domain_id) REFERENCES virtual_domains(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS virtual_aliases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  domain_id INT NOT NULL,
  source VARCHAR(255) NOT NULL,
  destination VARCHAR(255) NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES virtual_domains(id) ON DELETE CASCADE
);
