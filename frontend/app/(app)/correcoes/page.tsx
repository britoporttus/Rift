'use client'
// Kanban de correção (evolução das Fases 5+6, pedido do operador 2026-08-10).
// O técnico arrasta o achado entre estados, assume como dono e põe prazo — estilo
// Azure DevOps. O gestor observa o fluxo. Drag-and-drop nativo (sem lib).
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, KanbanBoardData, BoardCard, BoardColumn, RemediationStatus } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { SEV_COLOR } from '@/lib/severity'
import { Page, PageHeader, Skeleton, EmptyState, tint } from '@/components/ui/kit'
import { KanbanSquare, Globe, User as UserIcon, Calendar, AlertTriangle } from 'lucide-react'

const COLS: { key: BoardColumn; label: string; color: string }[] = [
  { key: 'open',          label: 'Aberto',      color: 'var(--high)' },
  { key: 'in_progress',   label: 'Em correção', color: 'var(--purple-light)' },
  { key: 'fixed',         label: 'Corrigido',   color: 'var(--low)' },
  { key: 'accepted_risk', label: 'Risco aceito',color: 'var(--muted)' },
]
const SEV_WORD: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa', info: 'Info' }
// Transições que o operador pode fazer (espelha canTransition do backend).
const ALLOWED: Record<string, BoardColumn[]> = {
  open:          ['in_progress', 'fixed', 'accepted_risk'],
  in_progress:   ['fixed', 'accepted_risk', 'open'],
  fixed:         ['open', 'accepted_risk'],
  accepted_risk: ['open', 'in_progress'],
  regressed:     ['in_progress', 'fixed', 'accepted_risk'],
}
function colToStatus(col: BoardColumn): RemediationStatus { return col }

function relDue(iso: string): { text: string; overdue: boolean } {
  const d = Math.round((new Date(iso).getTime() - Date.now()) / 86400000)
  if (d < 0) return { text: `${-d}d atrasado`, overdue: true }
  if (d === 0) return { text: 'vence hoje', overdue: false }
  return { text: `${d}d`, overdue: false }
}

export default function CorrecoesPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [board, setBoard] = useState<KanbanBoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<'all' | 'mine'>('all')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragFrom, setDragFrom] = useState<BoardColumn | null>(null)
  const [overCol, setOverCol] = useState<BoardColumn | null>(null)
  const meName = user?.name || null

  const load = useCallback((sc: 'all' | 'mine') => {
    setLoading(true)
    api.overview.board(sc).then(setBoard).catch(console.error).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load(scope) }, [load, scope])

  // Move otimista: atualiza a UI na hora e persiste; reverte no erro.
  async function move(card: BoardCard, from: BoardColumn, to: BoardColumn) {
    if (from === to) return
    const status = card.remediationStatus
    if (!(ALLOWED[status] || []).includes(to)) return   // transição inválida — ignora
    setBoard((prev) => {
      if (!prev) return prev
      const cols = { ...prev.columns }
      cols[from] = cols[from].filter((c) => c.id !== card.id)
      cols[to] = [{ ...card, remediationStatus: colToStatus(to) }, ...cols[to]]
      return { columns: cols, counts: { ...prev.counts, [from]: cols[from].length, [to]: cols[to].length } }
    })
    try { await api.findings.setStatus(card.id, { remediationStatus: colToStatus(to) }) }
    catch (e) { alert(e instanceof Error ? e.message : 'Erro ao mover'); load(scope) }
  }

  async function assumeOwner(card: BoardCard, e: React.MouseEvent) {
    e.stopPropagation()
    if (!meName) return
    setBoard((prev) => prev && ({ ...prev, columns: Object.fromEntries(
      Object.entries(prev.columns).map(([k, v]) => [k, v.map((c) => c.id === card.id ? { ...c, owner: meName } : c)])
    ) as KanbanBoardData['columns'] }))
    try { await api.findings.setStatus(card.id, { owner: meName }) }
    catch { load(scope) }
  }

  async function setDue(card: BoardCard, value: string, e: React.ChangeEvent) {
    e.stopPropagation()
    const iso = value ? new Date(value).toISOString() : null
    setBoard((prev) => prev && ({ ...prev, columns: Object.fromEntries(
      Object.entries(prev.columns).map(([k, v]) => [k, v.map((c) => c.id === card.id ? { ...c, dueDate: iso } : c)])
    ) as KanbanBoardData['columns'] }))
    try { await api.findings.setStatus(card.id, { dueDate: iso }) }
    catch { load(scope) }
  }

  return (
    <Page max={1400}>
      <PageHeader
        icon={<KanbanSquare size={19} color="var(--purple-light)" />}
        title="Quadro de correções"
        subtitle="Arraste o achado entre os estados, assuma como responsável e defina o prazo. O gestor acompanha o fluxo."
        actions={
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: 3 }}>
            {(['all', 'mine'] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)} style={{
                fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                background: scope === s ? 'var(--purple)' : 'transparent', color: scope === s ? '#fff' : 'var(--muted)',
              }}>{s === 'all' ? 'Todos' : 'Meus'}</button>
            ))}
          </div>
        }
      />

      {loading ? (
        <Skeleton h={340} count={1} />
      ) : !board ? (
        <EmptyState icon={<KanbanSquare size={34} />} title="Sem achados para o quadro." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS.length}, minmax(240px, 1fr))`, gap: 14, alignItems: 'start', overflowX: 'auto', paddingBottom: 8 }}>
          {COLS.map((col) => {
            const cards = board.columns[col.key] || []
            const isOver = overCol === col.key
            const canDrop = dragFrom != null && dragId != null && (ALLOWED[board.columns[dragFrom]?.find((c) => c.id === dragId)?.remediationStatus || 'open'] || []).includes(col.key)
            return (
              <div key={col.key}
                onDragOver={(e) => { if (canDrop) { e.preventDefault(); setOverCol(col.key) } }}
                onDragLeave={() => setOverCol((c) => c === col.key ? null : c)}
                onDrop={(e) => {
                  e.preventDefault(); setOverCol(null)
                  if (!dragId || !dragFrom) return
                  const card = board.columns[dragFrom]?.find((c) => c.id === dragId)
                  if (card) move(card, dragFrom, col.key)
                  setDragId(null); setDragFrom(null)
                }}
                style={{
                  background: isOver && canDrop ? 'var(--surface2)' : 'var(--panel)',
                  border: `1px solid ${isOver && canDrop ? col.color : 'var(--border)'}`,
                  borderRadius: 10, padding: 10, minHeight: 320, transition: 'border-color .12s, background .12s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 12px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.02em' }}>{col.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-mute)', background: 'var(--surface)', borderRadius: 20, padding: '1px 8px' }}>{cards.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cards.map((card) => {
                    const c = SEV_COLOR[card.severity]
                    const due = card.dueDate ? relDue(card.dueDate) : null
                    const regressed = card.remediationStatus === 'regressed'
                    const mine = card.owner && card.owner === meName
                    return (
                      <div key={card.id} draggable
                        onDragStart={() => { setDragId(card.id); setDragFrom(col.key) }}
                        onDragEnd={() => { setDragId(null); setDragFrom(null); setOverCol(null) }}
                        onClick={() => card.engagementId && router.push(`/engagement/${card.engagementId}?tab=findings`)}
                        style={{
                          background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${c}`,
                          borderRadius: 8, padding: '10px 11px', cursor: 'grab', opacity: dragId === card.id ? 0.4 : 1,
                        }}>
                        <div style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500, lineHeight: 1.35, marginBottom: 7 }}>{card.title}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: c, background: tint(c, 13), border: `1px solid ${tint(c, 30)}`, borderRadius: 4, padding: '1px 6px' }}>{SEV_WORD[card.severity]}</span>
                          {regressed && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--critical)', background: tint('var(--critical)', 13), border: `1px solid ${tint('var(--critical)', 30)}`, borderRadius: 4, padding: '1px 6px' }}>REGREDIU</span>}
                          {card.target && <span style={{ fontSize: 10.5, color: 'var(--purple-light)', display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'var(--mono)' }}><Globe size={10} />{card.target}</span>}
                        </div>
                        {card.location && <div style={{ fontSize: 10, color: 'var(--text-mute)', fontFamily: 'var(--mono)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.location}</div>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {/* Dono */}
                          {card.owner ? (
                            <span style={{ fontSize: 10.5, color: mine ? 'var(--purple-light)' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <UserIcon size={10} />{card.owner}{mine ? ' (você)' : ''}
                            </span>
                          ) : (
                            <button onClick={(e) => assumeOwner(card, e)} disabled={!meName}
                              style={{ fontSize: 10, fontWeight: 600, color: 'var(--purple-light)', background: 'var(--purple-dim)', border: '1px solid var(--border-mid)', borderRadius: 5, padding: '2px 7px', cursor: 'pointer', fontFamily: 'inherit' }}>
                              Assumir
                            </button>
                          )}
                          {/* Prazo */}
                          <label onClick={(e) => e.stopPropagation()} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', position: 'relative' }}
                            title="Definir prazo">
                            <Calendar size={11} color={due?.overdue ? 'var(--critical)' : 'var(--text-mute)'} />
                            {due ? (
                              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: due.overdue ? 'var(--critical)' : 'var(--text-mute)' }}>{due.text}</span>
                            ) : (
                              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>prazo</span>
                            )}
                            <input type="date" onChange={(e) => setDue(card, e.target.value, e)}
                              defaultValue={card.dueDate ? card.dueDate.slice(0, 10) : ''}
                              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }} />
                          </label>
                        </div>
                      </div>
                    )
                  })}
                  {cards.length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', padding: '18px 0', fontStyle: 'italic' }}>
                      {isOver && canDrop ? 'soltar aqui' : '—'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {board && (
        <div style={{ fontSize: 11.5, color: 'var(--text-mute)', display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
          <AlertTriangle size={12} /> Só achados acionáveis (vulnerabilidade ou indício) entram no quadro — observações informativas ficam de fora.
        </div>
      )}
    </Page>
  )
}
