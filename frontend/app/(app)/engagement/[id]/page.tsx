'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api, Engagement, ReportNarrativeStatus } from '@/lib/api'
import { useEngagementWS, WsMsg } from '@/hooks/useEngagementWS'
import { mergeMessages } from '@/lib/mergeMessages'
import { FindingsReport } from '@/components/findings/FindingsReport'
import { ScheduleSettings } from '@/components/engagement/ScheduleSettings'
import { ExecutionPanel } from '@/components/engagement/ExecutionPanel'
import { ModelSwitcher } from '@/components/engagement/ModelSwitcher'
import { FrameworkSwitcher } from '@/components/engagement/FrameworkSwitcher'
import { DomainPackSwitcher } from '@/components/engagement/DomainPackSwitcher'
import { CredentialPanel } from '@/components/engagement/CredentialPanel'
import { JobPipeline } from '@/components/engagement/JobPipeline'
import { useAuth } from '@/hooks/useAuth'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import {
  ArrowLeft, Wifi, WifiOff, Shield, FileText,
  Eye, Download, X, Clock, Wand2, Radar, Printer, ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import type { ReportFile } from '@/lib/api'

type Tab = 'exec' | 'findings' | 'report'

// Prompt do "Iniciar mapeamento automático" (Agente 1 black-box, recon→enum→vuln).
const AUTO_RUN_PROMPT =
  'Inicie o mapeamento automático do alvo como Agente 1 (black-box, sem credenciais): rode recon, depois enumeração, depois análise de vulnerabilidades não-autenticada (exploit-to-confirm), em sequência e sem me pedir confirmação entre as fases. Sua entrega tem DUAS metades: (1) um MAPA de superfície RICO — registre com generosidade como informational todo subdomínio, endpoint, tecnologia, parâmetro, token e exposição; (2) as vulnerabilidades que conseguir PROVAR sem credencial, marcadas confirmed com PoC. Candidato que você testar mas não fechar o PoC → probable (a confirmar), NÃO descarte. Cubra a superfície descoberta (não teste só uma amostra). Pare e pergunte apenas em checkpoint real (achado crítico ou decisão importante). Mostre os achados conforme forem surgindo.'

// Prompt do run AUTENTICADO (Azure/cloud): usa a credencial do ambiente e segue a
// metodologia do domain pack. NÃO é recon web black-box.
const AUTH_RUN_PROMPT =
  'Inicie a avaliação AUTENTICADA seguindo ESTRITAMENTE a metodologia do domain pack deste engagement. NÃO faça recon web black-box; NÃO reconcilie instruções de turnos anteriores — a autorização válida é o config/scope.yaml ATUAL (agent_role: authenticated). PASSO 1 (pré-voo, obrigatório): autentique com a credencial do ambiente (ex.: `az login --service-principal -u "$AZURE_CLIENT_ID" -p "$AZURE_CLIENT_SECRET" --tenant "$AZURE_TENANT_ID"`), confirme com `az account show` e `az account list`, e ME REPORTE numa mensagem clara se autenticou (quem sou eu, tenant, subscriptions) ou o ERRO EXATO. Se a autenticação FALHAR, PARE e me avise (não tente outra coisa). Só DEPOIS de confirmar a autenticação, prossiga para a enumeração READ-ONLY (identidade, subscriptions, RBAC atribuído, inventário de recursos, diretório/Entra) e a análise de caminhos de escalada, em sequência, sem me pedir confirmação entre as fases de leitura. Registre como informational tudo que enumerar e como confirmed o que tiver evidência clara (com o valor real: tenant/subscription id, role assignment, permissão). Antes de QUALQUER ação que altere estado, PARE e peça aprovação (checkpoint por-ação). Mostre os achados conforme surgirem.'

export default function EngagementPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [engagement, setEngagement]     = useState<Engagement | null>(null)
  const [tab, setTab]                   = useState<Tab>('exec')
  const [history, setHistory]           = useState<WsMsg[]>([])
  const [showSchedule, setShowSchedule] = useState(false)

  // ── Sessão do agente ──────────────────────────────────────────────────────────
  // A aba Chat saiu (ETAPA 3.2), mas a SESSÃO continua sendo o canal WS que a
  // Execução usa para comandar o agente (start/continue/stop/answer/relatório).
  // Mantemos apenas o activeSession — a UI de múltiplos chats foi removida.
  const [activeSession, setActiveSession] = useState<string | null>(null)  // null = ainda não carregado

  const { messages: liveMessages, connected, send, isThinking, isStreaming, agentRunning, runState: wsRunState, stopReason: wsStopReason, contextUsage, job, reconnectNonce } =
    useEngagementWS(id, activeSession)

  // Findings persistidos (banco) — reidratados via API. O feed AO VIVO zera a cada
  // refresh e os findings NÃO ficam no histórico de chat (chegam pelo watcher, fora
  // do ChatMessage), então sem isto o painel mostrava "Achados 0 / Superfície 0"
  // após recarregar, mesmo com findings salvos. Fonte de verdade: coleção Finding.
  const [persistedFindings, setPersistedFindings] = useState<WsMsg[]>([])

  // Merge/dedup extraído para helper puro (testado) — idempotente, então o botão
  // "Atualizar dados" pode reexecutar sem duplicar registros.
  const messages = useMemo(
    () => mergeMessages(history, liveMessages, persistedFindings) as WsMsg[],
    [history, liveMessages, persistedFindings]
  )

  // ── Loaders reutilizáveis (mesma lógica no mount, na reconexão e no refresh manual) ──
  const loadEngagement = useCallback(
    () => api.engagements.get(id).then(setEngagement),
    [id]
  )
  const loadFindings = useCallback(
    () => api.findings.list({ engagementId: id }).then((fs) =>
      setPersistedFindings(fs.map((f, i) => ({
        type: 'finding',
        _id: -100000 - i,
        id: f.id,
        title: f.title,
        severity: f.severity,
        description: f.description,
        cvss: f.cvss,
        state: f.state,
        engagement_id: f.engagement_id,
      } as WsMsg)))),
    [id]
  )
  const loadHistory = useCallback(() => {
    if (!activeSession) return Promise.resolve()
    return api.engagements.messages(id, activeSession).then((msgs) =>
      setHistory(msgs.map((m, i) => ({ ...m, _id: -(i + 1) } as WsMsg))))
  }, [id, activeSession])

  // ── Refresh manual (ETAPA 2.1): reusa os MESMOS loaders da atualização automática ──
  const refreshInFlight = useRef(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [refreshStatus, setRefreshStatus] = useState<'ok' | 'partial' | 'error' | null>(null)
  const refreshData = useCallback(async () => {
    if (refreshInFlight.current) return   // impede cliques concorrentes
    refreshInFlight.current = true
    setRefreshing(true)
    try {
      const results = await Promise.allSettled([loadEngagement(), loadFindings(), loadHistory()])
      const ok = results.filter((r) => r.status === 'fulfilled').length
      setRefreshStatus(ok === results.length ? 'ok' : ok === 0 ? 'error' : 'partial')
      setLastUpdated(Date.now())
    } finally {
      refreshInFlight.current = false
      setRefreshing(false)
    }
  }, [loadEngagement, loadFindings, loadHistory])

  // Load engagement (mount) — erro aqui volta ao dashboard (engagement inexistente).
  useEffect(() => {
    loadEngagement().catch(() => router.replace('/dashboard'))
  }, [loadEngagement, router])

  // Bootstrap da sessão: busca a lista e fixa a primeira como ativa — é o canal
  // WS que a Execução usa para comandar o agente. (Sem UI de múltiplos chats.)
  const bootstrapSession = useCallback(() => {
    api.engagements.sessions.list(id)
      .then((s) => { if (s.length > 0) setActiveSession((prev) => prev ?? s[0].id) })
      .catch(() => {})
  }, [id])

  useEffect(() => { bootstrapSession() }, [bootstrapSession])

  // Load history whenever active session changes (limpa antes p/ não misturar sessões)
  useEffect(() => {
    if (!activeSession) return
    setHistory([])
    loadHistory().catch(() => {})
  }, [loadHistory, activeSession])

  // REL-5: ao REconectar (queda de rede no meio de um run), recarrega o histórico
  // para recuperar mensagens/findings que chegaram durante a queda. Não limpa o
  // feed antes (evita flicker); o merge por _dbId com liveMessages dedup.
  useEffect(() => {
    if (reconnectNonce === 0) return
    // Recarrega tb. o engagement → o runState persistido (concluído/parado) volta fresco
    // mesmo que o evento run_state tenha passado durante a queda; sem isto o painel podia
    // continuar "rodando" após uma reconexão e exigir F5.
    loadEngagement().catch(() => {})
    loadHistory().catch(() => {})
  }, [reconnectNonce, loadHistory, loadEngagement])

  // Carrega findings persistidos do banco (no mount, ao trocar de engagement e a
  // cada reconexão) → o painel de Execução reflete os Achados/Superfície reais mesmo
  // logo após um refresh, sem depender do feed ao vivo.
  useEffect(() => {
    loadFindings().catch(() => {})
  }, [loadFindings, reconnectNonce])

  // Fallback: o sinal explícito agent_status é a fonte de verdade, mas mantemos
  // o OR com streaming caso um status se perca numa reconexão.
  const running = agentRunning || isThinking || isStreaming
  // A-STATE-1: estado do run derivado do backend — nunca de um flag local. Enquanto
  // o WS não informa (null), usa o valor persistido do engagement (sem "flash").
  const runState = (wsRunState ?? engagement?.runState ?? 'idle') as 'idle' | 'running' | 'stopped' | 'completed' | 'failed'
  // Motivo do desfecho (1.3): do WS ao vivo, com fallback no valor persistido —
  // assim o painel mostra o porquê da parada/falha mesmo logo após um refresh.
  const stopReason = (wsStopReason ?? engagement?.stopReason ?? null) as string | null

  function handleSend(text: string, extra?: Record<string, unknown>) {
    send({ type: 'operator_message', text, ...extra })
  }
  function handleAnswer(opt: string) {
    send({ type: 'operator_answer', option: opt, text: opt })
  }
  function handleStop() {
    send({ type: 'agent_stop' })
  }
  function handleCompact() {
    if (running || !connected) return
    handleSend('/rift-compact')
  }
  // Web = black-box; qualquer outro pack (azure/…) = autenticado (usa credencial).
  const isAuthPack = (engagement?.domainPackId || 'web') !== 'web'
  function handleStartAuto() {
    handleSend(isAuthPack ? AUTH_RUN_PROMPT : AUTO_RUN_PROMPT, { autoReport: true })
  }
  // A-STATE-5: retoma via --resume (o claude session_id persistido) — o agente
  // continua de onde parou, sem re-rodar recon.
  function handleContinueAuto() {
    handleSend(isAuthPack
      ? 'Continue a avaliação autenticada de onde parou, seguindo a metodologia do domain pack (enumeração read-only → análise de caminhos de escalada), usando a credencial do ambiente. Em sequência, sem me pedir confirmação entre as fases de leitura. Pare só em checkpoint (antes de qualquer ação que altere estado).'
      : 'Continue o mapeamento automático do alvo de onde parou, seguindo o mesmo plano (recon → enumeração → análise de vulnerabilidades não-autenticada, exploit-to-confirm), cobrindo a superfície descoberta (não só uma amostra). Candidato testado mas não fechado → probable (a confirmar), não descarte. Em sequência, sem me pedir confirmação entre as fases. Pare só em checkpoint real.',
      { autoReport: true })
  }
  // 1.3: CTAs pós-fase. O relatório do Rift é gerado a partir dos findings no banco
  // (sempre funciona, em qualquer framework) e vive na aba Relatório — então o botão
  // leva para lá. Além disso pede ao agente a narrativa (best-effort; no-op se a versão
  // não tiver /pentest-report). Fornecer credenciais inicia o handoff (Agente 2).
  function handleGenerateReport() {
    setTab('report')
    if ((engagement?.frameworkId || 'v2') === 'v2') handleSend('/pentest-report')
  }
  function handleProvideCredentials() {
    handleSend('Quero fornecer credenciais para teste autenticado (handoff para o Agente 2). Quais credenciais você precisa e como devo entregá-las com segurança?')
  }
  // A-STATE-5: run limpo — resetSession descarta a memória do agente no backend
  // antes de iniciar (o estado do engagement em disco permanece).
  function handleRestartAuto() {
    if (!confirm('Começar do zero: descarta a memória do agente E reseta as fases do framework (recon/enum/vuln voltam a ser executados do início). O escopo e os findings já salvos são mantidos. Continuar?')) return
    handleSend(isAuthPack ? AUTH_RUN_PROMPT : AUTO_RUN_PROMPT, { resetSession: true, autoReport: true })
  }

  if (!engagement) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)' }}>
        carregando...
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'exec',     label: 'Execução',  icon: <Radar size={14} /> },
    { id: 'findings', label: 'Findings',  icon: <Shield size={14} /> },
    { id: 'report',   label: 'Relatório', icon: <FileText size={14} /> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--surface)', flexShrink: 0,
      }}>
        <Link href="/dashboard" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={16} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 15 }}>{engagement.name}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{engagement.target}</div>
        </div>

        {tab === 'exec' && contextUsage && (
          <ContextMeter usage={contextUsage} onCompact={handleCompact} disabled={running || !connected} />
        )}

        {tab === 'exec' && <DomainPackSwitcher engagement={engagement} onUpdated={setEngagement} disabled={running} />}
        {tab === 'exec' && <FrameworkSwitcher engagement={engagement} onUpdated={setEngagement} disabled={running} />}
        {tab === 'exec' && <ModelSwitcher disabled={running} />}

        {isAdmin && (
          <button onClick={() => setShowSchedule(true)} title="Agendar scans recorrentes" style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: engagement.schedule?.enabled ? 'rgba(124,58,237,.12)' : 'transparent',
            border: `1px solid ${engagement.schedule?.enabled ? 'var(--purple)' : 'var(--border)'}`,
            borderRadius: 6, color: engagement.schedule?.enabled ? 'var(--purple-light)' : 'var(--muted)',
            fontSize: 12, padding: '0.35rem 0.7rem', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <Clock size={13} />
            {engagement.schedule?.enabled ? 'Agendado' : 'Agendar'}
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
          {connected
            ? <><Wifi size={13} color="var(--low)" /><span style={{ color: 'var(--low)' }}>conectado</span></>
            : <><WifiOff size={13} color="var(--muted)" /><span style={{ color: 'var(--muted)' }}>reconectando...</span></>}
        </div>
      </div>

      {showSchedule && engagement && (
        <ScheduleSettings
          engagement={engagement}
          onClose={() => setShowSchedule(false)}
          onUpdated={(e) => setEngagement(e)}
        />
      )}

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 2, padding: '0 1.25rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.6rem 1rem', fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            color: tab === t.id ? 'var(--purple-light)' : 'var(--muted)',
            borderBottom: tab === t.id ? '2px solid var(--purple)' : '2px solid transparent',
            marginBottom: -1, transition: 'color .15s',
          }}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {tab === 'exec' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px 0', flexShrink: 0 }}>
            <CredentialPanel engagement={engagement} disabled={running} />
            <JobPipeline engagementId={id} liveJob={job} />
          </div>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <ExecutionPanel
            engagement={engagement}
            messages={messages}
            onAnswer={handleAnswer}
            agentRunning={running}
            job={job}
            connected={connected}
            runState={runState}
            stopReason={stopReason}
            onStart={handleStartAuto}
            onStop={handleStop}
            onContinue={handleContinueAuto}
            onRestart={handleRestartAuto}
            onGenerateReport={handleGenerateReport}
            onProvideCredentials={handleProvideCredentials}
            onRefresh={refreshData}
            refreshing={refreshing}
            lastUpdated={lastUpdated}
            refreshStatus={refreshStatus}
          />
          </div>
        </div>
      )}

      {tab === 'findings' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <FindingsReport engagementId={id} />
        </div>
      )}

      {tab === 'report' && (
        <ReportTab engagementId={id} engagementName={engagement.name} isAdmin={isAdmin} />
      )}
    </div>
  )
}

// ── Context Meter ────────────────────────────────────────────────────────────

function ContextMeter({
  usage, onCompact, disabled,
}: {
  usage: { tokens: number; limit: number; percent: number }
  onCompact: () => void
  disabled: boolean
}) {
  const pct = Math.min(100, Math.max(0, usage.percent))
  const color = pct >= 85 ? 'var(--critical)' : pct >= 70 ? 'var(--medium)' : 'var(--purple)'
  const warn  = pct >= 70
  const kTokens = Math.round(usage.tokens / 1000)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        title={`Contexto: ~${kTokens}k de ${Math.round(usage.limit / 1000)}k tokens (${pct}%)`}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span style={{ fontSize: 11, color: warn ? color : 'var(--muted)', whiteSpace: 'nowrap' }}>
          memória {pct}%
        </span>
        <div style={{ width: 64, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .3s' }} />
        </div>
      </div>
      <button
        onClick={onCompact}
        disabled={disabled}
        title="Compactar contexto: salva o estado em disco e reinicia a conversa enxuta (economiza tokens)"
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: warn ? 'rgba(124,58,237,.12)' : 'transparent',
          border: `1px solid ${warn ? 'var(--purple)' : 'var(--border)'}`,
          borderRadius: 6, color: warn ? 'var(--purple-light)' : 'var(--muted)',
          fontSize: 12, padding: '0.35rem 0.7rem',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
          fontFamily: 'inherit',
        }}
      >
        <Wand2 size={13} />
        Compactar
      </button>
    </div>
  )
}

// ── Report Tab ────────────────────────────────────────────────────────────────

function canPreview(ext: string) {
  return ['.html', '.md', '.txt'].includes(ext)
}

function ReportTab({ engagementId, engagementName, isAdmin }: { engagementId: string; engagementName: string; isAdmin: boolean }) {
  const [type, setType]               = useState<'technical' | 'executive'>('technical')
  const [files, setFiles]             = useState<ReportFile[]>([])
  const [showRaw, setShowRaw]         = useState(false)
  const [preview, setPreview]         = useState<{ name: string; blobUrl: string; ext: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [nonce, setNonce]             = useState(0)   // força reload do iframe após gerar IA
  const [narr, setNarr]               = useState<ReportNarrativeStatus | null>(null)
  const [genState, setGenState]       = useState<'idle' | 'loading' | 'error'>('idle')
  const [genErr, setGenErr]           = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Relatório GERADO pelo Rift a partir dos findings (sempre disponível, bonito).
  const reportUrl = api.reports.generatedUrl(engagementId, type) + `&_=${nonce}`

  useEffect(() => {
    // Arquivos escritos pelo AGENTE (narrativa) — secundários, listados abaixo.
    api.reports.list(engagementId).then(setFiles).catch(() => {})
    // Status do resumo executivo por IA (existe? desatualizado?).
    api.reports.narrativeStatus(engagementId).then(setNarr).catch(() => setNarr(null))
  }, [engagementId])

  async function generateNarrative() {
    setGenState('loading'); setGenErr(null)
    try {
      const r = await api.reports.generateNarrative(engagementId)
      setNarr(r); setType('executive'); setNonce((n) => n + 1)   // recarrega o relatório com a narrativa
      setGenState('idle')
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : 'falha ao gerar'); setGenState('error')
    }
  }

  function printReport() {
    try { iframeRef.current?.contentWindow?.focus(); iframeRef.current?.contentWindow?.print() } catch {}
  }

  async function openPreview(f: ReportFile) {
    setPreviewLoading(true)
    try {
      const res = await fetch(f.viewUrl, { credentials: 'include' })
      if (!res.ok) throw new Error('Erro ao carregar')
      const blob = await res.blob()
      setPreview({ name: f.name, blobUrl: URL.createObjectURL(blob), ext: f.ext })
    } catch {
      alert('Erro ao carregar relatório')
    } finally {
      setPreviewLoading(false)
    }
  }
  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.blobUrl)
    setPreview(null)
  }

  // P2-41 (auditoria 2026-07-20): closePreview só revogava a blob URL em
  // fechamento EXPLÍCITO — navegar pra outra rota (SPA) com o modal aberto
  // nunca chamava closePreview, retendo o Blob na memória da aba pelo resto
  // da sessão. Cleanup no unmount/troca de preview cobre esse caso.
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview.blobUrl) }
  }, [preview])

  // P2-39: Esc fecha o modal + foco vai pro container ao abrir.
  const previewModalRef = useEscapeClose(!!preview, closePreview)

  const segBtn = (val: 'technical' | 'executive', label: string) => (
    <button onClick={() => setType(val)} style={{
      padding: '5px 14px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
      background: type === val ? 'var(--purple)' : 'transparent',
      color: type === val ? '#fff' : 'var(--muted)', border: 'none',
    }}>{label}</button>
  )
  const toolBtn = (onClick: () => void, icon: React.ReactNode, label: string, href?: string) => {
    const style: React.CSSProperties = {
      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6,
      fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none',
      background: 'rgba(124,58,237,.12)', color: 'var(--purple-light)', border: '1px solid rgba(124,58,237,.3)',
    }
    return href
      ? <a href={href} style={style}>{icon} {label}</a>
      : <button onClick={onClick} style={style}>{icon} {label}</button>
  }

  return (
    <>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {/* Barra de ações */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
            {segBtn('technical', 'Técnico')}
            {isAdmin && segBtn('executive', 'Executivo')}
          </div>
          {type === 'executive' && isAdmin && (
            <button
              onClick={generateNarrative}
              disabled={genState === 'loading'}
              title="Gera resumo executivo em prosa + cadeias de ataque a partir dos findings (1 chamada ao modelo, ~1 min)"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 6,
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                cursor: genState === 'loading' ? 'default' : 'pointer',
                background: 'rgba(124,58,237,.16)', color: 'var(--purple-light)',
                border: '1px solid var(--purple)', opacity: genState === 'loading' ? 0.7 : 1,
              }}
            >
              <Wand2 size={12} />
              {genState === 'loading' ? 'Gerando resumo (IA)… ~1 min' : narr?.exists ? 'Regerar resumo (IA)' : 'Gerar resumo (IA)'}
            </button>
          )}
          {type === 'executive' && narr?.exists && narr?.stale && genState !== 'loading' && (
            <span style={{ fontSize: 11, color: 'var(--medium)' }}>· resumo desatualizado (findings mudaram)</span>
          )}
          {genErr && <span style={{ fontSize: 11, color: 'var(--critical)' }}>{genErr}</span>}
          <div style={{ flex: 1 }} />
          {toolBtn(() => {}, <Download size={12} />, 'Baixar PDF', api.reports.pdfUrl(engagementId, type))}
          {toolBtn(printReport, <Printer size={12} />, 'Imprimir')}
          {toolBtn(() => {}, <ExternalLink size={12} />, 'Nova aba', reportUrl)}
        </div>

        {/* Relatório renderizado (nosso template, seguro para inline) */}
        <iframe
          ref={iframeRef}
          key={`${type}-${nonce}`}
          src={reportUrl}
          title={`Relatório ${type} — ${engagementName}`}
          style={{ flex: 1, border: 'none', background: '#161826', minHeight: 0 }}
          // Conteúdo é NOSSO template (findings escapados, sem <script>, CSP default-src 'none').
          // allow-same-origin permite o print pelo parent; allow-modals abre o diálogo de impressão.
          sandbox="allow-same-origin allow-modals"
        />

        {/* Relatórios narrativos do agente (secundário) */}
        {files.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0, maxHeight: '38%', overflowY: 'auto' }}>
            <button onClick={() => setShowRaw((v) => !v)} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              padding: '10px 16px', color: 'var(--muted)', fontSize: 12, fontWeight: 600,
            }}>
              <FileText size={13} /> Relatórios do agente ({files.length}) {showRaw ? '▾' : '▸'}
            </button>
            {showRaw && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px 16px' }}>
                {files.map((f) => (
                  <div key={f.name} style={{
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                    padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <FileText size={15} color="var(--purple-light)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--text)', fontWeight: 500, fontSize: 12.5 }}>{f.name}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                        {(f.size / 1024).toFixed(1)} KB · {f.ext.toUpperCase().replace('.', '')}
                      </div>
                    </div>
                    {canPreview(f.ext) && (
                      <button onClick={() => openPreview(f)} disabled={previewLoading} style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6,
                        fontSize: 12, fontWeight: 500, background: 'var(--surface)', color: 'var(--text)',
                        border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
                      }}><Eye size={12} /> Visualizar</button>
                    )}
                    <a href={f.url} download style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6,
                      fontSize: 12, fontWeight: 600, background: 'rgba(124,58,237,.12)', color: 'var(--purple-light)',
                      border: '1px solid rgba(124,58,237,.3)', textDecoration: 'none',
                    }}><Download size={12} /> Baixar</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {preview && (
        <div onClick={closePreview} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
        }}>
          <div
            ref={previewModalRef}
            role="dialog"
            aria-modal="true"
            aria-label={preview.name}
            tabIndex={-1}
            onClick={(ev) => ev.stopPropagation()}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              width: '100%', maxWidth: 1000, height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            }}>
              <FileText size={15} color="var(--purple-light)" />
              <span style={{ flex: 1, color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>{preview.name}</span>
              <a href={preview.blobUrl} download={preview.name} style={{
                display: 'flex', alignItems: 'center', gap: 4, color: 'var(--purple-light)', fontSize: 12,
                textDecoration: 'none', padding: '0.25rem 0.6rem', borderRadius: 4,
                border: '1px solid var(--purple)', background: 'var(--purple-glow)',
              }}><Download size={12} /> baixar</a>
              <button onClick={closePreview} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, display: 'flex' }}>
                <X size={18} />
              </button>
            </div>
            <iframe
              src={preview.blobUrl}
              style={{ flex: 1, border: 'none', background: preview.ext === '.html' ? '#fff' : 'var(--bg)' }}
              title={preview.name}
              sandbox=""
            />
          </div>
        </div>
      )}
    </>
  )
}
