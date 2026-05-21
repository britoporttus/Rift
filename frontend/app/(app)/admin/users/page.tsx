'use client'
import { useEffect, useState } from 'react'
import { api, UserFull } from '@/lib/api'
import { UserPlus, Pencil, Trash2, Shield, User as UserIcon, X, Check } from 'lucide-react'

const PROVIDER_LABEL: Record<string, string> = { local: 'Local', microsoft: 'Microsoft SSO' }
const ROLE_COLOR: Record<string, string> = { admin: 'var(--purple-light)', user: 'var(--muted)' }

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserFull[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Add user modal
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ email: '', name: '', password: '', role: 'user' as 'admin' | 'user' })
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  // Edit inline
  const [editId, setEditId] = useState<string | null>(null)
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user')
  const [editName, setEditName] = useState('')

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      const data = await api.users.list()
      setUsers(data)
    } catch (e: any) {
      setError(e.message)
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
    } catch (e: any) {
      setAddError(e.message)
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

  const s = styles

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Usuários</h1>
          <p style={s.subtitle}>{users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button style={s.addBtn} onClick={() => setShowAdd(true)}>
          <UserPlus size={15} /> Adicionar usuário
        </button>
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      {loading ? (
        <div style={{ color: 'var(--muted)', padding: '2rem' }}>Carregando...</div>
      ) : (
        <div style={s.card}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Nome</th>
                <th style={s.th}>Email</th>
                <th style={s.th}>Role</th>
                <th style={s.th}>Provider</th>
                <th style={s.th}>Último login</th>
                <th style={s.th}>Criado em</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={s.row}>
                  <td style={s.td}>
                    {editId === u.id ? (
                      <input
                        style={s.inlineInput}
                        value={editName}
                        onChange={ev => setEditName(ev.target.value)}
                      />
                    ) : (
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{u.name}</span>
                    )}
                  </td>
                  <td style={s.td}>
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>{u.email}</span>
                  </td>
                  <td style={s.td}>
                    {editId === u.id ? (
                      <select
                        style={s.inlineSelect}
                        value={editRole}
                        onChange={ev => setEditRole(ev.target.value as 'admin' | 'user')}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : (
                      <span style={{ ...s.roleBadge, color: ROLE_COLOR[u.role] }}>
                        {u.role === 'admin' ? <Shield size={11} /> : <UserIcon size={11} />}
                        {u.role}
                      </span>
                    )}
                  </td>
                  <td style={s.td}>
                    <span style={s.providerBadge}>{PROVIDER_LABEL[u.provider] ?? u.provider}</span>
                  </td>
                  <td style={{ ...s.td, color: 'var(--muted)', fontSize: 12 }}>{formatDate(u.lastLogin)}</td>
                  <td style={{ ...s.td, color: 'var(--muted)', fontSize: 12 }}>{formatDate(u.createdAt)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    {deleteId === u.id ? (
                      <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Confirmar?</span>
                        <button style={s.iconBtnDanger} onClick={() => handleDelete(u.id)}><Check size={13} /></button>
                        <button style={s.iconBtn} onClick={() => setDeleteId(null)}><X size={13} /></button>
                      </span>
                    ) : editId === u.id ? (
                      <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button style={s.iconBtnSuccess} onClick={() => handleEditSave(u.id)}><Check size={13} /></button>
                        <button style={s.iconBtn} onClick={() => setEditId(null)}><X size={13} /></button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button style={s.iconBtn} onClick={() => startEdit(u)} title="Editar">
                          <Pencil size={13} />
                        </button>
                        <button style={s.iconBtnDanger} onClick={() => setDeleteId(u.id)} title="Remover">
                          <Trash2 size={13} />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add user modal */}
      {showAdd && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>Adicionar usuário</span>
              <button style={s.iconBtn} onClick={() => { setShowAdd(false); setAddError('') }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAdd} style={s.form}>
              <label style={s.label}>Nome</label>
              <input
                style={s.input}
                placeholder="João Silva"
                value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                required
              />
              <label style={s.label}>Email</label>
              <input
                style={s.input}
                type="email"
                placeholder="joao@empresa.com"
                value={addForm.email}
                onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                required
              />
              <label style={s.label}>Senha</label>
              <input
                style={s.input}
                type="password"
                placeholder="••••••••"
                value={addForm.password}
                onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                required
              />
              <label style={s.label}>Role</label>
              <select
                style={s.input}
                value={addForm.role}
                onChange={e => setAddForm(f => ({ ...f, role: e.target.value as 'admin' | 'user' }))}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>

              {addError && <div style={s.errorBanner}>{addError}</div>}

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="submit" style={s.submitBtn} disabled={addLoading}>
                  {addLoading ? 'Criando...' : 'Criar usuário'}
                </button>
                <button type="button" style={s.cancelBtn} onClick={() => { setShowAdd(false); setAddError('') }}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: '2rem', maxWidth: 1100 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  title: { margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' },
  addBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'var(--purple)', color: '#fff', border: 'none',
    borderRadius: 6, padding: '0.5rem 1rem', fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  },
  card: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: '0.75rem 1rem',
    fontSize: 11, fontWeight: 600, color: 'var(--muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border)',
  },
  td: { padding: '0.75rem 1rem', verticalAlign: 'middle' },
  row: { borderBottom: '1px solid var(--border)' },
  roleBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 12, fontWeight: 500,
  },
  providerBadge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: 20,
    fontSize: 11, background: 'var(--purple-glow)', color: 'var(--purple-light)',
  },
  iconBtn: {
    background: 'none', border: '1px solid var(--border)', borderRadius: 5,
    color: 'var(--muted)', cursor: 'pointer', padding: '4px 6px',
    display: 'inline-flex', alignItems: 'center',
  },
  iconBtnDanger: {
    background: 'none', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 5,
    color: '#EF4444', cursor: 'pointer', padding: '4px 6px',
    display: 'inline-flex', alignItems: 'center',
  },
  iconBtnSuccess: {
    background: 'none', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 5,
    color: '#22C55E', cursor: 'pointer', padding: '4px 6px',
    display: 'inline-flex', alignItems: 'center',
  },
  inlineInput: {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5,
    color: 'var(--text)', fontSize: 13, padding: '4px 8px', width: 140,
  },
  inlineSelect: {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5,
    color: 'var(--text)', fontSize: 13, padding: '4px 8px',
  },
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(8,8,16,0.85)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modal: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '1.5rem', width: 400,
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '1.25rem',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontSize: 12, color: 'var(--muted)', fontWeight: 600 },
  input: {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
    color: 'var(--text)', fontSize: 14, padding: '0.5rem 0.75rem',
  },
  submitBtn: {
    flex: 1, background: 'var(--purple)', color: '#fff',
    border: 'none', borderRadius: 6, padding: '0.5rem',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  cancelBtn: {
    flex: 1, background: 'transparent', color: 'var(--muted)',
    border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem',
    fontSize: 14, cursor: 'pointer',
  },
  errorBanner: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
    color: '#EF4444', padding: '0.5rem 0.75rem', borderRadius: 6, fontSize: 13,
  },
}
