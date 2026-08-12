'use client'
// Sistema de toast enxuto (A4) — notificação transitória no canto, colorida por
// severidade. Criado para os eventos de monitoramento (#2b) avisarem em tempo
// (quase) real, sem puxar lib de animação (só CSS). Uso: useToast().push({...}).
import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { SEV_COLOR } from '@/lib/severity'
import { X } from 'lucide-react'

export interface ToastInput {
  severity?: string
  title: string
  detail?: string | null
  onClick?: () => void
  ttl?: number   // ms até sumir; 0 = fica até fechar no X
}
interface Toast extends ToastInput { id: number }

const Ctx = createContext<{ push: (t: ToastInput) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const remove = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])

  const push = useCallback((t: ToastInput) => {
    const id = ++seq.current
    // no máximo 5 na tela — descarta os mais antigos além disso.
    setToasts((ts) => [...ts.slice(-4), { ...t, id }])
    const ttl = t.ttl ?? 7000
    if (ttl > 0) setTimeout(() => remove(id), ttl)
  }, [remove])

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div style={{
        position: 'fixed', bottom: 18, right: 18, zIndex: 1000,
        display: 'flex', flexDirection: 'column', gap: 10, width: 340, maxWidth: 'calc(100vw - 36px)',
        pointerEvents: 'none',
      }}>
        {toasts.map((t) => {
          const color = SEV_COLOR[t.severity || 'info'] || SEV_COLOR.info
          return (
            <div key={t.id} role="status"
              onClick={() => { t.onClick?.(); remove(t.id) }}
              style={{
                pointerEvents: 'auto', cursor: t.onClick ? 'pointer' : 'default',
                background: 'var(--raised)', border: '1px solid var(--border-mid)',
                borderLeft: `3px solid ${color}`, borderRadius: 10,
                padding: '11px 12px 11px 13px', boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
                display: 'flex', gap: 10, alignItems: 'flex-start',
                animation: 'toastIn .28s cubic-bezier(.2,.8,.2,1)',
              }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: color, marginTop: 5, flexShrink: 0, boxShadow: `0 0 8px ${color}` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.35 }}>{t.title}</div>
                {t.detail && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4, wordBreak: 'break-word' }}>{t.detail}</div>}
              </div>
              <button onClick={(e) => { e.stopPropagation(); remove(t.id) }} aria-label="Fechar"
                style={{ background: 'none', border: 'none', color: 'var(--text-mute)', cursor: 'pointer', padding: 0, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <X size={13} />
              </button>
            </div>
          )
        })}
      </div>
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}`}</style>
    </Ctx.Provider>
  )
}

// No-op fora do provider — nunca quebra um componente que chame useToast() solto.
export function useToast() {
  return useContext(Ctx) || { push: () => {} }
}
