'use client'
import { useEffect, useRef, useState } from 'react'
import { Cpu, ChevronDown, Check, Loader2 } from 'lucide-react'
import { api, AgentModelInfo } from '@/lib/api'

// Seletor global do modelo do agente (o "switch-model"). Vale para o PRÓXIMO run de
// qualquer engagement. Fica no header porque a msg de bloqueio por safeguard aponta
// para "o botão de modelo na tela do engagement".
export function ModelSwitcher({ disabled }: { disabled?: boolean }) {
  const [info, setInfo] = useState<AgentModelInfo | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.settings.getModel().then(setInfo).catch(() => setInfo(null))
  }, [])

  const currentOpt = info?.available.find((o) => o.id === info.current)
  const currentLabel = currentOpt?.label ?? info?.current ?? '—'

  async function pick(id: string) {
    if (!info || id === info.current) { setOpen(false); return }
    setSaving(true); setErr(null)
    try {
      const { current } = await api.settings.setModel(id)
      setInfo({ ...info, current })
      setOpen(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'falha ao trocar')
    } finally {
      setSaving(false)
    }
  }

  if (!info) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        title="Trocar o modelo de IA do agente (vale para o próximo run)"
        disabled={disabled}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--muted)', fontSize: 12, padding: '0.35rem 0.7rem',
          cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
        }}
      >
        {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Cpu size={13} />}
        <span style={{ color: 'var(--purple-light)', fontWeight: 600 }}>{currentLabel}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          {/* overlay para fechar ao clicar fora */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41,
            width: 320, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.45)', padding: 6,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
              color: 'var(--muted)', padding: '6px 8px 4px' }}>
              Modelo do agente
            </div>
            {info.available.map((o) => {
              const active = o.id === info.current
              return (
                <button key={o.id} onClick={() => pick(o.id)} disabled={saving} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
                  background: active ? 'rgba(124,58,237,.12)' : 'transparent', border: 'none',
                  borderRadius: 7, padding: '8px 8px', cursor: saving ? 'default' : 'pointer',
                  fontFamily: 'inherit', color: 'var(--text)',
                }}>
                  <div style={{ width: 16, flexShrink: 0, paddingTop: 2 }}>
                    {active && <Check size={14} color="var(--purple-light)" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{o.label}
                      <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--muted)', fontWeight: 400 }}>{o.id}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.35, marginTop: 1 }}>{o.note}</div>
                  </div>
                </button>
              )
            })}
            {err && <div style={{ fontSize: 11.5, color: 'var(--critical)', padding: '4px 8px' }}>{err}</div>}
            <div style={{ fontSize: 10.5, color: 'var(--muted)', padding: '6px 8px 4px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
              Aplica no próximo run. Opus costuma recusar pentest (safeguard).
            </div>
          </div>
        </>
      )}
    </div>
  )
}
