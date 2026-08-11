'use client'
// Teste de conexão / harness de sessão (#3) — pré-voo do pentest autenticado.
// Prova que a credencial loga ANTES de gastar token de agente. Sem IA.
import { useState } from 'react'
import Link from 'next/link'
import { api, SessionCheckResult } from '@/lib/api'
import { Page, PageHeader, Card, Btn, inputStyle } from '@/components/ui/kit'
import { KeyRound, ShieldCheck, ShieldAlert, ShieldQuestion, Loader2, ArrowLeft, ChevronDown } from 'lucide-react'

const VERDICT: Record<string, { label: string; color: string; icon: typeof ShieldCheck; hint: string }> = {
  ok:           { label: 'Login confirmado',   color: 'var(--low)',      icon: ShieldCheck,    hint: 'A credencial loga e a sessão se sustenta. Pode iniciar o pentest autenticado.' },
  failed:       { label: 'Login falhou',        color: 'var(--critical)', icon: ShieldAlert,    hint: 'A credencial não logou (ou a sessão não sustentou). Corrija antes de gastar o agente.' },
  inconclusive: { label: 'Inconclusivo',        color: 'var(--medium)',   icon: ShieldQuestion, hint: 'Não deu para provar o login. Ajuste os campos (nome do campo de senha, URL protegida).' },
  error:        { label: 'Erro no teste',       color: 'var(--high)',     icon: ShieldAlert,    hint: 'O alvo não respondeu, não resolveu, ou foi recusado por segurança (IP interno).' },
}

export default function HarnessPage() {
  const [form, setForm] = useState({ loginUrl: '', username: '', password: '', usernameField: 'username', passwordField: 'password', protectedUrl: '', successContains: '' })
  const [adv, setAdv] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SessionCheckResult | null>(null)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function run() {
    setLoading(true); setResult(null)
    try {
      const r = await api.harness.session({
        loginUrl: form.loginUrl, username: form.username, password: form.password,
        usernameField: form.usernameField || undefined, passwordField: form.passwordField || undefined,
        protectedUrl: form.protectedUrl || undefined, successContains: form.successContains || undefined,
      })
      setResult(r)
    } catch (e) {
      setResult({ verdict: 'error', error: e instanceof Error ? e.message : 'falha' })
    } finally { setLoading(false) }
  }

  const V = result ? VERDICT[result.verdict] : null
  const canRun = form.loginUrl.trim() && form.username.trim() && form.password.trim() && !loading

  return (
    <Page max={780}>
      <PageHeader
        icon={<KeyRound size={19} color="var(--purple-light)" />}
        title="Teste de conexão"
        subtitle="Prova que a credencial loga no alvo — antes de o agente gastar um token. Determinístico, sem IA."
        eyebrow={{ href: '/novo-pentest/web', label: 'Pentest Web / API' }}
      />

      <Card pad="1.3rem 1.4rem">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="URL de login (action do formulário)" hint="para onde o formulário faz POST">
            <input style={{ ...inputStyle, width: '100%', fontFamily: 'var(--mono)' }} placeholder="https://app.alvo.com/login"
              value={form.loginUrl} onChange={(e) => set('loginUrl', e.target.value)} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Usuário"><input style={{ ...inputStyle, width: '100%' }} value={form.username} onChange={(e) => set('username', e.target.value)} /></Field>
            <Field label="Senha"><input type="password" style={{ ...inputStyle, width: '100%' }} value={form.password} onChange={(e) => set('password', e.target.value)} /></Field>
          </div>

          <button onClick={() => setAdv((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--text-mute)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}>
            <ChevronDown size={13} style={{ transform: adv ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} /> Opções avançadas
          </button>
          {adv && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingLeft: 2 }}>
              <Field label="Campo do usuário" hint="name= no HTML"><input style={{ ...inputStyle, width: '100%', fontFamily: 'var(--mono)' }} value={form.usernameField} onChange={(e) => set('usernameField', e.target.value)} /></Field>
              <Field label="Campo da senha"><input style={{ ...inputStyle, width: '100%', fontFamily: 'var(--mono)' }} value={form.passwordField} onChange={(e) => set('passwordField', e.target.value)} /></Field>
              <Field label="URL protegida (sustentação)" hint="página que só abre logado"><input style={{ ...inputStyle, width: '100%', fontFamily: 'var(--mono)' }} placeholder="https://app.alvo.com/painel" value={form.protectedUrl} onChange={(e) => set('protectedUrl', e.target.value)} /></Field>
              <Field label="Texto de sucesso" hint="algo que só aparece logado"><input style={{ ...inputStyle, width: '100%' }} placeholder="ex.: o e-mail do usuário" value={form.successContains} onChange={(e) => set('successContains', e.target.value)} /></Field>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <Btn variant="primary" onClick={run} disabled={!canRun}>
              {loading ? <Loader2 size={14} className="spin" /> : <KeyRound size={14} />} Testar conexão
            </Btn>
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>A credencial não é salva — o teste é efêmero.</span>
          </div>
        </div>
      </Card>

      {V && (
        <Card pad="1.3rem 1.4rem" style={{ borderColor: `color-mix(in srgb, ${V.color} 35%, transparent)` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', color: V.color, background: `color-mix(in srgb, ${V.color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${V.color} 35%, transparent)` }}>
              <V.icon size={22} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: V.color }}>{V.label}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>{V.hint}</div>
              {result?.error && <div style={{ fontSize: 12, color: 'var(--high)', marginTop: 8, fontFamily: 'var(--mono)' }}>{result.error}</div>}
              {result?.reasons && result.reasons.length > 0 && (
                <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {result.reasons.map((r, i) => (
                    <li key={i} style={{ fontSize: 12.5, color: 'var(--text)', display: 'flex', gap: 8 }}>
                      <span style={{ color: V.color }}>·</span> {r}
                    </li>
                  ))}
                </ul>
              )}
              {result?.evidence && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-mute)', fontFamily: 'var(--mono)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {result.evidence.status != null && <span>status {result.evidence.status}</span>}
                  {result.evidence.cookies && result.evidence.cookies.length > 0 && <span>cookies: {result.evidence.cookies.join(', ')}</span>}
                  {result.evidence.redirect && <span>→ {result.evidence.redirect}</span>}
                  {result.evidence.protectedStatus != null && <span>protegida: {result.evidence.protectedStatus}</span>}
                </div>
              )}
              {result?.verdict === 'ok' && (
                <div style={{ marginTop: 14 }}>
                  <Btn href="/engagement/novo?pack=web-auth"><ShieldCheck size={14} /> Iniciar pentest autenticado</Btn>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--text-mute)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <ShieldAlert size={12} /> O alvo é validado contra IP interno antes de qualquer requisição (anti-SSRF). Só operadores internos rodam este teste.
      </div>

      <Link href="/novo-pentest/web" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-mute)', fontSize: 12, textDecoration: 'none' }}>
        <ArrowLeft size={13} /> Voltar
      </Link>
    </Page>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{label}{hint && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> · {hint}</span>}</span>
      {children}
    </label>
  )
}
