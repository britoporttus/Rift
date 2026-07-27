'use client'
import { useState } from 'react'
import { api, DomainDetail, DomainSchedule } from '@/lib/api'
import { X, Clock, Check } from 'lucide-react'

const DEFAULTS: DomainSchedule = {
  enabled: false, frequency: 'weekly', nextRunAt: null, lastRunAt: null, lastRunStatus: null,
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  completed: { label: 'Concluído', color: 'var(--low)' },
  error:     { label: 'Erro',      color: 'var(--critical)' },
}

function fmt(d?: string | null) {
  if (!d) return '—'
  const t = new Date(d)
  return isNaN(t.getTime()) ? '—' : t.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function DomainScheduleSettings({ domain, onClose, onUpdated }: {
  domain: DomainDetail
  onClose: () => void
  onUpdated: (d: DomainDetail) => void
}) {
  const [sch, setSch] = useState<DomainSchedule>({ ...DEFAULTS, ...(domain.schedule || {}) })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  function patch(p: Partial<DomainSchedule>) { setSch(s => ({ ...s, ...p })); setSaved(false) }

  async function save() {
    setSaving(true); setErr('')
    try {
      const updated = await api.domains.setSchedule(domain.id, { enabled: sch.enabled, frequency: sch.frequency })
      onUpdated(updated)
      if (updated.schedule) setSch(s => ({ ...s, ...updated.schedule }))
      setSaved(true)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }
  const selectStyle: React.CSSProperties = {
    width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text)', fontSize: 13, padding: '8px 10px', fontFamily: 'inherit',
  }
  const status = sch.lastRunStatus ? STATUS_LABEL[sch.lastRunStatus] : null

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock size={16} color="var(--purple-light)" />
          <span style={{ flex: 1, color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>Monitoramento contínuo</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={sch.enabled} onChange={e => patch({ enabled: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: 'var(--purple)' }} />
            <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
              Re-escanear este domínio automaticamente
            </span>
          </label>
          <span style={{ fontSize: 11.5, color: 'var(--text-mute)', marginTop: -10 }}>
            Scan passivo (+ probe ativo, se autorizado) recorrente. A cada execução, o Rift mostra o que mudou desde a anterior (novo/sumido + variação de score).
          </span>

          <div>
            <label style={labelStyle}>Frequência</label>
            <select value={sch.frequency} onChange={e => patch({ frequency: e.target.value as DomainSchedule['frequency'] })} style={selectStyle}>
              <option value="weekly">Semanal</option>
              <option value="daily">Diário</option>
            </select>
          </div>

          {(sch.lastRunAt || sch.nextRunAt) && (
            <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {status && <div>Último status: <span style={{ color: status.color, fontWeight: 600 }}>{status.label}</span></div>}
              <div>Última execução: {fmt(sch.lastRunAt)}</div>
              {sch.enabled && <div>Próxima execução: {fmt(sch.nextRunAt)}</div>}
            </div>
          )}

          {err && <div style={{ fontSize: 12, color: 'var(--critical)' }}>{err}</div>}

          <button onClick={save} disabled={saving} style={{
            background: 'var(--purple)', border: 'none', borderRadius: 8, color: 'white',
            fontSize: 13, fontWeight: 600, padding: '0.6rem', cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {saved ? <><Check size={14} /> Salvo</> : saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
