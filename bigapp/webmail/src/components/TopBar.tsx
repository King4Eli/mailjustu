import { useEffect, useRef, useState } from 'react'
import { Search, Sun, Moon, Menu, X, ShieldCheck, LogOut, ChevronDown } from 'lucide-react'
import { initials, avatarColor } from '../utils'

interface TopBarProps {
  query: string
  onQueryChange: (value: string) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onToggleSidebar: () => void
  email: string
  adminUrl?: string
  onLogout: () => void
}

export function TopBar({
  query,
  onQueryChange,
  theme,
  onToggleTheme,
  onToggleSidebar,
  email,
  adminUrl,
  onLogout,
}: TopBarProps) {
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profileOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [profileOpen])

  return (
    <header
      className="flex items-center gap-3 border-b px-4 py-3 md:px-6"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
    >
      <button
        onClick={onToggleSidebar}
        className="rounded-lg p-2 md:hidden"
        style={{ color: 'var(--text-muted)' }}
      >
        <Menu size={20} />
      </button>

      <div className="relative flex-1">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-faint)' }}
        />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search mail"
          className="w-full rounded-xl border-none py-2 pl-9 pr-9 text-sm outline-none"
          style={{ background: 'var(--bg-hover)', color: 'var(--text)' }}
        />
        {query && (
          <button
            onClick={() => onQueryChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5"
            style={{ color: 'var(--text-faint)' }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <button
        onClick={onToggleTheme}
        className="shrink-0 rounded-lg p-2 transition"
        style={{ color: 'var(--text-muted)', background: 'transparent' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        title="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="relative shrink-0" ref={profileRef}>
        <button
          onClick={() => setProfileOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-full p-1 pr-2 transition"
          style={{ background: profileOpen ? 'var(--bg-hover)' : 'transparent' }}
          onMouseEnter={(e) => {
            if (!profileOpen) e.currentTarget.style.background = 'var(--bg-hover)'
          }}
          onMouseLeave={(e) => {
            if (!profileOpen) e.currentTarget.style.background = 'transparent'
          }}
          title={email}
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: avatarColor(email) }}
          >
            {initials(email)}
          </div>
          <ChevronDown size={14} style={{ color: 'var(--text-faint)' }} />
        </button>

        {profileOpen && (
          <div
            className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border py-1 shadow-lg"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
          >
            <div className="truncate border-b px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-faint)' }}>
              {email}
            </div>
            {adminUrl && (
              <a
                href={adminUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 px-3 py-2 text-sm transition"
                style={{ color: 'var(--accent)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => setProfileOpen(false)}
              >
                <ShieldCheck size={16} />
                Open admin dashboard
              </a>
            )}
            <button
              onClick={() => {
                setProfileOpen(false)
                onLogout()
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition"
              style={{ color: 'var(--text)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
