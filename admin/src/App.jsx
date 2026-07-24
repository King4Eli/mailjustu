import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Ellipsis,
  Inbox,
  LayoutDashboard,
  Mail,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings,
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

const config = {
  title: import.meta.env.VITE_ADMIN_TITLE || 'Postmaster',
  mailHost: import.meta.env.VITE_MAIL_HOST || 'mail.example.com',
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

function TokenGate({ onAuthorized }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    api.setStoredToken(token.trim())
    try {
      await api.getHealth()
      onAuthorized()
    } catch {
      api.clearStoredToken()
      setError('That token was rejected. Check ../.env/api.env ADMIN_TOKEN.')
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
        <label className="token-label">Admin token</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ADMIN_TOKEN from .env/api.env"
          className="token-input"
          autoFocus
        />
        {error && <p className="token-error">{error}</p>}
        <button type="submit" className="refresh" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
          {loading ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}

function MailboxesPanel({ mailboxes, onCreate, onDelete }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await onCreate(email.trim(), password)
      setEmail('')
      setPassword('')
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
        <button type="submit" className="refresh" disabled={busy}>
          <Plus size={16} /> {busy ? 'Creating…' : 'Create mailbox'}
        </button>
      </form>
      {error && <p className="token-error">{error}</p>}

      <div className="service-table" style={{ marginTop: 20 }}>
        <div className="service-row table-head"><span>EMAIL</span><span>CREATED</span><span /></div>
        {mailboxes.map((mailbox) => (
          <div className="service-row" key={mailbox.id} style={{ gridTemplateColumns: '2fr 1fr 32px' }}>
            <span>{mailbox.email}</span>
            <span>{new Date(mailbox.created_at).toLocaleDateString()}</span>
            <button className="row-menu" onClick={() => onDelete(mailbox.id)} aria-label={`Delete ${mailbox.email}`}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {mailboxes.length === 0 && <div className="empty">No mailboxes yet — create one above.</div>}
      </div>
    </section>
  )
}

function App() {
  const [authorized, setAuthorized] = useState(false)
  const [checkingToken, setCheckingToken] = useState(true)
  const [active, setActive] = useState('Overview')
  const [query, setQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [health, setHealth] = useState(null)
  const [stats, setStats] = useState(null)
  const [mailboxes, setMailboxes] = useState([])
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!api.getStoredToken()) {
      setCheckingToken(false)
      return
    }
    api
      .getHealth()
      .then(() => setAuthorized(true))
      .catch(() => api.clearStoredToken())
      .finally(() => setCheckingToken(false))
  }, [])

  async function refresh() {
    setLoadError('')
    try {
      const [healthData, statsData, mailboxData] = await Promise.all([api.getHealth(), api.getStats(), api.getMailboxes()])
      setHealth(healthData)
      setStats(statsData)
      setMailboxes(mailboxData.mailboxes)
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err) {
      setLoadError(err.message)
    }
  }

  useEffect(() => {
    if (authorized) refresh()
  }, [authorized])

  const filteredServices = useMemo(
    () => (health?.services || []).filter((service) => service.name.toLowerCase().includes(query.toLowerCase())),
    [health, query],
  )

  function navigate(label) {
    setActive(label)
    setSidebarOpen(false)
    if (!['Overview', 'Services', 'Mailboxes'].includes(label)) {
      setNotice(`${label} view is ready to connect to your backend API`)
      window.setTimeout(() => setNotice(''), 2600)
    }
  }

  async function handleCreateMailbox(email, password) {
    await api.createMailbox(email, password)
    await refresh()
  }

  async function handleDeleteMailbox(id) {
    await api.deleteMailbox(id)
    await refresh()
  }

  if (checkingToken) return null
  if (!authorized) return <TokenGate onAuthorized={() => setAuthorized(true)} />

  const allHealthy = health && health.summary.requiredHealthy === health.summary.requiredTotal

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Mail size={20} /></div><span>{config.title}</span></div>
        <button className="close-sidebar" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X /></button>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          <NavItem icon={LayoutDashboard} label="Overview" active={active === 'Overview'} onClick={() => navigate('Overview')} />
          <NavItem icon={Activity} label="Mail activity" active={active === 'Mail activity'} onClick={() => navigate('Mail activity')} />
          <NavItem icon={Inbox} label="Mail queue" active={active === 'Mail queue'} onClick={() => navigate('Mail queue')} />
          <NavItem icon={Users} label="Mailboxes" count={mailboxes.length || null} active={active === 'Mailboxes'} onClick={() => navigate('Mailboxes')} />
          <NavItem icon={ShieldCheck} label="Security" active={active === 'Security'} onClick={() => navigate('Security')} />
        </nav>
        <div className="workspace-label secondary">SYSTEM</div>
        <nav>
          <NavItem icon={Server} label="Services" active={active === 'Services'} onClick={() => navigate('Services')} />
          <NavItem icon={Database} label="Storage" active={active === 'Storage'} onClick={() => navigate('Storage')} />
          <NavItem icon={Settings} label="Settings" active={active === 'Settings'} onClick={() => navigate('Settings')} />
        </nav>
        <div className="sidebar-bottom">
          <button className="help-link"><CircleHelp size={17} /> Documentation <ChevronRight size={15} /></button>
          <div className="profile">
            <div className="avatar">AK</div>
            <div><strong>Alex Kim</strong><span>Administrator</span></div>
            <Ellipsis size={18} />
          </div>
        </div>
      </aside>

      {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}

      <main>
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)}><Menu /></button>
          <div className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search services…" /><kbd>⌘ K</kbd></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Notifications"><Bell size={19} /><i /></button>
            <button className="server-select"><span className={`status-dot ${allHealthy ? '' : 'down'}`} /> {config.mailHost} <ChevronDown size={15} /></button>
          </div>
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

          {health && !loadError && (
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

          {(active === 'Overview' || active === 'Services') && (
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
                  <div className="service-row table-head"><span>SERVICE</span><span>STATUS</span><span>LATENCY</span><span /><span /><span /></div>
                  {filteredServices.map((service) => {
                    const Icon = ICONS[service.name] || Server
                    const color = COLORS[service.name] || 'blue'
                    return (
                      <div className="service-row" key={service.name}>
                        <div className="service-name"><div className={`service-icon ${color}`}><Icon size={17} /></div><div><strong>{service.name}</strong><span>{service.detail}</span></div></div>
                        <span className={service.status === 'healthy' ? 'healthy' : 'unhealthy'}>
                          <i /> {service.status === 'healthy' ? 'Healthy' : service.status === 'not running' ? 'Not running' : 'Down'}
                        </span>
                        <span>{service.latencyMs != null ? `${service.latencyMs} ms` : '—'}</span>
                        <span /><span />
                        <button className="row-menu" aria-label={`${service.name} actions`}><Ellipsis size={18} /></button>
                      </div>
                    )
                  })}
                  {filteredServices.length === 0 && <div className="empty">No services match "{query}".</div>}
                </div>
              </section>
            </>
          )}

          {active === 'Mailboxes' && (
            <MailboxesPanel mailboxes={mailboxes} onCreate={handleCreateMailbox} onDelete={handleDeleteMailbox} />
          )}
        </div>
      </main>
      {notice && <div className="toast"><Check size={16} /> {notice}</div>}
    </div>
  )
}

export default App
