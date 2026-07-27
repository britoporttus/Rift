'use client'
import { useState } from 'react'
import { api, Engagement, EngagementSchedule } from '@/lib/api'
import { X, Clock, Play, AlertTriangle, Check } from 'lucide-react'

const DEFAULTS: EngagementSchedule = {
  enabled: false, frequency: 'weekly', phases: 'full', autoExploit: false,
  costCeilingUsd: 5, nextRunAt: null, lastRunAt: null, lastRunStatus: null,
}

const PHASE_LABEL: Record<string, string> = {
  recon: 'Só recon (passivo)',
  recon_enum: 'Recon + enumeração',
  full: 'Completo (até o relatório)',
}
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  running:         { label: 'Em execução', color: 'var(--info)' },
  completed:       { label: 'Concluído',   color: 'var(--low)' },
  budget_exceeded: { label: 'Teto de custo atingido', color: 'var(--medium)' },
  error:           { label: 'Erro',        color: 'var(--critical)' },
}

function fmt(d?: string | null) {
  if (!d) return '—'
  const t = new Date(d)
  return isNaN(t.getTime()) ? '—' : t.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function ScheduleSettings({ engagement, onClose, onUpdated }: {
  engagement: Engagement
  onClose: () => void
  onUpdated: (e: Engagement) => void
}) {
  const [sch, setSch] = useState<EngagementSchedule>({ ...DEFAULTS, ...(engagement.schedule || {}) })
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  function patch(p: Partial<EngagementSchedule>) { setSch(s => ({ ...s, ...p })); setSaved(false) }

  async function save() {
    setSaving(true); setErr('')
    try {
      const updated = await api.engagements.setSchedule(engagement.id, {
        enabled: sch.enabled, frequency: sch.frequency, phases: sch.phases,
        autoExploit: sch.autoExploit, costCeilingUsd: sch.costCeilingUsd,
      })
      onUpdated(updated)
      if (updated.schedule) setSch(s => ({ ...s, ...updated.schedule }))
      setSaved(true)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  async function runNow() {
    if (!confirm('Disparar um scan agora? O agente vai rodar em background no alvo autorizado.')) return
    setRunning(true); setErr('')
    try { await api.engagements.runNow(engagement.id) }
    catch (e) { setErr(e instanceof Error ? e.message : 'Erro ao iniciar') }
    finally { setRunning(false) }
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
        width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* header */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock size={16} color="var(--purple-light)" />
          <span style={{ flex: 1, color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>Agendamento de scans</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* enabled toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={sch.enabled} onChange={e => patch({ enabled: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: 'var(--purple)' }} />
            <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
              Monitoramento contínuo ativo
            </span>
          </label>

          <div>
            <label style={labelStyle}>Frequência</label>
            <select value={sch.frequency} onChange={e => patch({ frequency: e.target.value as EngagementSchedule['frequency'] })} style={selectStyle}>
              <option value="weekly">Semanal</option>
              <option value="daily">Diário</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Fases executadas</label>
            <select value={sch.phases} onChange={e => patch({ phases: e.target.value as EngagementSchedule['phases'] })} style={selectStyle}>
              {Object.entries(PHASE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Teto de custo por execução (US$)</label>
            <input type="number" min={0.5} max={100} step={0.5} value={sch.costCeilingUsd}
              onChange={e => patch({ costCeilingUsd: parseFloat(e.target.value) || 0 })} style={selectStyle} />
            <span style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4, display: 'block' }}>
              O agente é encerrado se o custo ultrapassar este valor. Um fluxo completo pode exigir mais que US$ 5.
            </span>
          </div>

          {/* autoExploit — destacado como ação de risco */}
          <div style={{ border: '1px solid color-mix(in srgb, var(--high) 20%, transparent)', background: 'color-mix(in srgb, var(--high) 6%, transparent)', borderRadius: 8, padding: '10px 12px' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={sch.autoExploit} onChange={e => patch({ autoExploit: e.target.checked })}
                style={{ width: 16, height: 16, marginTop: 1, accentColor: 'var(--high)' }} />
              <span>
                <span style={{ fontSize: 13, color: 'var(--high)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertTriangle size={13} /> Exploração autônoma sem aprovação
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'block' }}>
                  Desligado (recomendado): para nos checkpoints críticos (RCE/SQLi) e registra para o admin aprovar.
                  Ligado: o agente explora ativamente sozinho, sem supervisão.
                </span>
              </span>
            </label>
          </div>

          {/* status */}
          {(sch.lastRunAt || sch.nextRunAt) && (
            <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {status && <div>Último status: <span style={{ color: status.color, fontWeight: 600 }}>{status.label}</span></div>}
              <div>Última execução: {fmt(sch.lastRunAt)}</div>
              {sch.enabled && <div>Próxima execução: {fmt(sch.nextRunAt)}</div>}
            </div>
          )}

          {err && <div style={{ fontSize: 12, color: 'var(--critical)' }}>{err}</div>}

          {/* actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={save} disabled={saving} style={{
              flex: 1, background: 'var(--purple)', border: 'none', borderRadius: 8, color: 'white',
              fontSize: 13, fontWeight: 600, padding: '0.6rem', cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              {saved ? <><Check size={14} /> Salvo</> : saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={runNow} disabled={running} style={{
              background: 'rgba(124,58,237,.12)', border: '1px solid var(--purple)', borderRadius: 8,
              color: 'var(--purple-light)', fontSize: 13, fontWeight: 600, padding: '0.6rem 1rem',
              cursor: running ? 'default' : 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Play size={14} /> {running ? 'Iniciando...' : 'Rodar agora'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
