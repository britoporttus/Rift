'use client'
// Seletor de profundidade no topbar (Fase 6). Operador interno alterna entre as
// três visões; cliente vê a sua como um rótulo fixo (sem troca).
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { canSwitchDepth, effectiveDepth, setDepthOverride, homeForDepth, DEPTH_LABEL, DEPTH_HINT } from '@/lib/depth'
import type { Depth } from '@/lib/api'
import { Layers, Check, ChevronDown } from 'lucide-react'

const DEPTHS: Depth[] = ['tecnico', 'gestor', 'diretor']

export function DepthSwitcher() {
  const { user } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState<Depth>('tecnico')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setCur(effectiveDepth(user)) }, [user])
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  if (!user) return null
  const switchable = canSwitchDepth(user)

  function choose(d: Depth) {
    setDepthOverride(d)
    setCur(d)
    setOpen(false)
    router.push(homeForDepth(d))
  }

  // Cliente: rótulo estático (não alterna).
  if (!switchable) {
    return (
      <div title={`Visão ${DEPTH_LABEL[cur]}`} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--muted)',
        padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)',
      }}>
        <Layers size={13} /> Visão {DEPTH_LABEL[cur]}
      </div>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
          color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--border-mid)',
          padding: '5px 10px', borderRadius: 7, fontFamily: 'inherit',
        }}>
        <Layers size={13} color="var(--purple-light)" /> {DEPTH_LABEL[cur]}
        <ChevronDown size={12} style={{ opacity: 0.6 }} />
      </button>
      {open && (
        <div role="listbox" style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40, width: 232,
          background: 'var(--surface)', border: '1px solid var(--border-mid)', borderRadius: 9,
          boxShadow: '0 12px 34px rgba(0,0,0,0.5)', overflow: 'hidden', padding: 4,
        }}>
          {DEPTHS.map((d) => {
            const active = d === cur
            return (
              <button key={d} role="option" aria-selected={active} onClick={() => choose(d)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'flex-start', gap: 9, textAlign: 'left',
                  padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                  background: active ? 'var(--purple-dim)' : 'transparent', border: 'none',
                  color: active ? 'var(--purple-light)' : 'var(--text)',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ width: 14, flexShrink: 0, marginTop: 2 }}>{active && <Check size={13} />}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{DEPTH_LABEL[d]}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-mute)', marginTop: 1 }}>{DEPTH_HINT[d]}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
