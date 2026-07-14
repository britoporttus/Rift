'use client'
import { useEffect, useRef, useState } from 'react'
import { Layers, ChevronDown, Check, Loader2, AlertTriangle } from 'lucide-react'
import { api, Engagement, FrameworkInfo } from '@/lib/api'

// Seletor da VERSÃO do agente (A/B/C) POR ENGAGEMENT. Diferente do ModelSwitcher
// (que é o modelo LLM, global): aqui escolhe-se qual framework de pentest roda neste
// engagement. Persiste em Engagement.frameworkId (PATCH) e vale para o próximo run.
export function FrameworkSwitcher({
  engagement,
  onUpdated,
  disabled,
}: {
  engagement: Engagement
  onUpdated: (e: Engagement) => void
  disabled?: boolean
}) {
  const [info, setInfo] = useState<FrameworkInfo | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.settings.getFrameworks().then(setInfo).catch(() => setInfo(null))
  }, [])

  if (!info) return null

  // Engagements antigos não têm frameworkId → tratam como o default ('v2').
  const currentId = engagement.frameworkId || info.default
  const currentOpt = info.available.find((o) => o.id === currentId)
  const currentLabel = currentOpt?.label ?? currentId

  async function pick(id: string) {
    if (id === currentId) { setOpen(false); return }
    setSaving(true); setErr(null)
    try {
      const updated = await api.engagements.update(engagement.id, { frameworkId: id })
      onUpdated(updated)
      setOpen(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'falha ao trocar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        title="Trocar a versão do agente de pentest para este engagement (vale para o próximo run)"
        disabled={disabled}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--muted)', fontSize: 12, padding: '0.35rem 0.7rem',
          cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
        }}
      >
        {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Layers size={13} />}
        <span style={{ color: 'var(--purple-light)', fontWeight: 600 }}>{currentLabel}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          {/* overlay para fechar ao clicar fora */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41,
            width: 340, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.45)', padding: 6,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
              color: 'var(--muted)', padding: '6px 8px 4px' }}>
              Versão do agente (deste engagement)
            </div>
            {info.available.map((o) => {
              const active = o.id === currentId
              const unavailable = !o.available
              return (
                <button key={o.id} onClick={() => !unavailable && pick(o.id)} disabled={saving || unavailable} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
                  background: active ? 'rgba(124,58,237,.12)' : 'transparent', border: 'none',
                  borderRadius: 7, padding: '8px 8px',
                  cursor: unavailable ? 'not-allowed' : (saving ? 'default' : 'pointer'),
                  fontFamily: 'inherit', color: 'var(--text)', opacity: unavailable ? 0.45 : 1,
                }}>
                  <div style={{ width: 16, flexShrink: 0, paddingTop: 2 }}>
                    {active && <Check size={14} color="var(--purple-light)" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {o.label}
                      <span style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 400 }}>{o.id}</span>
                      {unavailable && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--high)', fontWeight: 600 }}>
                          <AlertTriangle size={11} /> indisponível
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.35, marginTop: 1 }}>{o.note}</div>
                  </div>
                </button>
              )
            })}
            {err && <div style={{ fontSize: 11.5, color: 'var(--critical)', padding: '4px 8px' }}>{err}</div>}
            <div style={{ fontSize: 10.5, color: 'var(--muted)', padding: '6px 8px 4px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
              Aplica no próximo run. Findings de qualquer versão aparecem aqui e no banco.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
