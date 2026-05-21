'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Crosshair, Eye, EyeOff } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed: 'Acesso não permitido. Use um email @porttus.com ou @trustsis.com.',
  invalid_state: 'Sessão expirada. Tente novamente.',
  token_exchange_failed: 'Falha na autenticação Microsoft. Tente novamente.',
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('admin@rift.local')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, setToken } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Handle SSO callback: /login?token=JWT or /login?error=...
  useEffect(() => {
    const token = searchParams.get('token')
    const ssoError = searchParams.get('error')
    if (token) {
      setToken(token)
      router.replace('/dashboard')
    } else if (ssoError) {
      setError(ERROR_MESSAGES[ssoError] || `Erro SSO: ${ssoError}`)
    }
  }, [searchParams, router, setToken])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      router.replace('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.6rem 0.75rem',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', fontSize: 14,
    outline: 'none', fontFamily: 'inherit',
  }

  return (
    <main style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg)',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '2.5rem', width: '100%', maxWidth: 380,
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
            <Crosshair size={28} color="var(--purple)" />
            <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--purple-light)' }}>Rift</span>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>AI Pentest Platform</div>
        </div>

        {/* Microsoft SSO button */}
        <a href="/api/auth/microsoft" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          width: '100%', padding: '0.65rem',
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 6, color: 'var(--text)', fontSize: 14, fontWeight: 500,
          textDecoration: 'none', marginBottom: '1.25rem', transition: 'border-color .15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#60a5fa')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <MicrosoftIcon />
          Entrar com Microsoft
        </a>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.25rem' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>ou acesso local</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ color: 'var(--muted)', fontSize: 12, display: 'block', marginBottom: 4 }}>Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required style={inputStyle}
            />
          </div>

          <div>
            <label style={{ color: 'var(--muted)', fontSize: 12, display: 'block', marginBottom: 4 }}>Senha</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)} required
                style={{ ...inputStyle, paddingRight: '2.5rem' }}
              />
              <button type="button" onClick={() => setShowPwd(!showPwd)} style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
                display: 'flex', alignItems: 'center',
              }}>
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6, padding: '0.5rem 0.75rem', color: 'var(--critical)', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            background: loading ? 'var(--border)' : 'var(--purple)',
            border: 'none', borderRadius: 6, color: 'white',
            fontWeight: 600, fontSize: 14, padding: '0.7rem',
            cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4,
            fontFamily: 'inherit', transition: 'background 0.15s',
          }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}
