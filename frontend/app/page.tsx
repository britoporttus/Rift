'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

// Home / landing pública. Porta de entrada da plataforma. O acesso SEMPRE passa
// pelo login (home → login → dashboard) — o login encaminha ao dashboard depois.
export default function Home() {
  const [year, setYear] = useState('')

  useEffect(() => {
    setYear(String(new Date().getFullYear()))
  }, [])

  return (
    <div style={{
      minHeight: '100vh', background: '#080810', color: '#E2E8F0',
      fontFamily: "'Space Grotesk', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes riseIn { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
        @keyframes ringPulse { 0%,100% { opacity: .5; transform: scale(1) } 50% { opacity: 1; transform: scale(1.04) } }
        .rise { animation: riseIn .5s cubic-bezier(.2,.7,.2,1) both }
      `}</style>

      {/* grid + glow background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(124,58,237,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.05) 1px, transparent 1px)',
        backgroundSize: '44px 44px', maskImage: 'radial-gradient(circle at 50% 38%, black, transparent 78%)',
      }} />
      <div style={{
        position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)',
        width: 640, height: 640, borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(124,58,237,0.16), transparent 65%)',
      }} />

      {/* top bar */}
      <header style={{
        position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1.1rem 1.6rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo />
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#A78BFA', letterSpacing: '0.1em' }}>RIFT</div>
            <div style={{ fontSize: 8, color: '#94A3B8', letterSpacing: '0.18em', marginTop: 2 }}>AI PENTEST</div>
          </div>
        </div>
        <Link href="/login" style={{
          fontSize: 12.5, fontWeight: 600, color: '#A78BFA', textDecoration: 'none',
          padding: '0.4rem 0.9rem', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 6,
        }}>
          Entrar
        </Link>
      </header>

      {/* hero */}
      <main style={{
        position: 'relative', flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        padding: '2rem 1.5rem', gap: 22,
      }}>
        <div className="rise" style={{
          fontSize: 11, letterSpacing: '0.2em', color: '#94A3B8', textTransform: 'uppercase',
          border: '1px solid rgba(124,58,237,0.25)', borderRadius: 99, padding: '4px 14px',
          fontFamily: "'JetBrains Mono', monospace", animationDelay: '.02s',
        }}>
          Cobertura de segurança automática
        </div>

        <h1 className="rise" style={{
          fontSize: 'clamp(30px, 5vw, 52px)', fontWeight: 700, lineHeight: 1.08,
          maxWidth: 780, margin: 0, letterSpacing: '-0.02em', animationDelay: '.08s',
        }}>
          Mapeie sua superfície de ataque com um{' '}
          <span style={{ color: '#A78BFA' }}>agente de IA</span>
        </h1>

        <p className="rise" style={{
          fontSize: 'clamp(14px, 2vw, 17px)', color: '#94A3B8', maxWidth: 620,
          lineHeight: 1.6, margin: 0, animationDelay: '.14s',
        }}>
          O Rift roda recon, enumeração e checagens de segurança de forma autônoma —
          entregando <span style={{ color: '#E2E8F0' }}>poucos achados de alta confiança</span> e
          um mapa vivo da sua exposição externa, com ruído mínimo.
        </p>

        <div className="rise" style={{ display: 'flex', gap: 12, marginTop: 4, animationDelay: '.2s' }}>
          <Link href="/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#7C3AED', color: 'white', textDecoration: 'none',
            fontSize: 14.5, fontWeight: 700, padding: '0.7rem 1.5rem', borderRadius: 8,
            boxShadow: '0 0 24px rgba(124,58,237,0.4)',
          }}>
            Acessar plataforma
            <span style={{ fontSize: 16 }}>→</span>
          </Link>
        </div>

        {/* value points */}
        <div className="rise" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12,
          maxWidth: 860, width: '100%', marginTop: 30, animationDelay: '.28s',
        }}>
          {[
            { t: 'Mapeamento externo', d: 'Subdomínios, stack, portas e assets expostos, automaticamente.' },
            { t: 'Baixo ruído, alta confiança', d: 'Cada achado é confirmado com evidência — sem inundação de falsos positivos.' },
            { t: 'Relatórios prontos', d: 'Relatório de superfície e técnico, com prints de evidência.' },
          ].map((c) => (
            <div key={c.t} style={{
              background: 'rgba(4,4,12,0.7)', border: '1px solid rgba(124,58,237,0.14)',
              borderRadius: 10, padding: '1rem 1.1rem', textAlign: 'left',
            }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#E2E8F0', marginBottom: 5 }}>{c.t}</div>
              <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.55 }}>{c.d}</div>
            </div>
          ))}
        </div>
      </main>

      <footer style={{
        position: 'relative', textAlign: 'center', padding: '1.1rem',
        fontSize: 10.5, color: '#3A3A58', fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: '0.08em',
      }}>
        RIFT · AI PENTEST PLATFORM {year && `· ${year}`}
      </footer>
    </div>
  )
}

function Logo() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 8, background: 'rgba(124,58,237,0.12)',
      border: '1px solid rgba(124,58,237,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'ringPulse 3s ease-in-out infinite',
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.75" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" />
        <line x1="12" y1="1" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="23" />
        <line x1="1" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="23" y2="12" />
        <circle cx="12" cy="12" r="1" fill="#A78BFA" />
      </svg>
    </div>
  )
}
