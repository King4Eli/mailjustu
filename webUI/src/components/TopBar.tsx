import { Search, Sun, Moon, Menu, X } from 'lucide-react'

interface TopBarProps {
  query: string
  onQueryChange: (value: string) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onToggleSidebar: () => void
}

export function TopBar({ query, onQueryChange, theme, onToggleTheme, onToggleSidebar }: TopBarProps) {
  return (
    <header
      className="flex items-center gap-3 border-b px-4 py-3"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
    >
      <button
        onClick={onToggleSidebar}
        className="rounded-lg p-2 md:hidden"
        style={{ color: 'var(--text-muted)' }}
      >
        <Menu size={20} />
      </button>

      <div className="relative flex-1 max-w-xl">
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
        className="rounded-lg p-2 transition"
        style={{ color: 'var(--text-muted)', background: 'transparent' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        title="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div
        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{ background: 'var(--accent)' }}
      >
        JD
      </div>
    </header>
  )
}
