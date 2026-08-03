'use client'
import { useState } from 'react'
import { api, DomainVerification } from '@/lib/api'
import { Card, Btn, Badge, tint, R } from '@/components/ui/kit'
import {
  ShieldCheck, ShieldAlert, Loader2, Copy, Check, AlertTriangle, Clock,
} from 'lucide-react'

/**
 * Prova de posse do domínio.
 *
 * Regra (2026-08-03): sem verificar, NADA roda — nem coleta passiva. Por isso
 * este card aparece no topo e é a única coisa acionável enquanto o domínio
 * estiver pendente: mostrar o assessment vazio de um domínio bloqueado só
 * confundiria ("cadastrei e não aconteceu nada").
 *
 * `legacy` = cadastrado antes da regra existir. Continua escaneando (senão a
 * operação pararia), mas aparece como pendência em vez de virar aprovação
 * silenciosa.
 */
export function VerificationCard({ domainId, domain, verification, onVerified }: {
  domainId: string
  domain: string
  verification?: DomainVerification
  onVerified: () => void
}) {
  const [state, setState] = useState<DomainVerification | undefined>(verification)
  const [busy, setBusy] = useState(false)
  const [loadedInstructions, setLoaded] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const status = state?.status || 'pending'
  if (status === 'verified') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--low)' }}>
        <ShieldCheck size={15} />
        Posse verificada{state?.method ? ` por ${state.method === 'dns' ? 'registro DNS' : 'arquivo no servidor'}` : ''}
      </div>
    )
  }

  // Carrega as instruções sob demanda — o token só interessa a quem vai publicar.
  async function loadInstructions() {
    try { setState(await api.domains.verification(domainId)); setLoaded(true) } catch { /* silencioso */ }
  }
  async function runVerify() {
    setBusy(true)
    try {
      const r = await api.domains.verify(domainId)
      setState(r)
      if (r.status === 'verified') onVerified()
    } catch (e) {
      // O backend responde 422 com o motivo — recarrega o estado para exibi-lo.
      await loadInstructions()
      const msg = e instanceof Error ? e.message : 'Falha ao verificar'
      setState((s) => ({ ...(s || { status: 'failed' }), status: 'failed', lastError: msg }))
    } finally { setBusy(false) }
  }
  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800)
    }).catch(() => {})
  }

  const isLegacy = status === 'legacy'
  const accent = isLegacy ? 'var(--medium)' : 'var(--high)'
  const ins = state?.instructions

  return (
    <Card accent={accent} pad="1.2rem 1.4rem">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: accent, display: 'flex', marginTop: 2 }}>
          {isLegacy ? <Clock size={18} /> : <ShieldAlert size={18} />}
        </span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {isLegacy ? 'Verificação de posse pendente' : 'Confirme que este domínio é seu'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.55, maxWidth: 640 }}>
            {isLegacy ? (
              <>Este domínio foi cadastrado antes da regra de verificação e <strong style={{ color: 'var(--text)' }}>continua
              sendo escaneado</strong>. Regularize quando puder — leva um registro DNS.</>
            ) : (
              <>O scan sai da nossa infraestrutura, então precisamos da prova de que você
              controla <strong style={{ color: 'var(--text)' }}>{domain}</strong> antes de tocar nele.
              Publique <strong style={{ color: 'var(--text)' }}>um</strong> dos dois abaixo.</>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {isLegacy && <Badge color="var(--medium)">LEGADO</Badge>}
          {!ins && !loadedInstructions && (
            <Btn onClick={loadInstructions}>Ver instruções</Btn>
          )}
          <Btn variant="primary" onClick={runVerify} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
            {busy ? 'Verificando…' : 'Verificar agora'}
          </Btn>
        </div>
      </div>

      {state?.lastError && (
        <div style={{
          marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start',
          background: tint('var(--high)', 8), border: `1px solid ${tint('var(--high)', 26)}`,
          borderRadius: R.row, padding: '0.6rem 0.85rem', fontSize: 12, color: 'var(--high)', lineHeight: 1.5,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{state.lastError}</span>
        </div>
      )}

      {ins && (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          <Method
            n={1} title="Registro DNS (recomendado)"
            hint="Prova que você controla a zona. Pode levar alguns minutos para propagar."
            rows={[['Tipo', ins.dns.type], ['Nome', ins.dns.name], ['Valor', ins.dns.value]]}
            copied={copied} onCopy={copy} copyKey="dns" copyText={ins.dns.value}
          />
          <Method
            n={2} title="Arquivo no servidor"
            hint="Mais rápido se você não administra o DNS. O conteúdo tem que ser exatamente o token."
            rows={[['URL', ins.http.url], ['Conteúdo', ins.http.content]]}
            copied={copied} onCopy={copy} copyKey="http" copyText={ins.http.content}
          />
        </div>
      )}
      <style jsx global>{`.spin { animation: spin 0.9s linear infinite; }`}</style>
    </Card>
  )
}

function Method({ n, title, hint, rows, copied, onCopy, copyKey, copyText }: {
  n: number; title: string; hint: string; rows: [string, string][]
  copied: string | null; onCopy: (t: string, k: string) => void; copyKey: string; copyText: string
}) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: R.row, padding: '0.85rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0, fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: tint('var(--purple)', 16), color: 'var(--purple-light)',
        }}>{n}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
        <button onClick={() => onCopy(copyText, copyKey)} title="Copiar o token"
          style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
            color: copied === copyKey ? 'var(--low)' : 'var(--muted)', fontSize: 11,
            padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit',
          }}>
          {copied === copyKey ? <Check size={11} /> : <Copy size={11} />}
          {copied === copyKey ? 'copiado' : 'copiar'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', alignItems: 'baseline' }}>
        {rows.map(([k, v]) => (
          <span key={k} style={{ display: 'contents' }}>
            <span style={{ fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</span>
            <span style={{ fontSize: 11.5, fontFamily: 'var(--mono)', color: 'var(--text)', wordBreak: 'break-all' }}>{v}</span>
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.5 }}>{hint}</div>
    </div>
  )
}
