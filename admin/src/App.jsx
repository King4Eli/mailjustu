import { useMemo, useState } from 'react'
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
  RefreshCw,
  Search,
  Send,
  Server,
  Settings,
  ShieldCheck,
  ShieldX,
  Users,
  X,
  Zap,
} from 'lucide-react'

const services = [
  { name: 'Postfix', detail: 'SMTP · ports 25, 465, 587', icon: Send, color: 'blue', cpu: '12%', memory: '148 MB', uptime: '12d 8h' },
  { name: 'Dovecot', detail: 'IMAP · ports 143, 993', icon: Inbox, color: 'violet', cpu: '8%', memory: '212 MB', uptime: '12d 8h' },
  { name: 'Rspamd', detail: 'Spam filtering', icon: ShieldCheck, color: 'amber', cpu: '21%', memory: '386 MB', uptime: '12d 8h' },
  { name: 'OpenDKIM', detail: 'DKIM signing', icon: Check, color: 'green', cpu: '2%', memory: '42 MB', uptime: '12d 8h' },
  { name: 'ClamAV', detail: 'Malware scanning', icon: ShieldX, color: 'red', cpu: '16%', memory: '1.1 GB', uptime: '12d 8h' },
  { name: 'MySQL', detail: 'Account metadata', icon: Database, color: 'cyan', cpu: '6%', memory: '322 MB', uptime: '12d 8h' },
  { name: 'Redis', detail: 'Rspamd cache', icon: Zap, color: 'pink', cpu: '3%', memory: '86 MB', uptime: '12d 8h' },
]

const activity = [
  { icon: Send, color: 'blue', title: 'Message delivered', meta: 'alerts@acme.io → jordan@example.com', time: '12 sec ago' },
  { icon: ShieldX, color: 'red', title: 'Spam rejected', meta: 'Score 14.8 · 185.220.101.32', time: '3 min ago' },
  { icon: Users, color: 'violet', title: 'Mailbox created', meta: 'maya@example.com · 5 GB quota', time: '21 min ago' },
  { icon: ShieldCheck, color: 'green', title: 'DKIM key rotated', meta: 'example.com · selector mail2026', time: '2 hr ago' },
]

const mailFlow = [42, 51, 47, 68, 59, 76, 72, 95, 87, 112, 102, 124, 113, 136, 129, 154, 143, 168, 158, 181, 176, 194, 186, 210]

const config = {
  title: import.meta.env.VITE_ADMIN_TITLE || 'Postmaster',
  mailHost: import.meta.env.VITE_MAIL_HOST || 'mail.example.com',
  demoMode: import.meta.env.VITE_DEMO_MODE !== 'false',
}

function Sparkline() {
  const points = mailFlow.map((value, index) => `${(index / (mailFlow.length - 1)) * 100},${52 - ((value - 40) / 170) * 44}`).join(' ')
  return (
    <svg className="sparkline" viewBox="0 0 100 56" preserveAspectRatio="none" aria-label="Mail traffic over the last 24 hours">
      <defs>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6657e8" stopOpacity=".24" />
          <stop offset="100%" stopColor="#6657e8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,56 ${points} 100,56`} fill="url(#area)" />
      <polyline points={points} fill="none" stroke="#6657e8" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <circle cx="100" cy={52 - ((mailFlow.at(-1) - 40) / 170) * 44} r="1.7" fill="#6657e8" />
    </svg>
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

function StatCard({ icon: Icon, label, value, change, tone, note }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={20} /></div>
      <div className="stat-label">{label}</div>
      <div className="stat-row">
        <strong>{value}</strong>
        {change && <span className={`change ${change.startsWith('+') ? 'up' : 'neutral'}`}>{change}</span>}
      </div>
      <div className="stat-note">{note}</div>
    </article>
  )
}

function App() {
  const [active, setActive] = useState('Overview')
  const [query, setQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [lastUpdated, setLastUpdated] = useState('just now')

  const filteredServices = useMemo(() => services.filter(service => service.name.toLowerCase().includes(query.toLowerCase())), [query])

  function refresh() {
    setLastUpdated('just now')
    setNotice('Dashboard data refreshed')
    window.setTimeout(() => setNotice(''), 2200)
  }

  function navigate(label) {
    setActive(label)
    setSidebarOpen(false)
    if (label !== 'Overview') {
      setNotice(`${label} view is ready to connect to your backend API`)
      window.setTimeout(() => setNotice(''), 2600)
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Mail size={20} /></div><span>{config.title}</span></div>
        <button className="close-sidebar" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X /></button>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          <NavItem icon={LayoutDashboard} label="Overview" active={active === 'Overview'} onClick={() => navigate('Overview')} />
          <NavItem icon={Activity} label="Mail activity" active={active === 'Mail activity'} onClick={() => navigate('Mail activity')} />
          <NavItem icon={Inbox} label="Mail queue" count="18" active={active === 'Mail queue'} onClick={() => navigate('Mail queue')} />
          <NavItem icon={Users} label="Mailboxes" active={active === 'Mailboxes'} onClick={() => navigate('Mailboxes')} />
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
          <div className="search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search services…" /><kbd>⌘ K</kbd></div>
          <div className="top-actions">
            {config.demoMode && <span className="demo-pill">DEMO DATA</span>}
            <button className="icon-button" aria-label="Notifications"><Bell size={19} /><i /></button>
            <button className="server-select"><span className="status-dot" /> {config.mailHost} <ChevronDown size={15} /></button>
          </div>
        </header>

        <div className="content">
          <section className="page-heading">
            <div><p className="eyebrow">MAIL SERVER</p><h1>{active}</h1><p>Monitor your mail infrastructure and delivery health.</p></div>
            <button className="refresh" onClick={refresh}><RefreshCw size={16} /> Refresh</button>
          </section>

          <div className="health-banner">
            <div className="health-check"><Check size={19} /></div>
            <div><strong>All systems operational</strong><span>7 of 7 services are healthy</span></div>
            <div className="updated"><Clock3 size={15} /> Updated {lastUpdated}</div>
          </div>

          <section className="stats-grid">
            <StatCard icon={Send} label="Messages today" value="24,892" change="+12.4%" tone="blue" note="vs. 22,143 yesterday" />
            <StatCard icon={Inbox} label="Queued messages" value="18" change="–3" tone="violet" note="oldest is 4 minutes" />
            <StatCard icon={ShieldX} label="Spam blocked" value="3,201" change="+4.7%" tone="amber" note="12.9% of inbound mail" />
            <StatCard icon={Activity} label="Delivery rate" value="99.84%" change="+0.02%" tone="green" note="past 24 hours" />
          </section>

          <section className="dashboard-grid">
            <article className="panel traffic-panel">
              <div className="panel-head">
                <div><h2>Mail traffic</h2><p>Messages processed over the last 24 hours</p></div>
                <button className="period">Last 24 hours <ChevronDown size={14} /></button>
              </div>
              <div className="traffic-summary"><strong>24,892</strong><span><i /> Inbound 17,420</span><span><i className="outbound" /> Outbound 7,472</span></div>
              <div className="chart-wrap">
                <div className="axis"><span>1,200</span><span>900</span><span>600</span><span>300</span><span>0</span></div>
                <div className="grid-lines"><i /><i /><i /><i /><i /></div>
                <Sparkline />
                <div className="x-axis"><span>12am</span><span>4am</span><span>8am</span><span>12pm</span><span>4pm</span><span>8pm</span><span>Now</span></div>
              </div>
            </article>

            <article className="panel activity-panel">
              <div className="panel-head"><div><h2>Recent activity</h2><p>Latest server events</p></div><button className="text-button">View all</button></div>
              <div className="activity-list">
                {activity.map(item => {
                  const Icon = item.icon
                  return <div className="activity-item" key={item.title + item.time}><div className={`activity-icon ${item.color}`}><Icon size={16} /></div><div><strong>{item.title}</strong><span>{item.meta}</span></div><time>{item.time}</time></div>
                })}
              </div>
            </article>
          </section>

          <section className="panel services-panel">
            <div className="panel-head"><div><h2>Services</h2><p>Health and resource usage for your containers</p></div><button className="text-button">Manage services <ChevronRight size={15} /></button></div>
            <div className="service-table">
              <div className="service-row table-head"><span>SERVICE</span><span>STATUS</span><span>CPU</span><span>MEMORY</span><span>UPTIME</span><span /></div>
              {filteredServices.map(service => {
                const Icon = service.icon
                return (
                  <div className="service-row" key={service.name}>
                    <div className="service-name"><div className={`service-icon ${service.color}`}><Icon size={17} /></div><div><strong>{service.name}</strong><span>{service.detail}</span></div></div>
                    <span className="healthy"><i /> Healthy</span>
                    <span>{service.cpu}</span><span>{service.memory}</span><span>{service.uptime}</span>
                    <button className="row-menu" aria-label={`${service.name} actions`}><Ellipsis size={18} /></button>
                  </div>
                )
              })}
              {filteredServices.length === 0 && <div className="empty">No services match "{query}".</div>}
            </div>
          </section>
        </div>
      </main>
      {notice && <div className="toast"><Check size={16} /> {notice}</div>}
    </div>
  )
}

export default App
