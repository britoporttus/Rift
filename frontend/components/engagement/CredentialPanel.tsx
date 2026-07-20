'use client'
import { useEffect, useState } from 'react'
import { KeyRound, Loader2, Check, Trash2, ShieldAlert, Server } from 'lucide-react'
import { api, Engagement, DomainPackOption, CredentialField } from '@/lib/api'

// Painel de CREDENCIAIS de pack autenticado (Azure/AD/SAP/…). Aparece só quando o
// domain pack do engagement usa credencial. As credenciais ficam SÓ em memória do
// backend (cofre efêmero, por-run) e são limpas ao fim do run — nada em repouso.
// Para packs que exigem runner interno (AD/SAP), avisa que ainda não roda da VPS.
export function CredentialPanel({
  engagement,
  disabled,
}: {
  engagement: Engagement
  disabled?: boolean
}) {
  const [pack, setPack] = useState<DomainPackOption | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<{ set: boolean; fields?: string[]; expiresAt?: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const packId = engagement.domainPackId || 'web'

  useEffect(() => {
    api.settings.getDomainPacks()
      .then((info) => setPack(info.available.find((p) => p.id === packId) ?? null))
      .catch(() => setPack(null))
  }, [packId])

  useEffect(() => {
    api.engagements.getCredentials(engagement.id).then(setStatus).catch(() => setStatus(null))
  }, [engagement.id, packId])

  // Só renderiza para packs autenticados (credentialHandling 'vault').
  if (!pack || pack.credentialHandling !== 'vault') return null

  const needsRunner = pack.requiresRunner

  async function submit() {
    setSaving(true); setErr(null)
    try {
      await api.engagements.setCredentials(engagement.id, values)
      const s = await api.engagements.getCredentials(engagement.id)
      setStatus(s)
      setValues({})   // não retém os valores no cliente após enviar
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'falha ao salvar credenciais')
    } finally {
      setSaving(false)
    }
  }

  async function clear() {
    setSaving(true); setErr(null)
    try {
      await api.engagements.clearCredentials(engagement.id)
      setStatus({ set: false })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'falha ao limpar')
    } finally {
      setSaving(false)
    }
  }

  const box: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
    padding: 14, marginTop: 12,
  }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', marginBottom: 3, display: 'block' }
  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
    color: 'var(--text)', fontSize: 13, padding: '7px 9px', fontFamily: 'inherit', marginBottom: 8,
  }

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
        <KeyRound size={15} color="var(--purple-light)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Credenciais — {pack.label}</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4, marginBottom: 10 }}>
        Ficam só em memória do servidor, por este run, e são apagadas ao terminar. Nada é gravado em disco.
      </div>

      {needsRunner && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(249,115,22,.1)',
          border: '1px solid rgba(249,115,22,.3)', borderRadius: 8, padding: '9px 11px', fontSize: 12, color: 'var(--text)' }}>
          <Server size={15} color="var(--high)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Este domínio ({pack.label}) exige um <strong>runner interno</strong> na rede do alvo — ainda não disponível. Azure/nuvem rodam da VPS; AD/SAP dependem do runner. As credenciais podem ser preparadas, mas o run ainda não executa.</span>
        </div>
      )}

      {status?.set && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(34,197,94,.1)',
          border: '1px solid rgba(34,197,94,.3)', borderRadius: 8, padding: '8px 11px', marginBottom: 10, fontSize: 12 }}>
          <Check size={14} color="var(--low)" />
          <span style={{ color: 'var(--text)' }}>Credencial carregada ({(status.fields || []).join(', ')}).</span>
          <button onClick={clear} disabled={disabled || saving} title="Apagar credencial da memória" style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, background: 'transparent',
            border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: 11,
            padding: '3px 7px', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <Trash2 size={11} /> limpar
          </button>
        </div>
      )}

      {!status?.set && (
        <>
          {pack.credentialFields.map((f: CredentialField) => (
            <div key={f.name}>
              <label style={labelStyle} htmlFor={`cred-panel-${f.name}`}>
                {f.label}{f.optional ? ' (opcional)' : ''}
              </label>
              <input
                id={`cred-panel-${f.name}`}
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                value={values[f.name] || ''}
                disabled={disabled || saving}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                style={inputStyle}
              />
            </div>
          ))}
          <button onClick={submit} disabled={disabled || saving} style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'var(--purple)', border: 'none',
            borderRadius: 7, color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '8px 14px',
            cursor: disabled || saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
          }}>
            {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldAlert size={13} />}
            Carregar credenciais (em memória)
          </button>
        </>
      )}

      {err && <div style={{ fontSize: 11.5, color: 'var(--critical)', marginTop: 8 }}>{err}</div>}
    </div>
  )
}
