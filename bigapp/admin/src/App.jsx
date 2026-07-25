import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Check,
  Clock3,
  Copy,
  Database,
  Globe,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  ShieldCheck,
  ShieldX,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react'
import * as api from './api'

const ICONS = {
  Postfix: Send,
  Dovecot: Inbox,
  Rspamd: ShieldCheck,
  OpenDKIM: Check,
  ClamAV: ShieldX,
  MySQL: Database,
  Redis: Zap,
}
const COLORS = {
  Postfix: 'blue',
  Dovecot: 'violet',
  Rspamd: 'amber',
  OpenDKIM: 'green',
  ClamAV: 'red',
  MySQL: 'cyan',
  Redis: 'pink',
}

import { config } from './config'

function formatBytes(bytes) {
  if (bytes == null) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StorageUsage({ usedBytes, quotaMb }) {
  if (usedBytes == null) return <span style={{ color: '#9aa1b2' }}>—</span>
  const quotaBytes = (quotaMb ?? 1024) * 1024 * 1024
  const pct = Math.min(100, (usedBytes / quotaBytes) * 100)
  return (
    <div className="storage-usage">
      <span>
        {formatBytes(usedBytes)} of {quotaMb ?? 1024} MB
      </span>
      <div className="storage-bar">
        <div className="storage-bar-fill" style={{ width: `${pct}%`, background: pct > 90 ? '#d3352f' : '#5b4cd9' }} />
      </div>
    </div>
  )
}

function NavItem({ icon: Icon, label, count, active, onClick }) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon size={18} />
      <span>{label}</span>
      {count && <span className="nav-count">{count}</span>}
    </button>
  )
}

function StatCard({ icon: Icon, label, value, tone, note }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={20} /></div>
      <div className="stat-label">{label}</div>
      <div className="stat-row">
        <strong>{value}</strong>
      </div>
      <div className="stat-note">{note}</div>
    </article>
  )
}

function Login({ onAuthorized }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const session = await api.login(email.trim(), password)
      onAuthorized(session)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="token-gate">
      <form onSubmit={handleSubmit} className="token-gate-card">
        <div className="brand" style={{ padding: 0, marginBottom: 20 }}>
          <div className="brand-mark"><Mail size={20} /></div>
          <span>{config.title}</span>
        </div>
        <label className="token-label">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@mail.example.com"
          className="token-input"
          autoFocus
          required
        />
        <label className="token-label">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="token-input"
          required
        />
        {error && <p className="token-error">{error}</p>}
        <button type="submit" className="refresh" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="token-hint">
          Needs a mailbox that's either listed in SUPER_ADMIN_EMAILS or has is_admin set for its domain.
        </p>
      </form>
    </div>
  )
}

function ConfirmDeleteModal({ title, message, confirmText, onConfirm, onCancel }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const matches = input.trim() === confirmText

  async function handleConfirm() {
    if (!matches || busy) return
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon danger"><AlertTriangle size={20} /></div>
        <h3>{title}</h3>
        <p>{message}</p>
        <label className="token-label">
          Type <strong>{confirmText}</strong> to confirm
        </label>
        <input
          className="token-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={confirmText}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
        />
        {error && <p className="token-error">{error}</p>}
        <div className="modal-actions">
          <button className="modal-cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="modal-danger-confirm" onClick={handleConfirm} disabled={!matches || busy}>
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MailboxesPanel({ mailboxes, isSuper, onCreate, onDelete, onSetAdmin, onResetPassword }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await onCreate(email.trim(), password, isAdmin)
      setEmail('')
      setPassword('')
      setIsAdmin(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel services-panel">
      <div className="panel-head">
        <div><h2>Mailboxes</h2><p>Create and remove virtual mail accounts</p></div>
      </div>

      <form onSubmit={handleCreate} className="mailbox-form">
        <input
          type="email"
          required
          placeholder="user@mail.example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {isSuper && (
          <label className="admin-checkbox">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            Domain admin
          </label>
        )}
        <button type="submit" className="refresh" disabled={busy}>
          <Plus size={16} /> {busy ? 'Creating…' : 'Create mailbox'}
        </button>
      </form>
      {error && <p className="token-error">{error}</p>}

      <div className="service-table" style={{ marginTop: 20 }}>
        <div className="service-row table-head" style={{ gridTemplateColumns: isSuper ? '1.6fr .8fr 1.2fr .8fr 32px 32px' : '1.6fr .8fr 1.2fr 32px 32px' }}>
          <span>EMAIL</span><span>CREATED</span><span>STORAGE</span>{isSuper && <span>ADMIN</span>}<span /><span />
        </div>
        {mailboxes.map((mailbox) => (
          <div className="service-row" key={mailbox.id} style={{ gridTemplateColumns: isSuper ? '1.6fr .8fr 1.2fr .8fr 32px 32px' : '1.6fr .8fr 1.2fr 32px 32px' }}>
            <span>{mailbox.email}</span>
            <span>{new Date(mailbox.created_at).toLocaleDateString()}</span>
            <StorageUsage usedBytes={mailbox.storageUsedBytes} quotaMb={mailbox.quota_mb} />
            {isSuper && (
              <button
                className={mailbox.is_admin ? 'admin-badge on' : 'admin-badge'}
                onClick={() => onSetAdmin(mailbox.id, !mailbox.is_admin)}
                title={mailbox.is_admin ? 'Revoke domain admin' : 'Grant domain admin'}
              >
                {mailbox.is_admin ? 'Admin' : '—'}
              </button>
            )}
            <button
              className="row-menu"
              onClick={() => onResetPassword(mailbox.id, mailbox.email)}
              aria-label={`Reset password for ${mailbox.email}`}
              title="Reset password"
            >
              <KeyRound size={16} />
            </button>
            <button className="row-menu" onClick={() => setPendingDelete(mailbox)} aria-label={`Delete ${mailbox.email}`}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {mailboxes.length === 0 && <div className="empty">No mailboxes yet — create one above.</div>}
      </div>

      {pendingDelete && (
        <ConfirmDeleteModal
          title="Delete mailbox?"
          message={`This permanently deletes ${pendingDelete.email} and everything in it -- every folder, message, and attachment. This can't be undone.`}
          confirmText={pendingDelete.email}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await onDelete(pendingDelete.id)
            setPendingDelete(null)
          }}
        />
      )}
    </section>
  )
}

function DnsRecords({ records }) {
  function copyAll() {
    navigator.clipboard?.writeText(records.map((r) => `${r.type}\t${r.name}\t${r.value}`).join('\n'))
  }
  return (
    <div className="dns-records">
      <div className="dns-records-head">
        <span>DNS records to add at your registrar</span>
        <button className="text-button" onClick={copyAll}><Copy size={13} /> Copy all</button>
      </div>
      {records.map((r) => (
        <div className="dns-record" key={r.type + r.name}>
          <div className="dns-record-main">
            <span className="dns-type">{r.type}</span>
            <code>{r.name}</code>
            <code className="dns-value">{r.value}</code>
            <button
              className="row-menu"
              onClick={() => navigator.clipboard?.writeText(`${r.type}\t${r.name}\t${r.value}`)}
              aria-label={`Copy ${r.type} record`}
            >
              <Copy size={14} />
            </button>
          </div>
          <p className="dns-purpose">{r.purpose}</p>
        </div>
      ))}
    </div>
  )
}

function DomainsPanel({ domains, defaults, isSuper, onCreate, onDelete }) {
  const [name, setName] = useState('')
  const [maxMailboxes, setMaxMailboxes] = useState('')
  const [maxAliases, setMaxAliases] = useState('')
  const [quotaMb, setQuotaMb] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await onCreate(name.trim(), maxMailboxes, maxAliases, quotaMb)
      setName('')
      setMaxMailboxes('')
      setMaxAliases('')
      setQuotaMb('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel services-panel">
      <div className="panel-head">
        <div><h2>Domains</h2><p>Domains this server accepts mail for, with per-domain mailbox/alias/storage limits</p></div>
      </div>

      {isSuper && (
        <form onSubmit={handleCreate} className="mailbox-form">
          <input type="text" required placeholder="newdomain.com" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            type="number"
            min="0"
            placeholder={`Max mailboxes (default ${defaults?.maxMailboxesPerDomain ?? '∞'})`}
            value={maxMailboxes}
            onChange={(e) => setMaxMailboxes(e.target.value)}
            style={{ maxWidth: 190 }}
          />
          <input
            type="number"
            min="0"
            placeholder={`Max aliases/mailbox (default ${defaults?.maxAliasesPerMailbox ?? '∞'})`}
            value={maxAliases}
            onChange={(e) => setMaxAliases(e.target.value)}
            style={{ maxWidth: 190 }}
          />
          <input
            type="number"
            min="0"
            placeholder={`Quota MB/mailbox (default ${defaults?.quotaMb ?? '∞'})`}
            value={quotaMb}
            onChange={(e) => setQuotaMb(e.target.value)}
            style={{ maxWidth: 190 }}
          />
          <button type="submit" className="refresh" disabled={busy}>
            <Plus size={16} /> {busy ? 'Adding…' : 'Add domain'}
          </button>
        </form>
      )}
      {error && <p className="token-error">{error}</p>}

      <div className="service-table" style={{ marginTop: 20 }}>
        <div className="service-row table-head" style={{ gridTemplateColumns: '1.3fr .6fr .8fr .8fr .8fr 32px' }}>
          <span>DOMAIN</span><span>MAILBOXES</span><span>MAILBOX LIMIT</span><span>ALIAS LIMIT</span><span>QUOTA</span><span />
        </div>
        {domains.map((domain) => (
          <div key={domain.id}>
            <div
              className="service-row"
              style={{ gridTemplateColumns: '1.3fr .6fr .8fr .8fr .8fr 32px', cursor: 'pointer' }}
              onClick={() => setExpanded(expanded === domain.id ? null : domain.id)}
            >
              <span>{domain.name}</span>
              <span>{domain.mailboxCount}</span>
              <span>{domain.max_mailboxes ?? `default (${defaults?.maxMailboxesPerDomain ?? '∞'})`}</span>
              <span>{domain.max_aliases_per_mailbox ?? `default (${defaults?.maxAliasesPerMailbox ?? '∞'})`}</span>
              <span>{domain.quota_mb ? `${domain.quota_mb} MB` : `default (${defaults?.quotaMb ?? '∞'})`}</span>
              {isSuper ? (
                <button
                  className="row-menu"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPendingDelete(domain)
                  }}
                  aria-label={`Delete ${domain.name}`}
                >
                  <Trash2 size={16} />
                </button>
              ) : (
                <span />
              )}
            </div>
            {expanded === domain.id && <DnsRecords records={domain.dnsRecords} />}
          </div>
        ))}
        {domains.length === 0 && <div className="empty">No domains yet.</div>}
      </div>

      {pendingDelete && (
        <ConfirmDeleteModal
          title="Delete domain?"
          message={`This permanently deletes ${pendingDelete.name} and every mailbox and alias on it (${pendingDelete.mailboxCount} mailbox${pendingDelete.mailboxCount === 1 ? '' : 'es'}). This can't be undone.`}
          confirmText={pendingDelete.name}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await onDelete(pendingDelete.id)
            setPendingDelete(null)
          }}
        />
      )}
    </section>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [active, setActive] = useState('Overview')
  const [query, setQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')
  const [health, setHealth] = useState(null)
  const [stats, setStats] = useState(null)
  const [mailboxes, setMailboxes] = useState([])
  const [domains, setDomains] = useState([])
  const [domainDefaults, setDomainDefaults] = useState(null)
  const [loadError, setLoadError] = useState('')

  const isSuper = session?.role === 'super'

  useEffect(() => {
    const stored = api.getStoredSession()
    if (stored) setSession(stored)
    setCheckingSession(false)
  }, [])

  async function refresh() {
    setLoadError('')
    try {
      const [mailboxData, domainData] = await Promise.all([api.getMailboxes(), api.getDomains()])
      setMailboxes(mailboxData.mailboxes)
      setDomains(domainData.domains)
      setDomainDefaults(domainData.defaults)
      if (isSuper) {
        const [healthData, statsData] = await Promise.all([api.getHealth(), api.getStats()])
        setHealth(healthData)
        setStats(statsData)
      }
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err) {
      setLoadError(err.message)
    }
  }

  useEffect(() => {
    if (session) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const filteredServices = useMemo(
    () => (health?.services || []).filter((service) => service.name.toLowerCase().includes(query.toLowerCase())),
    [health, query],
  )

  function navigate(label) {
    setActive(label)
    setSidebarOpen(false)
  }

  async function handleCreateMailbox(email, password, isAdmin) {
    await api.createMailbox(email, password, isAdmin)
    await refresh()
  }

  async function handleSetMailboxAdmin(id, value) {
    await api.setMailboxAdmin(id, value)
    await refresh()
  }

  async function handleResetMailboxPassword(id, email) {
    const password = window.prompt(`New password for ${email}:`)
    if (!password) return
    await api.resetMailboxPassword(id, password)
  }

  async function handleDeleteMailbox(id) {
    await api.deleteMailbox(id)
    await refresh()
  }

  async function handleCreateDomain(name, maxMailboxes, maxAliasesPerMailbox, quotaMb) {
    await api.createDomain(name, maxMailboxes, maxAliasesPerMailbox, quotaMb)
    await refresh()
  }

  async function handleDeleteDomain(id) {
    await api.deleteDomain(id)
    await refresh()
  }

  async function handleLogout() {
    await api.logout()
    setSession(null)
    setHealth(null)
    setStats(null)
    setMailboxes([])
    setDomains([])
  }

  if (checkingSession) return null
  if (!session) return <Login onAuthorized={setSession} />

  const allHealthy = health && health.summary.requiredHealthy === health.summary.requiredTotal

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Mail size={20} /></div><span>{config.title}</span></div>
        <button className="close-sidebar" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X /></button>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          <NavItem icon={LayoutDashboard} label="Overview" active={active === 'Overview'} onClick={() => navigate('Overview')} />
          <NavItem icon={Users} label="Mailboxes" count={mailboxes.length || null} active={active === 'Mailboxes'} onClick={() => navigate('Mailboxes')} />
          <NavItem icon={Globe} label="Domains" count={domains.length || null} active={active === 'Domains'} onClick={() => navigate('Domains')} />
        </nav>
        {isSuper && (
          <>
            <div className="workspace-label secondary">SYSTEM</div>
            <nav>
              <NavItem icon={Server} label="Services" active={active === 'Services'} onClick={() => navigate('Services')} />
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">{session.email.slice(0, 2).toUpperCase()}</div>
            <div><strong>{session.email}</strong><span>{isSuper ? 'Super admin' : `Admin · ${session.domain}`}</span></div>
            <button onClick={handleLogout} title="Sign out" aria-label="Sign out" className="logout-button">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}

      <main>
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)}><Menu /></button>
          <div className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search services…" /></div>
          {isSuper && (
            <div className="top-actions">
              <span className="server-select"><span className={`status-dot ${allHealthy ? '' : 'down'}`} /> {config.mailHost}</span>
            </div>
          )}
        </header>

        <div className="content">
          <section className="page-heading">
            <div><p className="eyebrow">MAIL SERVER</p><h1>{active}</h1><p>Monitor your mail infrastructure and delivery health.</p></div>
            <button className="refresh" onClick={refresh}><RefreshCw size={16} /> Refresh</button>
          </section>

          {loadError && (
            <div className="health-banner" style={{ background: '#fde7e7', borderColor: '#f3c9c9' }}>
              <div className="health-check" style={{ background: '#d3352f' }}><X size={19} /></div>
              <div><strong>Couldn't reach the API</strong><span>{loadError}</span></div>
            </div>
          )}

          {isSuper && health && !loadError && (
            <div className="health-banner" style={allHealthy ? undefined : { background: '#fef3d9', borderColor: '#f7e2ad' }}>
              <div className="health-check" style={allHealthy ? undefined : { background: '#b3790a' }}>
                <Check size={19} />
              </div>
              <div>
                <strong>{allHealthy ? 'All systems operational' : 'Some required services are down'}</strong>
                <span>{health.summary.requiredHealthy} of {health.summary.requiredTotal} required services healthy · {health.summary.healthy} of {health.summary.total} total</span>
              </div>
              <div className="updated"><Clock3 size={15} /> Updated {lastUpdated}</div>
            </div>
          )}

          {isSuper && (active === 'Overview' || active === 'Services') && (
            <>
              <section className="stats-grid">
                <StatCard icon={Users} label="Mailboxes" value={stats?.mailboxCount ?? '—'} tone="blue" note={`${stats?.domainCount ?? 0} domain(s)`} />
                <StatCard icon={Activity} label="Messages scanned" value={stats?.rspamd?.scanned ?? '—'} tone="violet" note={stats?.rspamdAvailable ? 'via Rspamd' : 'Rspamd not running'} />
                <StatCard icon={ShieldX} label="Spam rejected" value={stats?.rspamd?.actions?.reject ?? '—'} tone="amber" note={stats?.rspamdAvailable ? 'via Rspamd' : 'Rspamd not running'} />
                <StatCard icon={ShieldCheck} label="No action (clean)" value={stats?.rspamd?.actions?.['no action'] ?? '—'} tone="green" note={stats?.rspamdAvailable ? 'via Rspamd' : 'Rspamd not running'} />
              </section>

              <section className="panel services-panel">
                <div className="panel-head"><div><h2>Services</h2><p>Live TCP health check against each container</p></div></div>
                <div className="service-table">
                  <div className="service-row table-head" style={{ gridTemplateColumns: '2fr .9fr .8fr' }}><span>SERVICE</span><span>STATUS</span><span>LATENCY</span></div>
                  {filteredServices.map((service) => {
                    const Icon = ICONS[service.name] || Server
                    const color = COLORS[service.name] || 'blue'
                    return (
                      <div className="service-row" key={service.name} style={{ gridTemplateColumns: '2fr .9fr .8fr' }}>
                        <div className="service-name"><div className={`service-icon ${color}`}><Icon size={17} /></div><div><strong>{service.name}</strong><span>{service.detail}</span></div></div>
                        <span className={service.status === 'healthy' ? 'healthy' : 'unhealthy'}>
                          <i /> {service.status === 'healthy' ? 'Healthy' : service.status === 'not running' ? 'Not running' : 'Down'}
                        </span>
                        <span>{service.latencyMs != null ? `${service.latencyMs} ms` : '—'}</span>
                      </div>
                    )
                  })}
                  {filteredServices.length === 0 && <div className="empty">No services match "{query}".</div>}
                </div>
              </section>
            </>
          )}

          {!isSuper && active === 'Overview' && (
            <section className="panel services-panel">
              <div className="panel-head"><div><h2>Your domain</h2><p>{session.domain}</p></div></div>
              <div className="stats-grid">
                <StatCard icon={Users} label="Mailboxes" value={mailboxes.length} tone="blue" note={session.domain} />
                <StatCard icon={Globe} label="Aliases" value={domains[0]?.aliasCount ?? '—'} tone="violet" note={session.domain} />
              </div>
            </section>
          )}

          {active === 'Mailboxes' && (
            <MailboxesPanel
              mailboxes={mailboxes}
              isSuper={isSuper}
              onCreate={handleCreateMailbox}
              onDelete={handleDeleteMailbox}
              onSetAdmin={handleSetMailboxAdmin}
              onResetPassword={handleResetMailboxPassword}
            />
          )}

          {active === 'Domains' && (
            <DomainsPanel domains={domains} defaults={domainDefaults} isSuper={isSuper} onCreate={handleCreateDomain} onDelete={handleDeleteDomain} />
          )}
        </div>
      </main>
    </div>
  )
}

export default App
