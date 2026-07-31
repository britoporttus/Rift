'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'

const ERROR_MESSAGES: Record<string, string> = {
  domain_not_allowed: 'Acesso não permitido. Use um email @porttus.com ou @trustsis.com.',
  invalid_state: 'Sessão expirada. Tente novamente.',
  token_exchange_failed: 'Falha na autenticação Microsoft. Tente novamente.',
}

const FONT_DISPLAY = "'Space Grotesk', sans-serif"

// ── Icons ────────────────────────────────────────────────────────────────────
function CrosshairIcon({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <circle cx="12" cy="12" r="9.2" /><circle cx="12" cy="12" r="3" />
      <line x1="12" y1="1.2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22.8" />
      <line x1="1.2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22.8" y2="12" />
    </svg>
  )
}
function MailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" /><path d="M3 6l9 6.5L21 6" />
    </svg>
  )
}
function LockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" /><path d="M8 10.5V7a4 4 0 018 0v3.5" />
    </svg>
  )
}
function EyeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" /><circle cx="12" cy="12" r="3" />
    </svg>
  )
}
function EyeOffIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 5.2A9.7 9.7 0 0112 5c6.5 0 10.5 7 10.5 7a17 17 0 01-2.2 2.9M6.2 6.7A17 17 0 001.5 12s4 7 10.5 7a9.5 9.5 0 004-.9" />
      <path d="M9.9 9.9a3 3 0 004.2 4.2" /><line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}
function CheckIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12l5 5L20 6" />
    </svg>
  )
}
function ShieldIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}
function MicrosoftIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21 21">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" /><rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" /><rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}

// ── Radar / orbital visualization (canvas) ─────────────────────────────────────
type Star = { x: number; y: number; r: number; ph: number; tw: number }
type Particle = { a: number; rr: number; x: number; y: number; sp: number; z: number }
type Orbit = { rxF: number; ryF: number; tilt: number; sp: number; n: number; col: [number, number, number]; beam: boolean }

const ORBITS: Orbit[] = [
  { rxF: 1.00, ryF: 0.34, tilt: -0.36, sp: 0.13, n: 2, col: [168, 130, 255], beam: true },
  { rxF: 0.70, ryF: 0.70, tilt: 0.0, sp: -0.19, n: 3, col: [139, 92, 246], beam: false },
  { rxF: 0.52, ryF: 0.90, tilt: 0.62, sp: 0.26, n: 2, col: [192, 132, 252], beam: true },
  { rxF: 0.86, ryF: 0.58, tilt: 2.4, sp: -0.11, n: 2, col: [124, 90, 220], beam: false },
]
const HOT_COLORS: [number, number, number][] = [[34, 197, 94], [245, 158, 11]]

function RadarStage() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t0 = performance.now()
    let W = 0, H = 0, DPR = 1, raf = 0
    let cx = 0, cy = 0, S = 0, R = 0
    const stars: Star[] = []
    const parts: Particle[] = []

    function resize() {
      if (!cv || !ctx) return
      DPR = Math.min(window.devicePixelRatio || 1, 2)
      W = cv.clientWidth
      H = cv.clientHeight
      cv.width = W * DPR
      cv.height = H * DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      cx = W * 0.5
      cy = H * 0.5
      S = Math.min(W, H)
      R = S * 0.44
      stars.length = 0
      for (let i = 0; i < 40; i++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2 + 0.3, ph: Math.random() * 6.28, tw: 0.6 + Math.random() * 1.6 })
      }
      parts.length = 0
      for (let i = 0; i < 46; i++) {
        const a = Math.random() * 6.28
        const rr = R * (0.2 + Math.random() * 1.1)
        parts.push({ a, rr, x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, sp: 0.1 + Math.random() * 0.5, z: Math.random() })
      }
    }

    function proj(X: number, Y: number, tilt: number): [number, number] {
      return [cx + X * Math.cos(tilt) - Y * Math.sin(tilt), cy + X * Math.sin(tilt) + Y * Math.cos(tilt)]
    }

    function ellipse(o: Orbit) {
      if (!ctx) return
      ctx.beginPath()
      for (let k = 0; k <= 64; k++) {
        const th = (k / 64) * 6.283
        const [x, y] = proj(o.rxF * R * Math.cos(th), o.ryF * R * Math.sin(th), o.tilt)
        if (k) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
      }
      ctx.closePath()
    }

    function frame(now: number) {
      if (!ctx) return
      const t = reduce ? 6 : Math.max(0, (now - t0) / 1000)
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#05050d'
      ctx.fillRect(0, 0, W, H)

      const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25)
      centerGlow.addColorStop(0, 'rgba(124,58,237,0.16)')
      centerGlow.addColorStop(0.5, 'rgba(124,58,237,0.05)')
      centerGlow.addColorStop(1, 'transparent')
      ctx.fillStyle = centerGlow
      ctx.fillRect(0, 0, W, H)

      ctx.globalCompositeOperation = 'lighter'

      for (const s of stars) {
        const a = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph))
        ctx.fillStyle = `rgba(180,160,240,${a})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, 6.283)
        ctx.fill()
      }

      for (const p of parts) {
        p.a += p.sp * 0.004
        p.x = cx + Math.cos(p.a) * p.rr
        p.y = cy + Math.sin(p.a) * p.rr
        ctx.fillStyle = `rgba(${(150 + p.z * 50) | 0},120,250,${0.12 + p.z * 0.28})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, 0.5 + p.z * 1.3, 0, 6.283)
        ctx.fill()
      }

      const ringRadii = [1, 0.68, 0.4, 0.2]
      for (let i = 0; i < ringRadii.length; i++) {
        ctx.strokeStyle = `rgba(139,92,246,${0.16 - i * 0.02})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(cx, cy, R * ringRadii[i], 0, 6.283)
        ctx.stroke()
      }

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(t * 0.12)
      ctx.setLineDash([3, 10])
      ctx.strokeStyle = 'rgba(167,139,250,0.28)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(0, 0, R * 0.86, 0, 6.283)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(-t * 0.2)
      ctx.setLineDash([2, 14])
      ctx.strokeStyle = 'rgba(139,92,246,0.22)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(0, 0, R * 0.54, 0, 6.283)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      const sweep = t * 0.5
      for (let k = 0; k < 32; k++) {
        const ang = sweep - k * 0.022
        const al = (1 - k / 32) * 0.14
        ctx.strokeStyle = `rgba(167,139,250,${al})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R)
        ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(210,190,255,0.5)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R)
      ctx.stroke()

      for (let i = 0; i < 2; i++) {
        const e = (t / 4.5 + i * 0.5) % 1
        const rr = e * R * 1.05
        ctx.strokeStyle = `rgba(124,58,237,${(1 - e) * 0.4})`
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(cx, cy, rr, 0, 6.283)
        ctx.stroke()
      }

      ORBITS.forEach((o, oi) => {
        ctx.strokeStyle = `rgba(${o.col[0]},${o.col[1]},${o.col[2]},0.16)`
        ctx.lineWidth = 1
        ellipse(o)
        ctx.stroke()
        for (let i = 0; i < o.n; i++) {
          const th = (t * o.sp * 6.283) / 2 + i * (6.283 / o.n) + oi * 1.3
          const depth = 0.5 + 0.5 * Math.sin(th)
          const [x, y] = proj(o.rxF * R * Math.cos(th), o.ryF * R * Math.sin(th), o.tilt)

          for (let k = 8; k >= 1; k--) {
            const tk = th - k * 0.05
            const [tx, ty] = proj(o.rxF * R * Math.cos(tk), o.ryF * R * Math.sin(tk), o.tilt)
            ctx.fillStyle = `rgba(${o.col[0]},${o.col[1]},${o.col[2]},${(1 - k / 8) * 0.18 * (0.4 + depth)})`
            ctx.beginPath()
            ctx.arc(tx, ty, 1.2, 0, 6.283)
            ctx.fill()
          }

          if (o.beam && i === 0) {
            const bp = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 1.3 + oi))
            const lg = ctx.createLinearGradient(x, y, cx, cy)
            lg.addColorStop(0, `rgba(210,190,255,${0.5 * bp})`)
            lg.addColorStop(1, 'transparent')
            ctx.strokeStyle = lg
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(x, y)
            ctx.lineTo(cx, cy)
            ctx.stroke()
          }

          const col = oi === 0 && i === 0 ? HOT_COLORS[0] : oi === 2 && i === 0 ? HOT_COLORS[1] : o.col
          const rr = 2.4 + depth * 3
          const rg = ctx.createRadialGradient(x, y, 0, x, y, rr * 3.4)
          rg.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.55 + depth * 0.4})`)
          rg.addColorStop(0.4, `rgba(${col[0]},${col[1]},${col[2]},${0.28 + depth * 0.3})`)
          rg.addColorStop(1, 'transparent')
          ctx.fillStyle = rg
          ctx.beginPath()
          ctx.arc(x, y, rr * 3.4, 0, 6.283)
          ctx.fill()
          ctx.fillStyle = `rgba(255,255,255,${0.6 + depth * 0.4})`
          ctx.beginPath()
          ctx.arc(x, y, rr * 0.6, 0, 6.283)
          ctx.fill()
        }
      })

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(t * 0.3)
      ctx.setLineDash([4, 7])
      ctx.strokeStyle = 'rgba(167,139,250,0.5)'
      ctx.lineWidth = 1.3
      ctx.beginPath()
      ctx.arc(0, 0, R * 0.13, 0, 6.283)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      const arm = R * 0.2
      const gap = R * 0.05
      ctx.lineWidth = 1.4
      const arms: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]
      for (const [dx, dy] of arms) {
        const lg = ctx.createLinearGradient(cx + dx * gap, cy + dy * gap, cx + dx * arm, cy + dy * arm)
        lg.addColorStop(0, 'rgba(200,170,255,0.75)')
        lg.addColorStop(1, 'rgba(124,58,237,0)')
        ctx.strokeStyle = lg
        ctx.beginPath()
        ctx.moveTo(cx + dx * gap, cy + dy * gap)
        ctx.lineTo(cx + dx * arm, cy + dy * arm)
        ctx.stroke()
      }

      const bx = R * 0.115
      const bl = R * 0.035
      ctx.strokeStyle = 'rgba(167,139,250,0.7)'
      ctx.lineWidth = 1.5
      const corners: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
      for (const [sx, sy] of corners) {
        ctx.beginPath()
        ctx.moveTo(cx + sx * bx - sx * bl, cy + sy * bx)
        ctx.lineTo(cx + sx * bx, cy + sy * bx)
        ctx.lineTo(cx + sx * bx, cy + sy * bx - sy * bl)
        ctx.stroke()
      }

      const cp = 0.6 + 0.4 * Math.sin(t * 2.0)
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.1 * cp + 8)
      cg.addColorStop(0, 'rgba(235,225,255,0.95)')
      cg.addColorStop(0.4, `rgba(160,120,255,${0.6 * cp})`)
      cg.addColorStop(1, 'transparent')
      ctx.fillStyle = cg
      ctx.beginPath()
      ctx.arc(cx, cy, R * 0.1 * cp + 8, 0, 6.283)
      ctx.fill()
      ctx.fillStyle = 'rgba(124,58,237,0.95)'
      ctx.beginPath()
      ctx.arc(cx, cy, 3.2, 0, 6.283)
      ctx.fill()

      ctx.globalCompositeOperation = 'source-over'
      if (!reduce) raf = requestAnimationFrame(frame)
    }

    resize()
    frame(performance.now())
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
}

// ── Right panel: login form ─────────────────────────────────────────────────────
function LoginSide({ onLogin, ssoError, narrow }: { onLogin: (email: string, password: string) => Promise<void>; ssoError: string; narrow: boolean }) {
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(true)
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState(ssoError)
  const [loading, setLoading] = useState(false)
  const [focus, setFocus] = useState<'email' | 'pass' | null>(null)
  const [hoverBtn, setHoverBtn] = useState(false)
  const [hoverMs, setHoverMs] = useState(false)

  useEffect(() => { setErr(ssoError) }, [ssoError])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setLoading(true)
    try {
      await onLogin(email, pass)
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'Credenciais inválidas.')
      setLoading(false)
    }
  }

  const inputStyle = (focused: boolean): React.CSSProperties => ({
    width: '100%', height: 52, padding: '0 2.8rem', borderRadius: '.7rem',
    background: focused ? 'rgba(9,8,22,0.85)' : 'rgba(6,6,16,0.65)',
    border: `1px solid ${focused ? 'rgba(124,58,237,0.65)' : 'rgba(139,92,246,0.16)'}`,
    color: '#e5e7eb', fontFamily: 'var(--mono)', fontSize: '.9rem', outline: 'none',
    boxShadow: focused ? '0 0 0 3px rgba(124,58,237,0.12)' : 'none',
    transition: 'border-color .18s, box-shadow .18s, background .18s',
  })

  return (
    <aside style={{
      width: narrow ? '100%' : 480, flex: narrow ? 1 : '0 0 auto', flexShrink: 0, position: 'relative',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: narrow ? '2.2rem 1.5rem' : '2.5rem 3.4rem',
      background: 'linear-gradient(180deg,#08060f,#06050c)',
      borderLeft: narrow ? 'none' : '1px solid rgba(139,92,246,0.14)',
      borderTop: narrow ? '1px solid rgba(139,92,246,0.14)' : 'none',
      boxShadow: narrow ? '0 -30px 60px rgba(0,0,0,0.5)' : '-30px 0 80px rgba(0,0,0,0.5)',
    }}>
      {!narrow && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1,
          background: 'linear-gradient(180deg,transparent,rgba(139,92,246,0.5),transparent)' }} />
      )}
      <div style={{ width: '100%', maxWidth: 360, margin: '0 auto', animation: 'loginFadeUp .6s cubic-bezier(.2,.7,.3,1) both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem', marginBottom: '2rem' }}>
          <CrosshairIcon size={34} color="#a78bfa" strokeWidth={1.5} />
          <span style={{
            fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '1.7rem', letterSpacing: '.05em',
            background: 'linear-gradient(120deg,#c4b5fd,#a78bfa 50%,#7c3aed)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>RIFT</span>
        </div>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: '1.55rem', color: '#f5f5f5', letterSpacing: '-.01em' }}>
          Bem-vindo de volta
        </h1>
        <div style={{ fontSize: '.88rem', color: '#71717a', marginTop: '.5rem', marginBottom: '1.8rem' }}>
          Faça login para continuar sua jornada.
        </div>

        <form onSubmit={submit}>
          <div style={{ position: 'relative', marginBottom: '.85rem' }}>
            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#52525b', display: 'flex', pointerEvents: 'none' }}>
              <MailIcon />
            </span>
            <input
              type="text" value={email} required disabled={loading}
              placeholder="Email ou nome de usuário" autoComplete="username"
              onChange={e => setEmail(e.target.value)}
              onFocus={() => setFocus('email')} onBlur={() => setFocus(null)}
              style={inputStyle(focus === 'email')}
            />
          </div>
          <div style={{ position: 'relative', marginBottom: '.85rem' }}>
            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#52525b', display: 'flex', pointerEvents: 'none' }}>
              <LockIcon />
            </span>
            <input
              type={show ? 'text' : 'password'} value={pass} required disabled={loading}
              placeholder="Senha" autoComplete="current-password"
              onChange={e => setPass(e.target.value)}
              onFocus={() => setFocus('pass')} onBlur={() => setFocus(null)}
              style={{ ...inputStyle(focus === 'pass'), paddingRight: '2.8rem' }}
            />
            <button
              type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
              style={{ position: 'absolute', right: '.9rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none',
                color: '#52525b', cursor: 'pointer', display: 'flex', padding: 4, transition: 'color .15s' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#a78bfa' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#52525b' }}
            >
              {show ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', margin: '.4rem 0 1.5rem', fontSize: '.82rem' }}>
            <label onClick={() => setRemember(r => !r)} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', color: '#a1a1aa', cursor: 'pointer', userSelect: 'none' }}>
              <span style={{
                width: 18, height: 18, borderRadius: 6,
                border: `1px solid ${remember ? '#7c3aed' : 'rgba(139,92,246,0.35)'}`,
                background: remember ? '#7c3aed' : 'rgba(6,6,16,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
              }}>
                {remember && <CheckIcon />}
              </span>
              Lembrar de mim
            </label>
          </div>

          <button
            type="submit" disabled={loading}
            onMouseEnter={() => setHoverBtn(true)} onMouseLeave={() => setHoverBtn(false)}
            style={{
              width: '100%', height: 54, border: 'none', borderRadius: '.75rem', cursor: loading ? 'default' : 'pointer',
              fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: '.98rem', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.6rem',
              background: 'linear-gradient(100deg,#6d28d9,#7c3aed 45%,#9563e8)',
              boxShadow: hoverBtn && !loading
                ? '0 16px 40px rgba(124,58,237,0.58), inset 0 1px 0 rgba(255,255,255,0.22)'
                : '0 12px 32px rgba(124,58,237,0.42), inset 0 1px 0 rgba(255,255,255,0.15)',
              filter: hoverBtn && !loading ? 'brightness(1.08)' : 'none',
              opacity: loading ? 0.75 : 1,
              transition: 'box-shadow .18s, filter .18s',
            }}
          >
            {loading ? 'Entrando…' : (
              <>
                Entrar na plataforma
                <span style={{ transition: 'transform .18s', transform: hoverBtn ? 'translateX(4px)' : 'none' }}>→</span>
              </>
            )}
          </button>

          {err && <div style={{ marginTop: '.9rem', fontSize: '.8rem', color: 'var(--critical)' }}>{err}</div>}
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.6rem 0 1.2rem', color: '#52525b', fontSize: '.78rem' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(139,92,246,0.15)' }} />
          ou continue com
          <div style={{ flex: 1, height: 1, background: 'rgba(139,92,246,0.15)' }} />
        </div>

        <a
          href="/api/auth/microsoft"
          onMouseEnter={() => setHoverMs(true)} onMouseLeave={() => setHoverMs(false)}
          style={{
            height: 52, borderRadius: '.7rem',
            background: hoverMs ? 'rgba(124,58,237,0.08)' : 'rgba(6,6,16,0.6)',
            border: `1px solid ${hoverMs ? 'rgba(124,58,237,0.5)' : 'rgba(139,92,246,0.15)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.6rem', cursor: 'pointer',
            color: '#e5e7eb', fontSize: '.85rem', textDecoration: 'none', transition: 'all .15s',
          }}
        >
          <MicrosoftIcon size={18} /> Entrar com Microsoft
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem', justifyContent: 'center', marginTop: '1.8rem', fontSize: '.72rem', color: '#52525b' }}>
          <span style={{ color: '#a78bfa', display: 'flex' }}><ShieldIcon /></span>
          Acesso restrito a @porttus.com e @trustsis.com — eventos registrados.
        </div>
      </div>
    </aside>
  )
}

// ── Full split screen ─────────────────────────────────────────────────────────
function LoginScreen({ onLogin, ssoError }: { onLogin: (email: string, password: string) => Promise<void>; ssoError: string }) {
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    const check = () => setNarrow(window.innerWidth <= 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: narrow ? 'column' : 'row', height: '100vh', width: '100%', overflow: 'hidden',
      fontFamily: 'var(--mono)', color: '#e5e7eb',
    }}>
      <div style={{
        flex: narrow ? 'none' : 1, height: narrow ? '34vh' : undefined, minHeight: narrow ? 220 : undefined,
        position: 'relative', overflow: 'hidden', background: '#05050d',
      }}>
        <RadarStage />
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(120% 120% at 50% 50%, transparent 55%, rgba(5,5,13,0.7) 100%)',
        }} />
        <div style={{ position: 'absolute', top: '2rem', left: '2.2rem', zIndex: 3, display: 'flex', alignItems: 'center', gap: '.7rem' }}>
          <CrosshairIcon size={26} color="#a78bfa" strokeWidth={1.5} />
          <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '1.35rem', letterSpacing: '.05em', color: '#f5f5f5' }}>
            R<span style={{ color: '#a78bfa' }}>i</span>FT
          </span>
          <span style={{ width: 1, height: 20, background: 'rgba(139,92,246,0.3)' }} />
          <span style={{ fontSize: '.62rem', letterSpacing: '.3em', color: '#71717a' }}>AI PENTEST PLATFORM</span>
        </div>
        {!narrow && (
          <div style={{
            position: 'absolute', left: '2.2rem', bottom: '3.6rem', zIndex: 3, maxWidth: 340,
            fontFamily: FONT_DISPLAY, fontWeight: 500, fontSize: '1.05rem', lineHeight: 1.35, color: '#e5e7eb', letterSpacing: '.01em',
          }}>
            Pentest contínuo por <span style={{ color: '#a78bfa' }}>agentes de IA</span>.
          </div>
        )}
        <div style={{
          position: 'absolute', left: '2.2rem', bottom: '1.8rem', zIndex: 3, display: 'flex', alignItems: 'center', gap: '.55rem',
          fontSize: '.66rem', letterSpacing: '.2em', color: '#71717a',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 9px #22c55e', animation: 'loginPulseDot 2.4s ease-in-out infinite' }} />
          SISTEMA OPERACIONAL · ONLINE
        </div>
      </div>
      <LoginSide onLogin={onLogin} ssoError={ssoError} narrow={narrow} />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  return <Suspense><LoginPageInner /></Suspense>
}

function LoginPageInner() {
  const { login, refreshUser } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [ssoError, setSsoError] = useState('')
  // O código do SSO é de uso único: uma 2ª troca falha ("invalid_grant") e
  // mostraria um erro espúrio. Este guard garante que o callback seja processado
  // UMA vez, mesmo que o effect re-execute (re-render, StrictMode em dev).
  const exchangedRef = useRef(false)

  useEffect(() => {
    const code = searchParams.get('code')
    const err = searchParams.get('error')
    if (code) {
      if (exchangedRef.current) return
      exchangedRef.current = true
      // Troca o código de uso único por um cookie de sessão (nada trafega na URL).
      api.auth.exchange(code)
        .then(() => refreshUser())
        .then(() => router.replace('/dominios'))
        .catch(() => setSsoError(ERROR_MESSAGES['token_exchange_failed']))
    } else if (err) {
      setSsoError(ERROR_MESSAGES[err] || `Erro SSO: ${err}`)
    }
  }, [searchParams, router, refreshUser])

  const handleLogin = async (email: string, password: string) => {
    await login(email, password)
    router.replace('/dominios')
  }

  return <LoginScreen onLogin={handleLogin} ssoError={ssoError} />
}
