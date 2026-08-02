'use client'
import { Fragment, useEffect, useState } from 'react'
import { api, UserFull } from '@/lib/api'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { SI } from '@/components/ui/SI'

const UserIco     = (s?: number, c?: string) => <SI s={s || 12} c={c || 'var(--muted)'}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></SI>
const CircleIco   = (s?: number, c?: string) => <SI s={s || 12} c={c || 'var(--muted)'}><circle cx="12" cy="12" r="10" /></SI>
const KeyIco      = (s?: number, c?: string) => <SI s={s || 12} c={c}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></SI>
const UserPlusIco = (s?: number, c?: string) => <SI s={s || 13} c={c || 'white'}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></SI>
const PencilIco   = (s?: number, c?: string) => <SI s={s || 12} c={c}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></SI>
const TrashIco    = (s?: number, c?: string) => <SI s={s || 12} c={c}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></SI>
const CheckIco    = (s?: number, c?: string) => <SI s={s || 12} c={c}><polyline points="20 6 9 17 4 12" /></SI>
const XIco        = (s?: number, c?: string) => <SI s={s || 12} c={c} sw={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></SI>

function MicrosoftLogo() {
  return (
    <svg width={9} height={9} viewBox="0 0 21 21" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(2,2,8,0.9)', border: '1px solid var(--border-mid)', borderRadius: 5,
  color: 'var(--text)', fontSize: 12, padding: '4px 8px', outline: 'none', fontFamily: 'inherit',
  width: '100%',
}

function ActionBtn({ onClick, title, bg, border, color, children }: {
  onClick: () => void; title?: string
  bg: string; border: string; color: string
  children: React.ReactNode
}) {
  return (
    <button onClick={onClick} title={title}
      style={{
        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bg, border: `1px solid ${border}`,
        borderRadius: 5, cursor: 'pointer', color,
        transition: 'all 0.12s',
      }}>
      {children}
    </button>
  )
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '0.75rem 1rem',
    }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--purple-light)', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function UsersPage() {
  const [users, setUsers]       = useState<UserFull[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [showAdd, setShowAdd]   = useState(false)
  const [addForm, setAddForm]   = useState({ email: '', name: '', password: '', role: 'user' as 'admin' | 'user' | 'client' })
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [editRole, setEditRole] = useState<'admin' | 'user' | 'client'>('user')
  const [editName, setEditName] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [resetId, setResetId]   = useState<string | null>(null)
  const [resetPwd, setResetPwd] = useState('')
  const [resetErr, setResetErr] = useState('')
  const [resetOk, setResetOk]   = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      setUsers(await api.users.list())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    setAddLoading(true)
    try {
      await api.users.create(addForm)
      setShowAdd(false)
      setAddForm({ email: '', name: '', password: '', role: 'user' })
      await load()
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleEditSave(id: string) {
    await api.users.update(id, { role: editRole, name: editName })
    setEditId(null)
    await load()
  }

  async function handleDelete(id: string) {
    await api.users.delete(id)
    setDeleteId(null)
    await load()
  }

  function startEdit(u: UserFull) {
    setEditId(u.id)
    setEditRole(u.role)
    setEditName(u.name)
  }

  async function handleResetPassword(id: string) {
    setResetErr('')
    if (resetPwd.length < 6) { setResetErr('Mínimo 6 caracteres'); return }
    try {
      await api.users.resetPassword(id, resetPwd)
      setResetOk(true)
      setTimeout(() => { setResetId(null); setResetPwd(''); setResetOk(false) }, 1500)
    } catch (e: unknown) {
      setResetErr(e instanceof Error ? e.message : 'Erro')
    }
  }

  const totalAdmins = users.filter((u) => u.role === 'admin').length
  const totalSSO    = users.filter((u) => u.provider === 'microsoft').length

  const TH: React.CSSProperties = {
    padding: '0.6rem 1rem', fontSize: 9, fontWeight: 600, letterSpacing: '0.1em',
    color: 'var(--text-mute)', textAlign: 'left', textTransform: 'uppercase' as const,
  }
  const TD: React.CSSProperties = {
    padding: '0.75rem 1rem', verticalAlign: 'middle',
    borderBottom: '1px solid rgba(12,12,26,0.8)',
  }

  return (
    <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeIn 0.2s ease' }}>

      {/* Stats cards */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <StatCard label="Total" value={users.length} sub="usuários cadastrados" />
          <StatCard label="Admins" value={totalAdmins} sub="com acesso admin" />
          <StatCard label="SSO" value={totalSSO} sub="via Microsoft" />
        </div>
      )}

      {/* Table header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Usuários
        </span>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem',
            background: 'var(--purple)', border: 'none', borderRadius: 5, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'white',
            boxShadow: '0 0 18px var(--purple-glow-strong)',
          }}
        >
          {UserPlusIco()} Adicionar usuário
        </button>
      </div>

      {error && (
        <div style={{ background: 'color-mix(in srgb, var(--critical) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--critical) 30%, transparent)', color: 'var(--critical)', padding: '0.5rem 0.75rem', borderRadius: 8, fontSize: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-mute)', padding: '2rem', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO...</div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 160px 80px 80px 68px' }}>
            {/* Header */}
            {['NOME', 'EMAIL', 'ROLE', 'PROVIDER', 'ÚLTIMO LOGIN', 'CRIADO EM', ''].map((h, i) => (
              <div key={i} style={{ ...TH, background: 'rgba(2,2,8,0.55)', textAlign: i === 6 ? 'right' : 'left' }}>{h}</div>
            ))}
            {/* Rows */}
            {users.map((u, idx) => (
              <Fragment key={u.id}>
                <div key={`${u.id}-name`} style={{ ...TD, animation: `rowIn 0.3s ease both`, animationDelay: `${idx * 50}ms` }}>
                  {editId === u.id ? (
                    <input style={{ ...inputStyle, width: 140 }} value={editName} onChange={(ev) => setEditName(ev.target.value)} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--purple-dim)', border: '1px solid var(--border-mid)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700, color: 'var(--purple-light)',
                      }}>
                        {initials(u.name)}
                      </div>
                      <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 12 }}>{u.name}</span>
                    </div>
                  )}
                </div>
                <div key={`${u.id}-email`} style={{ ...TD }}>
                  <span style={{ color: 'var(--muted)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{u.email}</span>
                </div>
                <div key={`${u.id}-role`} style={{ ...TD }}>
                  {editId === u.id ? (
                    <select style={{ ...inputStyle, width: 'auto' }} value={editRole} onChange={(ev) => setEditRole(ev.target.value as 'admin' | 'user' | 'client')}>
                      <option value="user">user — operador interno</option>
                      <option value="admin">admin — operador com painel</option>
                      <option value="client">client — usuário do cliente</option>
                    </select>
                  ) : (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10,
                      padding: '2px 8px', borderRadius: 99,
                      background: u.role === 'admin' ? 'var(--purple-dim)' : 'rgba(28,28,52,0.6)',
                      border: `1px solid ${u.role === 'admin' ? 'var(--border-mid)' : 'rgba(50,50,80,0.4)'}`,
                      color: u.role === 'admin' ? 'var(--purple-light)' : 'var(--muted)',
                    }}>
                      {u.role === 'admin' ? CircleIco(10, 'currentColor') : UserIco(10, 'currentColor')}
                      {u.role}
                    </span>
                  )}
                </div>
                <div key={`${u.id}-provider`} style={{ ...TD }}>
                  {u.provider === 'microsoft' ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 9px', borderRadius: 99, fontSize: 10,
                      background: 'var(--purple-dim)',
                      border: '1px solid var(--border-mid)',
                      color: 'var(--purple-light)',
                    }}>
                      <MicrosoftLogo />
                      Microsoft SSO
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 9px', borderRadius: 99, fontSize: 10,
                      background: 'rgba(28,28,52,0.6)',
                      border: '1px solid rgba(50,50,80,0.4)',
                      color: 'var(--muted)',
                    }}>
                      Local
                    </span>
                  )}
                </div>
                <div key={`${u.id}-last`} style={{ ...TD, fontSize: 11, color: 'var(--muted)' }}>{formatDate(u.lastLogin)}</div>
                <div key={`${u.id}-created`} style={{ ...TD, fontSize: 11, color: 'var(--muted)' }}>{formatDate(u.createdAt)}</div>
                <div key={`${u.id}-actions`} style={{ ...TD, textAlign: 'right' }}>
                  {deleteId === u.id ? (
                    <span style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', alignItems: 'center' }}>
                      <span style={{ color: 'var(--muted)', fontSize: 10, marginRight: 2 }}>Confirmar?</span>
                      <ActionBtn onClick={() => handleDelete(u.id)} bg="color-mix(in srgb, var(--critical) 15%, transparent)" border="color-mix(in srgb, var(--critical) 50%, transparent)" color="var(--critical)">
                        {CheckIco(12, 'currentColor')}
                      </ActionBtn>
                      <ActionBtn onClick={() => setDeleteId(null)} bg="var(--purple-dim)" border="var(--border-mid)" color="var(--purple-light)">
                        {XIco(12, 'currentColor')}
                      </ActionBtn>
                    </span>
                  ) : editId === u.id ? (
                    <span style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                      <ActionBtn onClick={() => handleEditSave(u.id)} bg="color-mix(in srgb, var(--low) 12%, transparent)" border="color-mix(in srgb, var(--low) 40%, transparent)" color="var(--low)">
                        {CheckIco(12, 'currentColor')}
                      </ActionBtn>
                      <ActionBtn onClick={() => setEditId(null)} bg="var(--purple-dim)" border="var(--border-mid)" color="var(--purple-light)">
                        {XIco(12, 'currentColor')}
                      </ActionBtn>
                    </span>
                  ) : (
                    <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <ActionBtn onClick={() => startEdit(u)} title="Editar" bg="color-mix(in srgb, var(--purple) 14%, transparent)" border="color-mix(in srgb, var(--purple) 38%, transparent)" color="var(--purple-light)">
                        {PencilIco(12, 'currentColor')}
                      </ActionBtn>
                      {u.provider === 'local' && (
                        <ActionBtn
                          onClick={() => { setResetId(u.id); setResetPwd(''); setResetErr(''); setResetOk(false) }}
                          title="Redefinir senha"
                          bg="color-mix(in srgb, var(--purple) 14%, transparent)" border="color-mix(in srgb, var(--purple) 38%, transparent)" color="var(--purple-light)"
                        >
                          {KeyIco(12, 'currentColor')}
                        </ActionBtn>
                      )}
                      <ActionBtn onClick={() => setDeleteId(u.id)} title="Remover" bg="color-mix(in srgb, var(--critical) 10%, transparent)" border="color-mix(in srgb, var(--critical) 36%, transparent)" color="var(--critical)">
                        {TrashIco(12, 'currentColor')}
                      </ActionBtn>
                    </span>
                  )}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetId && (
        <Modal onClose={() => { setResetId(null); setResetPwd(''); setResetErr(''); setResetOk(false) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>
              {KeyIco(14, 'var(--purple-light)')} Redefinir senha
            </span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex', alignItems: 'center' }}
              onClick={() => { setResetId(null); setResetPwd(''); setResetErr(''); setResetOk(false) }}>
              {XIco(16, 'var(--muted)')}
            </button>
          </div>
          {resetOk ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '1rem 0' }}>
              {CheckIco(28, 'var(--low)')}
              <span style={{ color: 'var(--low)', fontSize: 13, fontWeight: 600 }}>Senha redefinida com sucesso</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label htmlFor="reset-pwd" style={{ fontSize: 10, color: 'var(--text-mute)', fontWeight: 600, display: 'block', marginBottom: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Nova senha</label>
                <input
                  id="reset-pwd"
                  style={inputStyle}
                  type="password"
                  placeholder="••••••••"
                  value={resetPwd}
                  autoFocus
                  onChange={(e) => { setResetPwd(e.target.value); setResetErr('') }}
                  onKeyDown={(e) => e.key === 'Enter' && handleResetPassword(resetId)}
                />
                <span style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 3, display: 'block' }}>Mínimo 6 caracteres</span>
              </div>
              {resetErr && <ErrorMsg>{resetErr}</ErrorMsg>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => handleResetPassword(resetId)} style={{
                  flex: 1, background: 'var(--purple)', color: '#fff', border: 'none',
                  borderRadius: 5, padding: '0.5rem', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  Redefinir
                </button>
                <button type="button" onClick={() => { setResetId(null); setResetPwd(''); setResetErr(''); setResetOk(false) }} style={{
                  flex: 1, background: 'transparent', color: 'var(--muted)',
                  border: '1px solid var(--border-mid)', borderRadius: 5, padding: '0.5rem',
                  fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Add user modal */}
      {showAdd && (
        <Modal onClose={() => { setShowAdd(false); setAddError('') }} width={400}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>Adicionar usuário</span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex', alignItems: 'center' }}
              onClick={() => { setShowAdd(false); setAddError('') }}>
              {XIco(16, 'var(--muted)')}
            </button>
          </div>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(['nome', 'email', 'senha', 'role'] as const).map((field) => {
              const label = { nome: 'Nome', email: 'Email', senha: 'Senha', role: 'Role' }[field]
              return (
                <div key={field}>
                  <label htmlFor={`add-user-${field}`} style={{ fontSize: 10, color: 'var(--text-mute)', fontWeight: 600, display: 'block', marginBottom: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</label>
                  {field === 'role' ? (
                    <select id={`add-user-${field}`} style={inputStyle} value={addForm.role} onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value as 'admin' | 'user' | 'client' }))}>
                      <option value="user">user — operador interno</option>
                      <option value="admin">admin — operador com painel</option>
                      <option value="client">client — usuário do cliente</option>
                    </select>
                  ) : (
                    <input
                      id={`add-user-${field}`}
                      style={inputStyle}
                      type={field === 'senha' ? 'password' : field === 'email' ? 'email' : 'text'}
                      placeholder={field === 'nome' ? 'João Silva' : field === 'email' ? 'joao@empresa.com' : '••••••••'}
                      value={field === 'nome' ? addForm.name : field === 'email' ? addForm.email : addForm.password}
                      onChange={(e) => {
                        const key = field === 'nome' ? 'name' : field === 'email' ? 'email' : 'password'
                        setAddForm((f) => ({ ...f, [key]: e.target.value }))
                      }}
                      required
                    />
                  )}
                </div>
              )
            })}
            {addError && <ErrorMsg>{addError}</ErrorMsg>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit" disabled={addLoading} style={{
                flex: 1, background: 'var(--purple)', color: '#fff', border: 'none',
                borderRadius: 5, padding: '0.5rem', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {addLoading ? 'Criando...' : 'Criar usuário'}
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setAddError('') }} style={{
                flex: 1, background: 'transparent', color: 'var(--muted)',
                border: '1px solid var(--border-mid)', borderRadius: 5, padding: '0.5rem',
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

// P2-39 (auditoria 2026-07-20): fechava só por clique no overlay — sem Esc,
// sem role="dialog"/aria-modal, sem foco movido pro modal ao abrir.
function Modal({ children, onClose, width = 360 }: { children: React.ReactNode; onClose: () => void; width?: number }) {
  const modalRef = useEscapeClose(true, onClose)
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(2,2,8,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      animation: 'fadeIn 0.15s ease',
    }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border-mid)',
          borderRadius: 8, padding: '1.5rem', width,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'color-mix(in srgb, var(--critical) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--critical) 30%, transparent)', color: 'var(--critical)', padding: '0.4rem 0.65rem', borderRadius: 5, fontSize: 11 }}>
      {children}
    </div>
  )
}
