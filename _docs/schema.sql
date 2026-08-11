CREATE TABLE IF NOT EXISTS virtual_domains (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  max_mailboxes INT NULL,
  max_aliases_per_mailbox INT NULL,
  quota_mb INT NULL,
  dkim_selector VARCHAR(63) NULL,
  dkim_private_key TEXT NULL,
  dkim_public_key TEXT NULL,
  dkim_synced_at TIMESTAMP NULL
);
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

-- Queued compose-later/scheduled-send messages. Sent via Postfix's
-- mynetworks-trusted relay (see app/api/mail/send/route.ts), so no
-- mailbox password needs to be stored here -- the background poller
-- (lib/api/scheduler.ts) only needs this row, not the account's
-- credentials. A best-effort Sent-folder copy is attempted if the
-- composing session is still live when it fires; skipped otherwise.
CREATE TABLE IF NOT EXISTS scheduled_sends (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mailbox_email VARCHAR(255) NOT NULL,
  from_address VARCHAR(255) NOT NULL,
  to_addresses TEXT NOT NULL,
  cc_addresses TEXT NULL,
  bcc_addresses TEXT NULL,
  subject VARCHAR(998) NOT NULL DEFAULT '',
  body MEDIUMTEXT NOT NULL,
  html MEDIUMTEXT NULL,
  in_reply_to VARCHAR(998) NULL,
  message_references TEXT NULL,
  send_at TIMESTAMP NOT NULL,
  status ENUM('pending', 'sent', 'failed', 'canceled') NOT NULL DEFAULT 'pending',
  error TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL,
  INDEX idx_scheduled_sends_due (status, send_at),
  INDEX idx_scheduled_sends_mailbox (mailbox_email)
);

CREATE TABLE IF NOT EXISTS scheduled_send_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scheduled_send_id INT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(255) NOT NULL,
  content LONGBLOB NOT NULL,
  FOREIGN KEY (scheduled_send_id) REFERENCES scheduled_sends(id) ON DELETE CASCADE
);

-- "Snooze" is a hide-until marker, not a real IMAP move -- so bringing a
-- message back doesn't need the account's IMAP credentials at wake time,
-- only at snooze time (an authenticated request, like everything else in
-- app/api/mail/*). Matched back to the live message by (mailbox, folder,
-- uid); if the message was itself moved/deleted in the meantime the row
-- just goes stale and is pruned, same as a dangling bookmark.
CREATE TABLE IF NOT EXISTS snoozed_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mailbox_email VARCHAR(255) NOT NULL,
  folder VARCHAR(255) NOT NULL,
  uid INT NOT NULL,
  wake_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_snoozed_message (mailbox_email, folder, uid),
  INDEX idx_snoozed_wake_at (wake_at)
);

-- Rule definitions backing the real server-side Sieve script generated in
-- lib/api/sieve.ts and installed into Dovecot over ManageSieve
-- (RFC 5804) whenever a mailbox's rules change. Dovecot runs the script at
-- LMTP delivery time from then on -- these rows exist so the UI has
-- somewhere to list/edit/reorder rules; the Sieve script itself is the
-- actual filtering logic, regenerated in full from these rows on every
-- change rather than parsed back out of Sieve.
CREATE TABLE IF NOT EXISTS mail_filters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mailbox_email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  field ENUM('from', 'to', 'subject') NOT NULL,
  -- 'domain' stores a bare domain in `value` (e.g. "spammer.com") and
  -- compiles to a Sieve :matches "*@value" wildcard test, not a plain
  -- substring -- see lib/api/sieve.ts. Whole-domain block/allow entries
  -- from the Allow/Block lists panel use this.
  match_type ENUM('contains', 'equals', 'domain') NOT NULL DEFAULT 'contains',
  value VARCHAR(255) NOT NULL,
  -- 'allow' is the block-list's counterpart: an explicit keep+stop, always
  -- sorted to run before every other action when the script is generated
  -- (see lib/api/sieve.ts) so an allowed sender wins over a block rule
  -- that would otherwise also match it, regardless of row position.
  action ENUM('move', 'delete', 'mark_read', 'star', 'allow') NOT NULL,
  action_folder VARCHAR(255) NULL,
  position INT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mail_filters_mailbox (mailbox_email, position)
);
