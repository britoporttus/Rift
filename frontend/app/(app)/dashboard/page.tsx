'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { api, Engagement } from '@/lib/api'
import { Plus, Target, AlertTriangle, Clock, Circle } from 'lucide-react'

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--low)',
  idle: 'var(--muted)',
  completed: 'var(--info)',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo',
  idle: 'Parado',
  completed: 'Concluído',
}

export default function DashboardPage() {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.engagements.list()
      .then(setEngagements)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const eng = await api.engagements.create({ name, target })
      setEngagements((prev) => [eng, ...prev])
      setShowForm(false); setName(''); setTarget('')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setCreating(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.5rem 0.75rem',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', fontSize: 14,
    outline: 'none', fontFamily: 'inherit',
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Engagements</h1>
        <button onClick={() => setShowForm(!showForm)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--purple)', border: 'none', borderRadius: 6,
          color: 'white', fontWeight: 600, fontSize: 13, padding: '0.5rem 1rem',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <Plus size={14} /> Novo Escopo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{
          background: 'var(--surface)', border: '1px solid var(--purple)',
          borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem',
          display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ color: 'var(--muted)', fontSize: 12, display: 'block', marginBottom: 4 }}>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cliente XYZ" required style={inputStyle} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ color: 'var(--muted)', fontSize: 12, display: 'block', marginBottom: 4 }}>Alvo</label>
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="target.com" required style={inputStyle} />
          </div>
          <button type="submit" disabled={creating} style={{
            background: 'var(--purple)', border: 'none', borderRadius: 6,
            color: 'white', fontWeight: 600, fontSize: 13, padding: '0.55rem 1rem',
            cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', height: 36,
          }}>
            {creating ? '...' : 'Criar'}
          </button>
          <button type="button" onClick={() => setShowForm(false)} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--muted)', fontSize: 13, padding: '0.55rem 0.75rem',
            cursor: 'pointer', fontFamily: 'inherit', height: 36,
          }}>
            Cancelar
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '3rem', fontSize: 13 }}>Carregando...</div>
      ) : engagements.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '3rem', textAlign: 'center', color: 'var(--muted)',
        }}>
          <Target size={32} style={{ margin: '0 auto 1rem', display: 'block', opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>Nenhum engagement ainda.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {engagements.map((e) => (
            <Link key={e.id} href={`/engagement/${e.id}`} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1.25rem',
                  cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={(ev) => (ev.currentTarget.style.borderColor = 'var(--purple)')}
                onMouseLeave={(ev) => (ev.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>{e.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 1 }}>{e.target}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: 12, flexShrink: 0 }}>
                  {e.phase && (
                    <div style={{ color: 'var(--purple-light)' }}>
                      {e.phase}{e.progress > 0 ? ` ${e.progress}%` : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--high)' }}>
                    <AlertTriangle size={12} />
                    {e.findingsCount}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Circle size={7} fill={STATUS_COLOR[e.status]} stroke="none" />
                    <span style={{ color: STATUS_COLOR[e.status] }}>{STATUS_LABEL[e.status] ?? e.status}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)', fontSize: 11 }}>
                    <Clock size={11} />
                    {new Date(e.createdAt).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
