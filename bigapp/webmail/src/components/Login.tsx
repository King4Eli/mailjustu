import { useState } from 'react'
import { Mail } from 'lucide-react'
import { login } from '../api'

interface LoginProps {
  onLogin: (email: string, role: 'super' | 'domain' | 'user') => void
}

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // No self-service reset: login here is the real IMAP/mailbox password,
  // not a separate app account, and there's no recovery-email concept in
  // this schema -- only an admin can set a new one (admin dashboard's
  // Mailboxes tab).
  const [showForgot, setShowForgot] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(email.trim(), password)
      onLogin(data.email, data.role)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center" style={{ background: 'var(--bg)' }}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border p-8 shadow-sm"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
      >
        <div className="mb-6 flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
            style={{ background: 'var(--accent)' }}
          >
            <Mail size={18} />
          </div>
          <span className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
            Mailbox
          </span>
        </div>

        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@mail.example.com"
          className="mb-4 w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'transparent' }}
        />

        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Password
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="mb-5 w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'transparent' }}
        />

        {error && (
          <p className="mb-4 text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg py-2.5 text-sm font-medium text-white transition disabled:opacity-60"
          style={{ background: 'var(--accent)' }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <button
          type="button"
          onClick={() => setShowForgot((v) => !v)}
          className="mt-3 w-full text-center text-xs"
          style={{ color: 'var(--text-faint)' }}
        >
          Forgot password?
        </button>
        {showForgot && (
          <p className="mt-2 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            Ask your mail admin to reset it from the admin dashboard's Mailboxes tab.
          </p>
        )}
      </form>
    </div>
  )
}
