'use client'
// Integrações / abas de conexão (#5) — hub de ticketing. Configura destinos
// (GitHub Issues hoje; Jira/Azure "em breve") e testa a conexão. Só interno.
import { useState, useEffect, useCallback } from 'react'
import { api, IntegrationsData, Connection } from '@/lib/api'
import { Page, PageHeader, Card, Btn, Skeleton, EmptyState, inputStyle, tint } from '@/components/ui/kit'
import { Plug, Github, CheckCircle2, XCircle, Loader2, Trash2, Plus } from 'lucide-react'

export default function ConexoesPage() {
  const [data, setData] = useState<IntegrationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ label: '', owner: '', repo: '', token: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; detail: string }>>({})
  const [testing, setTesting] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.integrations.list().then(setData).catch(console.error).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    setErr(''); setSaving(true)
    try {
      await api.integrations.save({ type: 'github', label: form.label || undefined, config: { owner: form.owner, repo: form.repo }, token: form.token })
      setAdding(false); setForm({ label: '', owner: '', repo: '', token: '' })
      load()
    } catch (e) { setErr(e instanceof Error ? e.message : 'erro') } finally { setSaving(false) }
  }
  async function test(c: Connection) {
    setTesting(c.id)
    try { const r = await api.integrations.test(c.id); setTestResult((p) => ({ ...p, [c.id]: r })) }
    catch { setTestResult((p) => ({ ...p, [c.id]: { ok: false, detail: 'falha' } })) }
    finally { setTesting(null) }
  }
  async function remove(c: Connection) {
    if (!confirm(`Remover a conexão "${c.label || c.type}"?`)) return
    await api.integrations.remove(c.id).catch(() => {}); load()
  }

  return (
    <Page max={860}>
      <PageHeader
        icon={<Plug size={19} color="var(--purple-light)" />}
        title="Conexões"
        subtitle="Envie achados para o seu ticketing. Cada achado vira um ticket com severidade, alvo, evidência e correção."
        actions={!adding && data?.catalog.some((c) => c.available) ? <Btn variant="primary" onClick={() => setAdding(true)}><Plus size={14} /> Conectar GitHub</Btn> : undefined}
      />

      {loading ? <Skeleton h={120} count={2} /> : !data ? null : (
        <>
          {adding && (
            <Card pad="1.3rem 1.4rem">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <Github size={18} color="var(--purple-light)" />
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Conectar GitHub Issues</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <L label="Owner (org/usuário)"><input style={{ ...inputStyle, width: '100%', fontFamily: 'var(--mono)' }} placeholder="britoporttus" value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} /></L>
                  <L label="Repositório"><input style={{ ...inputStyle, width: '100%', fontFamily: 'var(--mono)' }} placeholder="Rift" value={form.repo} onChange={(e) => setForm((f) => ({ ...f, repo: e.target.value }))} /></L>
                </div>
                <L label="Rótulo (opcional)"><input style={{ ...inputStyle, width: '100%' }} placeholder="GitHub do Rift" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} /></L>
                <L label="Token (fine-grained, escopo Issues)" hint="fica cifrado; nunca é exibido de volta"><input type="password" style={{ ...inputStyle, width: '100%', fontFamily: 'var(--mono)' }} placeholder="github_pat_…" value={form.token} onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))} /></L>
                {err && <div style={{ fontSize: 12, color: 'var(--critical)' }}>{err}</div>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn variant="primary" onClick={save} disabled={saving || !form.owner || !form.repo || !form.token}>{saving ? <Loader2 size={14} className="spin" /> : <Plug size={14} />} Salvar conexão</Btn>
                  <Btn variant="subtle" onClick={() => { setAdding(false); setErr('') }}>Cancelar</Btn>
                </div>
              </div>
            </Card>
          )}

          {data.connections.length === 0 && !adding ? (
            <EmptyState icon={<Plug size={34} />} title="Nenhuma conexão ainda." hint="Conecte um GitHub para transformar achados em issues automaticamente." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.connections.map((c) => {
                const t = testResult[c.id]
                return (
                  <Card key={c.id} pad="1rem 1.2rem">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Github size={18} color="var(--muted)" />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{c.label || c.type}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-mute)', fontFamily: 'var(--mono)' }}>{c.config.owner}/{c.config.repo} · {c.configured ? 'token configurado' : 'sem token'}</div>
                      </div>
                      {t && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: t.ok ? 'var(--low)' : 'var(--critical)' }}>
                          {t.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {t.detail}
                        </span>
                      )}
                      <Btn variant="subtle" onClick={() => test(c)} disabled={testing === c.id}>{testing === c.id ? <Loader2 size={13} className="spin" /> : 'Testar'}</Btn>
                      <button onClick={() => remove(c)} title="Remover" style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: 'pointer' }}><Trash2 size={13} /></button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Catálogo — o que existe e o que vem */}
          <Card pad="1rem 1.2rem">
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Destinos</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {data.catalog.map((a) => (
                <span key={a.id} style={{ fontSize: 11.5, color: a.available ? 'var(--text)' : 'var(--text-dim)', background: a.available ? tint('var(--purple)', 10) : 'var(--bg)', border: `1px solid ${a.available ? 'var(--border-mid)' : 'var(--border)'}`, borderRadius: 6, padding: '4px 10px' }}>
                  {a.label}{!a.available && ' · em breve'}
                </span>
              ))}
            </div>
          </Card>
        </>
      )}
    </Page>
  )
}

function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{label}{hint && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> · {hint}</span>}</span>
      {children}
    </label>
  )
}
