'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api, DomainPackOption, DomainSummary } from '@/lib/api'
import Link from 'next/link'
import { engagementMatchesDomain } from '@/lib/domainMatch'
import { ArrowLeft, ArrowRight, Check, Target, Radar, Loader2, Globe, Cloud, Network, KeyRound, Clock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// A-INTAKE (multi-domínio): o "Novo Escopo" começa pela ESCOLHA DO TIPO DE TESTE
// (domain pack) e o formulário se adapta ao que cada domínio precisa. Web mantém o
// intake guiado (ambiente/tipo/intensidade + detalhes); Azure pede o tenant + a
// credencial do Service Principal (efêmera, só em memória). SAP/AD ficam "em
// construção" (exigem runner interno). Só cria no fim, em `idle` — sem iniciar testes.

type Opt = { value: string; label: string; hint?: string }

const ENVIRONMENTS: Opt[] = [
  { value: 'production', label: 'Produção', hint: 'mais conservador' },
  { value: 'staging',    label: 'Staging' },
  { value: 'dev',        label: 'Dev' },
  { value: 'lab',        label: 'Lab', hint: 'sem limites de gasto padrão' },
]
const APP_TYPES: Opt[] = [
  { value: 'web',         label: 'Web' },
  { value: 'web+api',     label: 'Web + API', hint: 'mais comum' },
  { value: 'api',         label: 'API' },
  { value: 'saas-vendor', label: 'SaaS (fornecedor)' },
  { value: 'saas-tenant', label: 'SaaS (tenant)' },
]
const INTENSITIES: Opt[] = [
  { value: 'low',      label: 'Baixa',       hint: 'passivo, discreto' },
  { value: 'medium',   label: 'Média' },
  { value: 'high',     label: 'Alta',        hint: 'mais ruidoso' },
  { value: 'targeted', label: 'Direcionada', hint: 'foco específico' },
]
const WAFS: Opt[] = [
  { value: 'unknown', label: 'Não sei', hint: 'detecta no recon' },
  { value: 'yes',     label: 'Sim' },
  { value: 'no',      label: 'Não' },
]

// Ícone por domínio (visual do seletor de tipo).
const PACK_ICON: Record<string, LucideIcon> = {
  web: Globe, azure: Cloud, aws: Cloud, gcp: Cloud, ad: Network, sap: Network,
}
// Só estes tipos aparecem no intake (aws/gcp são futuros).
const PACK_ORDER = ['web', 'azure', 'ad', 'sap']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.8rem',
  background: 'var(--bg)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text)', fontSize: 13.5,
  outline: 'none', fontFamily: 'inherit',
}
const labelStyle: React.CSSProperties = {
  color: 'var(--muted)', fontSize: 11, display: 'block', marginBottom: 7,
  letterSpacing: '0.04em', fontWeight: 600,
}

function Chips({ options, value, onChange }: { options: Opt[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)} title={o.hint} style={{
            padding: '0.45rem 0.85rem', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12.5, fontWeight: 600, transition: 'all .12s',
            background: active ? 'rgba(124,58,237,.15)' : 'transparent',
            border: `1px solid ${active ? 'var(--purple)' : 'var(--border)'}`,
            color: active ? 'var(--purple-light)' : 'var(--muted)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {active && <Check size={12} />}
            {o.label}
            {o.hint && <span style={{ opacity: 0.7, fontWeight: 400, fontSize: 11 }}>· {o.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

// Seletor do TIPO DE TESTE (domain pack). Disponíveis são clicáveis; os que exigem
// runner (AD/SAP) aparecem desabilitados com "em construção".
function PackPicker({ packs, value, onChange }: { packs: DomainPackOption[]; value: string; onChange: (id: string) => void }) {
  const ordered = PACK_ORDER
    .map((id) => packs.find((p) => p.id === id))
    .filter((p): p is DomainPackOption => !!p)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
      {ordered.map((p) => {
        const Icon = PACK_ICON[p.id] || Globe
        const active = p.id === value
        const disabled = !p.available
        return (
          <button key={p.id} type="button" disabled={disabled} onClick={() => !disabled && onChange(p.id)} style={{
            textAlign: 'left', padding: '12px 13px', borderRadius: 10, fontFamily: 'inherit',
            cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all .12s',
            background: active ? 'rgba(124,58,237,.14)' : 'var(--bg)',
            border: `1px solid ${active ? 'var(--purple)' : 'var(--border)'}`,
            opacity: disabled ? 0.5 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <Icon size={16} color={active ? 'var(--purple-light)' : 'var(--muted)'} />
              <span style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--purple-light)' : 'var(--text)' }}>{p.label}</span>
              {active && <Check size={13} color="var(--purple-light)" style={{ marginLeft: 'auto' }} />}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.35 }}>
              {disabled
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--purple-light)', fontWeight: 600 }}><Clock size={10} /> em construção (exige runner)</span>
                : (p.credentialHandling === 'vault' ? 'autenticado · pede credencial' : 'black-box · externo')}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default function NovoEngagementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<1 | 2>(1)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tipo de teste (domain pack). `?pack=` vem do funil /novo-pentest — pré-seleciona
  // o tipo já escolhido lá (só aplica se o pack existir e estiver disponível).
  const preselectPack = searchParams.get('pack')
  const [packs, setPacks] = useState<DomainPackOption[]>([])
  const [packId, setPackId] = useState('web')
  useEffect(() => {
    api.settings.getDomainPacks().then((info) => {
      setPacks(info.available)
      const wanted = info.available.find((p) => p.id === preselectPack && p.available)
      setPackId(wanted ? wanted.id : info.default)
    }).catch(() => setPacks([]))
  }, [preselectPack])

  // Domínios cadastrados (ASM) — sugestão no campo de alvo, pra não criar
  // engagements "órfãos" (sem Domínio vinculado) sem querer.
  const [domains, setDomains] = useState<DomainSummary[]>([])
  useEffect(() => { api.domains.list().then(setDomains).catch(() => setDomains([])) }, [])
  const pack = useMemo(() => packs.find((p) => p.id === packId) || null, [packs, packId])
  const isAuth = pack?.credentialHandling === 'vault'

  // Essencial
  const [name, setName]           = useState('')
  const [target, setTarget]       = useState(() => searchParams.get('target') || '')
  const [environment, setEnv]     = useState('production')
  const [appType, setAppType]     = useState('web+api')
  const [intensity, setIntensity] = useState('medium')
  // Credenciais (packs autenticados) — só em memória, enviadas ao cofre efêmero no fim.
  const [creds, setCreds]         = useState<Record<string, string>>({})
  // Detalhes (opcional, web)
  const [wafPresent, setWafPresent] = useState('unknown')
  const [wafType, setWafType]       = useState('')
  const [focusAreas, setFocus]      = useState('')
  const [outOfScope, setOutOfScope] = useState('')
  const [ipRanges, setIpRanges]     = useState('')
  const [spending, setSpending]     = useState('')
  const [notes, setNotes]           = useState('')

  const targetOk = target.trim().length > 0
  const matchedDomain = useMemo(
    () => (target.trim() ? domains.find((d) => engagementMatchesDomain(target, d.domain)) || null : null),
    [target, domains],
  )
  // Campos de credencial obrigatórios preenchidos? (packs autenticados)
  const credsOk = !isAuth || (pack?.credentialFields || [])
    .filter((f) => !f.optional)
    .every((f) => (creds[f.name] || '').trim().length > 0)
  const effectiveName = useMemo(() => name.trim() || target.trim(), [name, target])
  const targetLabel = isAuth ? 'Domínio / Tenant *' : 'Alvo (domínio) *'
  const targetPlaceholder = isAuth ? 'contoso.onmicrosoft.com' : 'exemplo.com'

  async function handleCreate() {
    setError(null)
    if (!targetOk) { setStep(1); setError('Informe o alvo/tenant.'); return }
    if (!credsOk) { setError('Preencha as credenciais obrigatórias.'); return }
    setCreating(true)
    try {
      const scope: Record<string, unknown> = isAuth
        ? { environment, intensity, focusAreas, outOfScope, notes }
        : {
            environment, appType, intensity,
            wafPresent, wafType: wafPresent === 'yes' ? wafType.trim() : '',
            focusAreas, outOfScope, ipRanges, notes,
          }
      const n = Number(spending)
      if (spending.trim() && !Number.isNaN(n) && n > 0) scope.spendingUsd = n

      const eng = await api.engagements.create({ name: effectiveName, target: target.trim(), scope, domainPackId: packId })

      // Pack autenticado: carrega a credencial no cofre efêmero do engagement (só em
      // memória do backend). Best-effort — se falhar (ex.: 403), o engagement já existe
      // e o operador pode informar no painel de credenciais da tela do engagement.
      if (isAuth) {
        const filled = Object.fromEntries(Object.entries(creds).filter(([, v]) => (v || '').trim() !== ''))
        try { await api.engagements.setCredentials(eng.id, filled) }
        catch (e) { console.warn('cred set falhou:', e) }
      }
      router.push(`/engagement/${eng.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar o escopo')
      setCreating(false)
    }
  }

  // Web tem 2 passos (essencial + detalhes); packs autenticados têm 1 (essencial + creds).
  const hasStep2 = !isAuth
  const steps = hasStep2 ? [{ n: 1, t: 'Essencial' }, { n: 2, t: 'Detalhes (opcional)' }] : [{ n: 1, t: 'Essencial' }]

  return (
    <div style={{ padding: '1.5rem 1.75rem', maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <Link href="/dashboard" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Novo escopo</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px 30px' }}>
        Escolha o <strong style={{ color: 'var(--text)' }}>tipo de teste</strong> e configure o engagement. Nada é criado nem testado até você concluir.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {steps.map((s) => {
          const active = step === s.n
          const done = step > s.n
          return (
            <div key={s.n} style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 0.85rem', borderRadius: 10,
              background: active ? 'rgba(124,58,237,.1)' : 'var(--surface)',
              border: `1px solid ${active ? 'var(--purple)' : 'var(--border)'}`,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 99, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, background: active || done ? 'var(--purple)' : 'var(--border)', color: active || done ? 'white' : 'var(--muted)',
              }}>{done ? <Check size={13} /> : s.n}</div>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: active ? 'var(--purple-light)' : 'var(--muted)' }}>{s.t}</span>
            </div>
          )
        })}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {step === 1 ? (
          <>
            {/* Tipo de teste (domain pack) — sempre primeiro */}
            <div>
              <label style={labelStyle}>Tipo de teste</label>
              {packs.length ? <PackPicker packs={packs} value={packId} onChange={(id) => { setPackId(id); setStep(1) }} />
                : <div style={{ fontSize: 12, color: 'var(--muted)' }}>Carregando tipos…</div>}
            </div>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={labelStyle} htmlFor="eng-target">{targetLabel}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Target size={15} color="var(--purple-light)" style={{ flexShrink: 0 }} />
                  <input id="eng-target" autoFocus value={target} onChange={(e) => setTarget(e.target.value)} placeholder={targetPlaceholder} style={inputStyle} list="eng-target-domains" />
                  <datalist id="eng-target-domains">
                    {domains.map((d) => <option key={d.id} value={d.domain} />)}
                  </datalist>
                </div>
                {targetOk && (
                  matchedDomain ? (
                    <div style={{ fontSize: 11, color: 'var(--low)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Check size={12} /> Vinculado ao Domínio cadastrado: {matchedDomain.name || matchedDomain.domain}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 5 }}>
                      Este alvo ainda não está em <Link href="/dominios" style={{ color: 'var(--purple-light)' }}>Domínios</Link> — cadastre lá também para acompanhar superfície e score.
                    </div>
                  )
                )}
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={labelStyle} htmlFor="eng-name">Nome do engagement</label>
                <input id="eng-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={target.trim() || 'Cliente XYZ'} style={inputStyle} />
              </div>
            </div>

            {isAuth ? (
              // Formulário AUTENTICADO (Azure/…): credenciais do próprio pack.
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: -4 }}>
                  <KeyRound size={14} color="var(--purple-light)" />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>Credenciais ({pack?.label})</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -12, lineHeight: 1.4 }}>
                  Ficam só em memória do servidor, por este run, e são apagadas ao terminar. Nada é gravado em disco.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {(pack?.credentialFields || []).map((f) => (
                    <div key={f.name} style={{ flex: '1 1 220px', minWidth: 200 }}>
                      <label style={labelStyle} htmlFor={`cred-${f.name}`}>{f.label}{f.optional ? ' (opcional)' : ''}</label>
                      <input
                        id={`cred-${f.name}`}
                        type={f.secret ? 'password' : 'text'}
                        autoComplete="off"
                        value={creds[f.name] || ''}
                        onChange={(e) => setCreds((c) => ({ ...c, [f.name]: e.target.value }))}
                        placeholder={f.secret ? '••••••••' : ''}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label style={labelStyle}>Ambiente</label>
                  <Chips options={ENVIRONMENTS} value={environment} onChange={setEnv} />
                </div>
                <div style={{ width: 200 }}>
                  <label style={labelStyle} htmlFor="eng-spending">Gasto máximo (US$)</label>
                  <input id="eng-spending" type="number" min="0" step="0.5" value={spending} onChange={(e) => setSpending(e.target.value)} placeholder="5" style={inputStyle} />
                </div>
              </>
            ) : (
              // Formulário WEB (black-box).
              <>
                <div>
                  <label style={labelStyle}>Ambiente</label>
                  <Chips options={ENVIRONMENTS} value={environment} onChange={setEnv} />
                </div>
                <div>
                  <label style={labelStyle}>Tipo de alvo</label>
                  <Chips options={APP_TYPES} value={appType} onChange={setAppType} />
                </div>
                <div>
                  <label style={labelStyle}>Intensidade</label>
                  <Chips options={INTENSITIES} value={intensity} onChange={setIntensity} />
                </div>
              </>
            )}
          </>
        ) : (
          // Step 2 (só web): detalhes opcionais.
          <>
            <div>
              <label style={labelStyle}>WAF / proteção</label>
              <Chips options={WAFS} value={wafPresent} onChange={setWafPresent} />
              {wafPresent === 'yes' && (
                <input value={wafType} onChange={(e) => setWafType(e.target.value)} placeholder="Qual? (ex.: Cloudflare, AWS WAF, Akamai)" style={{ ...inputStyle, marginTop: 10 }} />
              )}
            </div>
            <div>
              <label style={labelStyle} htmlFor="eng-focus">Foco (áreas prioritárias)</label>
              <input id="eng-focus" value={focusAreas} onChange={(e) => setFocus(e.target.value)} placeholder="ex.: autenticação, upload de arquivos, API de pagamento" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={labelStyle} htmlFor="eng-out-of-scope">Fora de escopo</label>
                <input id="eng-out-of-scope" value={outOfScope} onChange={(e) => setOutOfScope(e.target.value)} placeholder="ex.: admin.exemplo.com, /logout" style={inputStyle} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={labelStyle} htmlFor="eng-ip-ranges">Faixas de IP (opcional)</label>
                <input id="eng-ip-ranges" value={ipRanges} onChange={(e) => setIpRanges(e.target.value)} placeholder="ex.: 203.0.113.0/24" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ width: 180 }}>
                <label style={labelStyle} htmlFor="eng-spending">Gasto máximo (US$)</label>
                <input id="eng-spending" type="number" min="0" step="0.5" value={spending} onChange={(e) => setSpending(e.target.value)} placeholder={environment === 'lab' ? '20' : '5'} style={inputStyle} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={labelStyle} htmlFor="eng-notes">Observações</label>
                <input id="eng-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ex.: janela de teste, cuidado com rate limit" style={inputStyle} />
              </div>
            </div>
          </>
        )}

        {error && (
          <div style={{ color: 'var(--critical)', fontSize: 12.5, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '0.6rem 0.8rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
          {step === 2 && (
            <button type="button" onClick={() => setStep(1)} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--muted)', fontSize: 13, fontWeight: 600, padding: '0.55rem 1rem', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <ArrowLeft size={14} /> Voltar
            </button>
          )}
          <div style={{ flex: 1 }} />
          <Link href="/dashboard" style={{ color: 'var(--muted)', fontSize: 12.5, textDecoration: 'none', padding: '0.55rem 0.5rem' }}>Cancelar</Link>
          {step === 1 && hasStep2 ? (
            <button type="button" onClick={() => { if (!targetOk) { setError('Informe o alvo (domínio).'); return } setError(null); setStep(2) }} disabled={!targetOk} style={{
              display: 'flex', alignItems: 'center', gap: 7, background: targetOk ? 'var(--purple)' : 'var(--border)', border: 'none', borderRadius: 8,
              color: 'white', fontSize: 13.5, fontWeight: 700, padding: '0.55rem 1.2rem', cursor: targetOk ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            }}>
              Avançar <ArrowRight size={14} />
            </button>
          ) : (
            <button type="button" onClick={handleCreate} disabled={creating || !targetOk || !credsOk} style={{
              display: 'flex', alignItems: 'center', gap: 7, background: (targetOk && credsOk) ? 'var(--purple)' : 'var(--border)', border: 'none', borderRadius: 8,
              color: 'white', fontSize: 13.5, fontWeight: 700, padding: '0.55rem 1.2rem',
              cursor: creating || !targetOk || !credsOk ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: creating ? 0.75 : 1,
              boxShadow: (targetOk && credsOk) ? '0 0 18px var(--purple-glow-strong)' : 'none',
            }}>
              {creating ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Criando…</> : <><Radar size={14} /> Criar escopo (sem iniciar testes)</>}
            </button>
          )}
        </div>
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--text-mute)', textAlign: 'center', marginTop: 14 }}>
        Ao concluir, o engagement é criado como <strong style={{ color: 'var(--muted)' }}>ocioso</strong>. Os testes só começam quando você clicar em “Iniciar mapeamento automático”.
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
