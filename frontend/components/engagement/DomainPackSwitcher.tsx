'use client'
import { useEffect, useRef, useState } from 'react'
import { Boxes, ChevronDown, Check, Loader2, Clock, Globe, Network } from 'lucide-react'
import { api, Engagement, DomainPackInfo } from '@/lib/api'

// Seletor do DOMAIN PACK do módulo de pentest, POR ENGAGEMENT (ETAPA 0 do roadmap
// multi-domínio). Ortogonal ao FrameworkSwitcher (versão do tronco) e ao ModelSwitcher
// (modelo LLM): aqui escolhe-se o DOMÍNIO (web/azure/ad/sap). Hoje só 'web' roda; os
// demais aparecem desabilitados ("em breve") espelhando as ETAPAs 1-3 do roadmap.
// Persiste em Engagement.domainPackId (PATCH) e vale para o próximo run.
export function DomainPackSwitcher({
  engagement,
  onUpdated,
  disabled,
}: {
  engagement: Engagement
  onUpdated: (e: Engagement) => void
  disabled?: boolean
}) {
  const [info, setInfo] = useState<DomainPackInfo | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.settings.getDomainPacks().then(setInfo).catch(() => setInfo(null))
  }, [])

  if (!info) return null

  // Engagements antigos não têm domainPackId → tratam como o default ('web').
  const currentId = engagement.domainPackId || info.default
  const currentOpt = info.available.find((o) => o.id === currentId)
  const currentLabel = currentOpt?.label ?? currentId

  async function pick(id: string) {
    if (id === currentId) { setOpen(false); return }
    setSaving(true); setErr(null)
    try {
      const updated = await api.engagements.update(engagement.id, { domainPackId: id })
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
        title="Domínio do teste (web/cloud/AD/SAP) para este engagement — vale para o próximo run"
        disabled={disabled}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--muted)', fontSize: 12, padding: '0.35rem 0.7rem',
          cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
        }}
      >
        {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Boxes size={13} />}
        <span style={{ color: 'var(--purple-light)', fontWeight: 600 }}>{currentLabel}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          {/* overlay para fechar ao clicar fora */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41,
            width: 360, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.45)', padding: 6,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
              color: 'var(--muted)', padding: '6px 8px 4px' }}>
              Domínio do teste (deste engagement)
            </div>
            {info.available.map((o) => {
              const active = o.id === currentId
              const planned = !o.available
              const PosIcon = o.position === 'network' ? Network : Globe
              return (
                <button key={o.id} onClick={() => !planned && pick(o.id)} disabled={saving || planned} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', textAlign: 'left',
                  background: active ? 'rgba(124,58,237,.12)' : 'transparent', border: 'none',
                  borderRadius: 7, padding: '8px 8px',
                  cursor: planned ? 'not-allowed' : (saving ? 'default' : 'pointer'),
                  fontFamily: 'inherit', color: 'var(--text)', opacity: planned ? 0.5 : 1,
                }}>
                  <div style={{ width: 16, flexShrink: 0, paddingTop: 2 }}>
                    {active && <Check size={14} color="var(--purple-light)" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {o.label}
                      <PosIcon size={11} color="var(--muted)" />
                      {planned && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--purple-light)', fontWeight: 600 }}>
                          <Clock size={11} /> em breve
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
              Núcleo único + domain packs (roadmap multi-domínio). Só o pack Web roda hoje.
            </div>
          </div>
        </>
      )}
    </div>
  )
}
