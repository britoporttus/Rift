'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

const ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed: 'Acesso não permitido. Use um email @porttus.com ou @trustsis.com.',
  invalid_state: 'Sessão expirada. Tente novamente.',
  token_exchange_failed: 'Falha na autenticação Microsoft. Tente novamente.',
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function MicrosoftIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 21 21" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}
function ShieldIcon({ size = 13, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}
function CrosshairIcon({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" /><line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </svg>
  )
}
function EyeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  )
}
function EyeOffIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

// ── Network map ───────────────────────────────────────────────────────────────
const NODES = [
  { dx: -230, dy: -175, name: 'WEB-01',  ip: '192.168.1.22', s: 'active'   },
  { dx:  252, dy: -158, name: 'DB-02',   ip: '192.168.1.45', s: 'critical' },
  { dx:  280, dy:  108, name: 'API-03',  ip: '192.168.2.8',  s: 'active'   },
  { dx: -198, dy:  185, name: 'FW-01',   ip: '192.168.2.31', s: 'scanning' },
  { dx:  -38, dy: -288, name: 'VPN-GW',  ip: '192.168.3.7',  s: 'offline'  },
  { dx:   92, dy:  265, name: 'SMTP-01', ip: '192.168.3.19', s: 'active'   },
  { dx: -305, dy:   18, name: 'PROXY',   ip: '192.168.4.2',  s: 'scanning' },
]
const NC: Record<string, string> = { active: '#22C55E', critical: '#EF4444', offline: '#3A3A58', scanning: '#F59E0B' }

function NetworkMap() {
  const cx = 450, cy = 400
  return (
    <svg width="900" height="800" style={{ position: 'absolute', left: -450, top: -400, overflow: 'visible', pointerEvents: 'none', zIndex: 2 }}>
      {NODES.map((n, i) => {
        const nx = cx + n.dx, ny = cy + n.dy, c = NC[n.s], right = n.dx >= 0
        return (
          <g key={i} style={{ animation: `tvFadeIn 0.4s ease ${0.7 + i * 0.13}s both` }}>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="rgba(124,58,237,0.17)" strokeWidth="0.7" strokeDasharray="4 8" />
            <circle cx={nx} cy={ny} r="4" fill={c} opacity="0.88" />
            {(n.s === 'active' || n.s === 'critical') && (
              <circle cx={nx} cy={ny} r="9" fill="none" stroke={c} strokeWidth="0.8" opacity="0.3"
                style={{ animation: 'tvRipple 3.5s ease-out infinite' }} />
            )}
            <text x={right ? nx + 11 : nx - 11} y={ny - 7} fill="rgba(148,163,184,0.6)" fontSize="9"
              textAnchor={right ? 'start' : 'end'} fontFamily="'JetBrains Mono',monospace">{n.name}</text>
            <text x={right ? nx + 11 : nx - 11} y={ny + 3} fill="rgba(100,116,139,0.4)" fontSize="8"
              textAnchor={right ? 'start' : 'end'} fontFamily="'JetBrains Mono',monospace">{n.ip}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Target ────────────────────────────────────────────────────────────────────
function TargetV4() {
  const corners = [
    { top: 12, left: 12, borderTop: '2px solid #A78BFA', borderLeft: '2px solid #A78BFA' },
    { top: 12, right: 12, borderTop: '2px solid #A78BFA', borderRight: '2px solid #A78BFA' },
    { bottom: 12, left: 12, borderBottom: '2px solid #A78BFA', borderLeft: '2px solid #A78BFA' },
    { bottom: 12, right: 12, borderBottom: '2px solid #A78BFA', borderRight: '2px solid #A78BFA' },
  ]
  return (
    <div style={{ position: 'relative', width: 400, height: 400, zIndex: 3 }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px dashed rgba(124,58,237,0.25)', animation: 'tvSpin 45s linear infinite' }} />
      <div style={{ position: 'absolute', inset: 14, borderRadius: '50%', border: '1px solid rgba(124,58,237,0.13)', animation: 'tvRipple 4.5s ease-out infinite' }} />
      <div style={{ position: 'absolute', inset: 14, borderRadius: '50%', border: '1px solid rgba(124,58,237,0.07)', animation: 'tvRipple 4.5s ease-out 2.25s infinite' }} />
      <div style={{ position: 'absolute', inset: 62, borderRadius: '50%', border: '1px solid rgba(124,58,237,0.65)', animation: 'tvSpinRev 24s linear infinite' }} />
      <div style={{ position: 'absolute', inset: 120, borderRadius: '50%', border: '1px solid rgba(167,139,250,0.2)', animation: 'tvSpin 11s linear infinite' }} />
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, transform: 'translateY(-0.5px)', background: 'linear-gradient(to right,transparent 0%,rgba(124,58,237,0.1) 12%,rgba(167,139,250,0.97) 50%,rgba(124,58,237,0.1) 88%,transparent 100%)', boxShadow: '0 0 14px rgba(167,139,250,0.3)' }} />
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, transform: 'translateX(-0.5px)', background: 'linear-gradient(to bottom,transparent 0%,rgba(124,58,237,0.1) 12%,rgba(167,139,250,0.97) 50%,rgba(124,58,237,0.1) 88%,transparent 100%)', boxShadow: '0 0 14px rgba(167,139,250,0.3)' }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#7C3AED', boxShadow: '0 0 28px #7C3AED,0 0 60px rgba(124,58,237,0.5)', animation: 'tvPulse 2.2s ease-in-out infinite' }} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, height: 1, top: 0, background: 'linear-gradient(to right,transparent,rgba(167,139,250,0.88),transparent)', boxShadow: '0 0 10px rgba(167,139,250,0.5)', animation: 'tvScan 4s ease-in-out infinite' }} />
      {corners.map((s, i) => <div key={i} style={{ position: 'absolute', width: 26, height: 26, ...s }} />)}
    </div>
  )
}

// ── RIFT brand ────────────────────────────────────────────────────────────────
function RiftBrand() {
  const bc = 'rgba(124,58,237,0.5)'
  const corners = [
    { top: 0, left: 0, borderTop: `1px solid ${bc}`, borderLeft: `1px solid ${bc}` },
    { top: 0, right: 0, borderTop: `1px solid ${bc}`, borderRight: `1px solid ${bc}` },
    { bottom: 0, left: 0, borderBottom: `1px solid ${bc}`, borderLeft: `1px solid ${bc}` },
    { bottom: 0, right: 0, borderBottom: `1px solid ${bc}`, borderRight: `1px solid ${bc}` },
  ]
  return (
    <div style={{ position: 'relative', padding: '14px 32px', textAlign: 'center', zIndex: 3 }}>
      {corners.map((s, i) => <div key={i} style={{ position: 'absolute', width: 20, height: 20, ...s }} />)}
      <div style={{ fontSize: 92, fontWeight: 700, letterSpacing: '0.22em', lineHeight: 1, fontFamily: "'JetBrains Mono',monospace", color: 'rgba(167,139,250,0.52)', textShadow: '0 0 80px rgba(124,58,237,0.22)' }}>RIFT</div>
      <div style={{ fontSize: 9, color: '#3A3A5A', letterSpacing: '0.3em', marginTop: 8 }}>AI PENTEST PLATFORM</div>
    </div>
  )
}

// ── System status panel ───────────────────────────────────────────────────────
function useUptime() {
  const [sec, setSec] = useState(0)
  useEffect(() => { const t = setInterval(() => setSec(s => s + 1), 1000); return () => clearInterval(t) }, [])
  const total = 2 * 86400 + 14 * 3600 + 37 * 60 + 22 + sec
  const d = Math.floor(total / 86400)
  const h = String(Math.floor((total % 86400) / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  return `${d}d ${h}h ${m}m`
}

function SystemStatusPanel() {
  const uptime = useUptime()
  const rows = [
    { k: 'ENGINE', v: 'v2.4.1' }, { k: 'MODULES', v: 'CARREGADOS' },
    { k: 'DATABASE', v: 'CONECTADO' }, { k: 'UPTIME', v: uptime },
  ]
  return (
    <div style={{ position: 'absolute', top: '2rem', right: '2.5rem', width: 196, zIndex: 8, animation: 'tvSlideLeft 0.5s ease 0.4s both' }}>
      <div style={{ background: 'rgba(4,4,12,0.93)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: 5, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.65)' }}>
        <div style={{ padding: '0.5rem 0.9rem', borderBottom: '1px solid rgba(20,20,40,0.9)', fontSize: 9, color: '#A78BFA', letterSpacing: '0.13em', fontWeight: 600 }}>SISTEMA OPERACIONAL</div>
        <div style={{ padding: '0.4rem 0.9rem', borderBottom: '1px solid rgba(14,14,28,0.8)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px #22C55E', animation: 'tvStatusPulse 1.5s ease-in-out infinite' }} />
          <span style={{ fontSize: 10, color: '#22C55E', fontWeight: 600, letterSpacing: '0.08em' }}>ONLINE</span>
        </div>
        <div style={{ padding: '0.5rem 0.9rem', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {rows.map(({ k, v }) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 9, color: '#353558', letterSpacing: '0.09em' }}>{k}</span>
              <span style={{ fontSize: 9, color: '#94A3B8', letterSpacing: '0.04em' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Threat level panel ────────────────────────────────────────────────────────
const SPARK = [5, 4, 3, 4, 5, 4, 3, 2, 2, 3, 2, 1, 1, 2, 1, 1, 2, 1, 0, 1]
function SparkLine() {
  const W = 168, H = 28
  const pts = SPARK.map((v, i) => `${(i / (SPARK.length - 1)) * W},${H - (v / 5) * H}`).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline points={pts} fill="none" stroke="#22C55E" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}
function ThreatLevelPanel() {
  return (
    <div style={{ position: 'absolute', bottom: '2.5rem', right: '2.5rem', width: 196, zIndex: 8, animation: 'tvSlideLeft 0.5s ease 0.6s both' }}>
      <div style={{ background: 'rgba(4,4,12,0.93)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: 5, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.65)' }}>
        <div style={{ padding: '0.5rem 0.9rem', borderBottom: '1px solid rgba(20,20,40,0.9)', fontSize: 9, color: '#A78BFA', letterSpacing: '0.13em', fontWeight: 600 }}>THREAT LEVEL</div>
        <div style={{ padding: '0.65rem 0.9rem' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#22C55E', letterSpacing: '0.06em', marginBottom: 10 }}>BAIXO</div>
          <SparkLine />
          <div style={{ fontSize: 8, color: '#2A2A48', letterSpacing: '0.06em', marginTop: 7 }}>Última verificação: agora</div>
        </div>
      </div>
    </div>
  )
}

// ── Threat ticker ─────────────────────────────────────────────────────────────
const TICKER_ITEMS = [
  'CVE-2026-0412 │ CRITICAL │ RCE in OpenSSL 3.2.1',
  'THREAT ACTOR: APT-37 │ T1059.001 │ ACTIVE',
  'IOC: 185.220.101.47 │ MALICIOUS │ BLOCKED',
  'CVE-2026-0389 │ CVSS 9.8 │ ENGINE UPDATED',
  'DARKNET CHATTER ↑23% │ SECTOR: FINANCIAL',
  'HONEYPOT HIT: 10.0.4.22 │ PORT 443 │ RECON',
]
function ThreatTicker() {
  const text = TICKER_ITEMS.join('   ◆   ')
  const doubled = text + '   ◆   ' + text
  return (
    <div style={{ overflow: 'hidden', borderTop: '1px solid #0C0C1E', height: 26, display: 'flex', alignItems: 'center', background: 'rgba(3,3,8,0.94)', flexShrink: 0 }}>
      <div style={{ display: 'inline-block', whiteSpace: 'nowrap', fontSize: 9, color: '#252545', letterSpacing: '0.04em', animation: 'tickerScroll 60s linear infinite' }}>
        <span style={{ color: '#7C3AED', marginRight: 14, fontSize: 8, letterSpacing: '0.14em' }}>◆ THREAT FEED</span>
        {doubled}
      </div>
    </div>
  )
}

// ── HUD corner ────────────────────────────────────────────────────────────────
function HudCorner({ top, left, right, bottom }: { top?: number; left?: number; right?: number; bottom?: number }) {
  return (
    <div style={{
      position: 'absolute', width: 17, height: 17, top, left, right, bottom, pointerEvents: 'none',
      borderTop: top != null ? '1px solid rgba(124,58,237,0.38)' : 'none',
      borderBottom: bottom != null ? '1px solid rgba(124,58,237,0.38)' : 'none',
      borderLeft: left != null ? '1px solid rgba(124,58,237,0.38)' : 'none',
      borderRight: right != null ? '1px solid rgba(124,58,237,0.38)' : 'none',
    }} />
  )
}

// ── Login form ────────────────────────────────────────────────────────────────
const STAGES = ['ESTABLISHING TLS HANDSHAKE', 'VERIFYING IDENTITY TOKEN', 'CHECKING CLEARANCE LEVEL', 'INITIALIZING SESSION']
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

function LoginForm({ onLogin, ssoError }: { onLogin: (e: string, p: string) => Promise<void>; ssoError: string }) {
  const [email, setEmail] = useState('admin@rift.local')
  const [pass,  setPass]  = useState('')
  const [show,  setShow]  = useState(false)
  const [err,   setErr]   = useState(ssoError)
  const [stage, setStage] = useState(-1)
  const [focus, setFocus] = useState<string | null>(null)
  const [hMs,   setHMs]   = useState(false)
  const [hBtn,  setHBtn]  = useState(false)

  useEffect(() => { setErr(ssoError) }, [ssoError])

  const loading = stage >= 0 && stage < 4
  const success = stage === 4
  const pct = loading ? Math.round(((stage + 1) / 4) * 94) : success ? 100 : 0

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setStage(0); await delay(450)
    setStage(1); await delay(400)
    try {
      await onLogin(email, pass)
      setStage(2); await delay(380)
      setStage(3); await delay(380)
      setStage(4)
    } catch (ex: unknown) {
      setStage(-1)
      setErr(ex instanceof Error ? ex.message : 'AUTH KEY REJEITADA — CREDENCIAL INVÁLIDA')
    }
  }

  const fl = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
      <span style={{ color: '#7C3AED', fontSize: 9, flexShrink: 0 }}>▶</span>
      <span style={{ color: '#A78BFA', fontSize: 9, letterSpacing: '0.12em', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right,rgba(45,45,78,0.7),transparent)' }} />
    </div>
  )

  const inp = (f: string): React.CSSProperties => ({
    width: '100%', padding: '0.35rem 0', background: 'transparent', border: 'none',
    borderBottom: `1px solid ${focus === f ? '#7C3AED' : 'rgba(45,45,78,0.65)'}`,
    color: focus === f ? '#E2E8F0' : '#CBD5E1', fontSize: 12, outline: 'none', fontFamily: 'inherit',
    caretColor: '#A78BFA', letterSpacing: '0.02em', transition: 'border-color 0.2s,color 0.15s',
  })

  return (
    <div>
      <a href="/api/auth/microsoft" style={{
        display: 'flex', alignItems: 'center', padding: '0.5rem 0.8rem', marginBottom: 6,
        background: hMs ? 'rgba(124,58,237,0.07)' : 'rgba(6,6,14,0.7)',
        border: `1px solid ${hMs ? 'rgba(124,58,237,0.5)' : '#252540'}`,
        borderRadius: 3, textDecoration: 'none', fontFamily: 'inherit', fontSize: 11, transition: 'all 0.15s',
      }} onMouseEnter={() => setHMs(true)} onMouseLeave={() => setHMs(false)}>
        <span style={{ color: '#22C55E', marginRight: 7, flexShrink: 0, fontSize: 10 }}>$</span>
        <span style={{ color: '#94A3B8', marginRight: 3 }}>auth</span>
        <span style={{ color: '#64748B', marginRight: 3 }}>--provider</span>
        <span style={{ color: hMs ? '#A78BFA' : '#7C3AED', marginRight: 'auto', transition: 'color 0.15s' }}>microsoft --sso</span>
        <MicrosoftIcon />
        <span style={{ marginLeft: 8, fontSize: 9, color: '#252540', border: '1px solid #252540', borderRadius: 2, padding: '1px 4px', flexShrink: 0 }}>↵</span>
      </a>

      <div style={{ display: 'flex', alignItems: 'center', margin: '1rem 0' }}>
        <div style={{ flex: 1, height: 1, background: '#181830' }} />
        <span style={{ color: '#2D2D50', fontSize: 9, letterSpacing: '0.07em', padding: '0 10px', whiteSpace: 'nowrap' }}>── local access ──</span>
        <div style={{ flex: 1, height: 1, background: '#181830' }} />
      </div>

      <form onSubmit={run} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
        <div>
          {fl('IDENT')}
          <input type="email" value={email} required disabled={loading || success}
            onChange={e => setEmail(e.target.value)} onFocus={() => setFocus('e')} onBlur={() => setFocus(null)} style={inp('e')} />
        </div>
        <div>
          {fl('AUTH-KEY')}
          <div style={{ position: 'relative' }}>
            <input type={show ? 'text' : 'password'} value={pass} required disabled={loading || success}
              onChange={e => setPass(e.target.value)} onFocus={() => setFocus('p')} onBlur={() => setFocus(null)}
              style={{ ...inp('p'), paddingRight: '1.8rem' }} />
            <button type="button" onClick={() => setShow(!show)} style={{
              position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: '#3A3A5A', display: 'flex', padding: 0, transition: 'color 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = '#A78BFA')}
              onMouseLeave={e => (e.currentTarget.style.color = '#3A3A5A')}>
              {show ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        {(loading || success) && (
          <div style={{ animation: 'tvFadeIn 0.2s ease' }}>
            {loading && (
              <div style={{ color: '#94A3B8', fontSize: 10, marginBottom: 7 }}>
                <span style={{ color: '#7C3AED' }}>{'> '}</span>{STAGES[stage]}{'...'}
                <span style={{ animation: 'tvBlink 0.7s step-end infinite', color: '#A78BFA' }}>_</span>
              </div>
            )}
            <div style={{ height: 2, background: '#10102A', borderRadius: 1, overflow: 'hidden', marginBottom: 7 }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 1, transition: 'width 0.45s cubic-bezier(.4,0,.2,1),background 0.3s',
                background: success ? '#22C55E' : 'linear-gradient(to right,#7C3AED,#A78BFA)',
                boxShadow: '0 0 8px rgba(167,139,250,0.4)' }} />
            </div>
            <div style={{ fontSize: 9, lineHeight: 1.9, color: '#94A3B8' }}>
              {STAGES.slice(0, success ? 4 : stage).map((s, i) => (
                <div key={i} style={{ animation: 'tvFadeIn 0.2s ease' }}>
                  <span style={{ color: '#22C55E', marginRight: 5 }}>[OK]</span>{s}
                </div>
              ))}
              {success && <div style={{ color: '#22C55E', marginTop: 4, fontWeight: 600, animation: 'tvFadeIn 0.3s ease' }}>● ACCESS GRANTED</div>}
            </div>
          </div>
        )}

        {err && <div style={{ fontSize: 10, color: '#EF4444', animation: 'tvFadeIn 0.2s ease' }}><span style={{ opacity: 0.6 }}>[!] ERR: </span>{err}</div>}

        {!loading && !success && (
          <button type="submit" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            width: '100%', padding: '0.62rem 1rem', marginTop: 2, cursor: 'pointer', fontFamily: 'inherit',
            background: hBtn ? 'rgba(124,58,237,0.14)' : 'transparent',
            border: `1px solid ${hBtn ? '#7C3AED' : '#252540'}`,
            borderRadius: 3, color: hBtn ? '#E2E8F0' : '#94A3B8', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.1em', transition: 'all 0.15s',
            boxShadow: hBtn ? '0 0 20px rgba(124,58,237,0.18)' : 'none',
          }} onMouseEnter={() => setHBtn(true)} onMouseLeave={() => setHBtn(false)}>
            <span style={{ color: hBtn ? '#A78BFA' : '#7C3AED', fontSize: 9, transition: 'color 0.15s' }}>▶</span>
            RUN AUTHENTICATE
            <span style={{ marginLeft: 'auto', fontSize: 9, color: hBtn ? '#4A4A70' : '#252540',
              border: `1px solid ${hBtn ? '#4A4A70' : '#252540'}`, borderRadius: 2, padding: '1px 4px', transition: 'border-color 0.15s,color 0.15s' }}>↵</span>
          </button>
        )}
      </form>
    </div>
  )
}

// ── Login card ────────────────────────────────────────────────────────────────
function LoginCard({ onLogin, ssoError }: { onLogin: (e: string, p: string) => Promise<void>; ssoError: string }) {
  return (
    <div style={{ position: 'absolute', top: '50%', left: '4rem', transform: 'translateY(-50%)', width: 356, zIndex: 10,
      background: 'rgba(4,4,11,0.95)', border: '1px solid rgba(124,58,237,0.17)', borderRadius: 5,
      overflow: 'hidden', animation: 'tvSlideUp 0.55s ease',
      boxShadow: '0 0 0 1px rgba(124,58,237,0.05),0 24px 64px rgba(0,0,0,0.88)' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.012) 3px,rgba(0,0,0,0.012) 4px)' }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '0 1.25rem', height: 30,
        borderBottom: '1px solid rgba(16,16,34,0.9)', background: 'rgba(2,2,8,0.97)', fontSize: 9, color: '#2A2A45', letterSpacing: '0.09em' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['rgba(239,68,68,0.38)', 'rgba(234,179,8,0.38)', 'rgba(34,197,94,0.38)'].map((c, i) => (
            <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
          ))}
        </div>
        <span style={{ color: '#7C3AED', fontWeight: 600, letterSpacing: '0.1em', marginLeft: 2 }}>RIFT-AUTH</span>
        <span>│</span><span>TLS 1.3</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, color: '#22C55E' }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#22C55E', animation: 'tvStatusPulse 2s ease-in-out infinite' }} />
          SECURE
        </div>
      </div>
      <div style={{ position: 'relative', zIndex: 1, padding: '1.4rem 1.7rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <CrosshairIcon size={18} color="#7C3AED" />
          <span style={{ fontSize: 17, fontWeight: 700, color: '#A78BFA', letterSpacing: '0.08em' }}>Rift</span>
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 600, color: '#E2E8F0', letterSpacing: '-0.01em', lineHeight: 1.2, marginBottom: 4 }}>
          Bem-vindo de volta<span style={{ color: '#7C3AED', animation: 'tvBlink 1s step-end infinite' }}>_</span>
        </h2>
        <div style={{ color: '#7C3AED', fontSize: 10, letterSpacing: '0.07em', marginBottom: '1.35rem', opacity: 0.7 }}>
          {'// autenticação local'}
        </div>
        <LoginForm onLogin={onLogin} ssoError={ssoError} />
      </div>
      <div style={{ position: 'relative', zIndex: 1, borderTop: '1px solid #0A0A1C', padding: '0.5rem 1.25rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(2,2,8,0.88)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <div style={{ marginTop: 1, flexShrink: 0 }}><ShieldIcon size={12} color="#3A3A62" /></div>
          <div>
            <div style={{ fontSize: 8, letterSpacing: '0.04em', color: '#3A3A62' }}>Acesso restrito e monitorado</div>
            <div style={{ fontSize: 7, color: '#252540', marginTop: 2, letterSpacing: '0.03em' }}>Todos os eventos são registrados.</div>
          </div>
        </div>
        <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.1em', color: '#22C55E', flexShrink: 0,
          border: '1px solid rgba(34,197,94,0.28)', borderRadius: 2, padding: '2px 7px',
          background: 'rgba(34,197,94,0.06)', whiteSpace: 'nowrap' }}>VERIFICADO</div>
      </div>
    </div>
  )
}

// ── Full canvas ───────────────────────────────────────────────────────────────
function FullCanvas({ onLogin, ssoError }: { onLogin: (e: string, p: string) => Promise<void>; ssoError: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
      <div style={{ flexShrink: 0, zIndex: 20, display: 'flex', alignItems: 'center', height: 34, padding: '0 1.5rem',
        borderBottom: '1px solid rgba(10,10,26,0.98)', background: 'rgba(2,2,8,0.98)',
        fontSize: 9, color: '#252545', letterSpacing: '0.1em', gap: 14 }}>
        <div style={{ display: 'flex', gap: 5, marginRight: 2 }}>
          {['rgba(239,68,68,0.38)', 'rgba(234,179,8,0.38)', 'rgba(34,197,94,0.38)'].map((c, i) => (
            <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
          ))}
        </div>
        <span style={{ color: '#7C3AED', fontWeight: 600, letterSpacing: '0.12em', fontSize: 10 }}>RIFT</span>
        <span>│</span><span>PENTEST SYSTEM v2.4.1</span>
        <span>│</span><span>NODE: 10.0.0.1</span>
        <span>│</span><span>SCAN ENGINE: ACTIVE</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>TARGETS: 1,247</span><span>│</span><span>VULNS: 89</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#22C55E', marginLeft: 4 }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#22C55E', animation: 'tvStatusPulse 2s ease-in-out infinite' }} />
            LIVE
          </div>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#080810',
        backgroundImage: 'linear-gradient(rgba(124,58,237,0.037) 1px,transparent 1px),linear-gradient(90deg,rgba(124,58,237,0.037) 1px,transparent 1px)',
        backgroundSize: '40px 40px' }}>
        <div style={{ position: 'absolute', top: '40%', left: '61%', transform: 'translate(-50%,-50%)', width: 920, height: 920, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(circle,rgba(124,58,237,0.08) 0%,transparent 58%)' }} />
        <div style={{ position: 'absolute', top: '40%', left: '52%', transform: 'translate(-50%,-50%)', fontSize: 300, fontWeight: 700, color: 'rgba(124,58,237,0.03)', letterSpacing: '0.24em', lineHeight: 1, userSelect: 'none', pointerEvents: 'none', zIndex: 1, whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono',monospace", animation: 'ghostGlitch 14s step-end infinite' }}>RIFT</div>
        <HudCorner top={16} left={16} /><HudCorner top={16} right={16} />
        <HudCorner bottom={5} left={16} /><HudCorner bottom={5} right={16} />
        <div style={{ position: 'absolute', top: '40%', left: '61%', zIndex: 5 }}>
          <NetworkMap />
          <div style={{ position: 'absolute', left: -200, top: -200 }}><TargetV4 /></div>
        </div>
        <div style={{ position: 'absolute', top: 'calc(40% + 230px)', left: 'calc(61% - 254px)', width: 508, zIndex: 4 }}>
          <RiftBrand />
        </div>
        <SystemStatusPanel />
        <ThreatLevelPanel />
        <LoginCard onLogin={onLogin} ssoError={ssoError} />
      </div>
      <ThreatTicker />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  return <Suspense><LoginPageInner /></Suspense>
}

function LoginPageInner() {
  const { login, setToken } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [ssoError, setSsoError] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    const err = searchParams.get('error')
    if (token) { setToken(token); router.replace('/dashboard') }
    else if (err) setSsoError(ERROR_MESSAGES[err] || `Erro SSO: ${err}`)
  }, [searchParams, router, setToken])

  const handleLogin = async (email: string, password: string) => {
    await login(email, password)
    router.replace('/dashboard')
  }

  return <FullCanvas onLogin={handleLogin} ssoError={ssoError} />
}
