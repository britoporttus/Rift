'use client'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { WsMsg } from '@/hooks/useEngagementWS'
import { Engagement } from '@/lib/api'
import {
  Play, Radar, ScanSearch, ShieldAlert, CheckCircle2, Loader2, Circle,
  AlertTriangle, HelpCircle, ChevronDown, ChevronRight, DollarSign, Terminal,
  Square, RotateCcw, PlayCircle, Globe, Network, Cpu, Shield, Link2, Server, Flag,
  BookOpen, Search, FileText, Crosshair, Bug, FolderSearch,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type RunState = 'idle' | 'running' | 'stopped' | 'completed'

// A-LIVE-2 (marcos): ícone por tipo de marco de progresso.
const MILESTONE_ICON: Record<string, LucideIcon> = {
  subdomains: Radar, dns: Server, hosts: Globe, ports: Network,
  tech: Cpu, waf: Shield, urls: Link2,
}

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--critical)', high: 'var(--high)', medium: 'var(--medium)',
  low: 'var(--low)', info: 'var(--info)',
}
const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info']

// Fases do Agente 1 (black-box). A timeline deriva o estado dos eventos phase_update.
const PHASES = [
  { key: 'recon', label: 'Recon',            icon: Radar,       hint: 'Mapeamento externo' },
  { key: 'enum',  label: 'Enumeração',       icon: ScanSearch,  hint: 'Superfície + assets' },
  { key: 'vuln',  label: 'Vulnerabilidades', icon: ShieldAlert, hint: 'Checagens simples' },
]

function normalizePhase(p: string): string {
  const s = p.toLowerCase()
  if (s.includes('recon')) return 'recon'
  if (s.includes('enum'))  return 'enum'
  if (s.includes('vuln'))  return 'vuln'
  if (s.includes('exploit')) return 'exploit'
  if (s.includes('post'))  return 'post'
  return s
}

// "Fazendo agora": traduz a ação crua (tool + args) numa frase de alto nível,
// legível para quem NÃO é técnico — esconde paths e comandos. Casos específicos
// (binário/arquivo) primeiro, fallback por tool depois. O comando cru continua
// disponível numa linha secundária apagada (para quem quiser o detalhe).
function humanizeAction(rawTool: unknown, rawArgs: unknown): { label: string; Icon: LucideIcon } {
  const tool = String(rawTool ?? '').toLowerCase()
  const a = String(rawArgs ?? '').toLowerCase()
  const has = (re: RegExp) => re.test(a)

  // ── comandos de terminal (Bash) — por ferramenta de pentest ──
  if (tool === 'bash') {
    if (has(/subfinder|amass|assetfinder|findomain|sublist3r/)) return { label: 'Enumerando subdomínios', Icon: Radar }
    if (has(/dnsx|massdns|\bdig\b|\bhost\b|resolv/))            return { label: 'Resolvendo registros DNS', Icon: Server }
    if (has(/httpx|httprobe/))                                  return { label: 'Sondando hosts vivos', Icon: Globe }
    if (has(/naabu|nmap|masscan|rustscan/))                     return { label: 'Escaneando portas e serviços', Icon: Network }
    if (has(/whatweb|wappalyzer|webanalyze/))                   return { label: 'Identificando tecnologias', Icon: Cpu }
    if (has(/katana|gau\b|waybackurls|hakrawler|gospider|urlfinder/)) return { label: 'Mapeando URLs e endpoints', Icon: Link2 }
    if (has(/ffuf|feroxbuster|gobuster|dirsearch|\bdirb\b|wfuzz/)) return { label: 'Procurando arquivos e rotas ocultas', Icon: FolderSearch }
    if (has(/nuclei/))                                          return { label: 'Rodando varredura de vulnerabilidades', Icon: ScanSearch }
    if (has(/sqlmap/))                                          return { label: 'Testando injeção de SQL', Icon: Bug }
    if (has(/dalfox|xsstrike/))                                 return { label: 'Testando Cross-Site Scripting (XSS)', Icon: Bug }
    if (has(/nikto|wpscan|joomscan/))                           return { label: 'Varredura do servidor web', Icon: ScanSearch }
    if (has(/testssl|sslscan|sslyze/))                          return { label: 'Analisando configuração TLS/SSL', Icon: Shield }
    if (has(/\bcurl\b|\bwget\b|httpie/))                        return { label: 'Fazendo requisições ao alvo', Icon: Globe }
    return { label: 'Executando comando no terminal', Icon: Terminal }
  }

  // ── leitura de arquivos (Read) — por caminho ──
  if (tool === 'read') {
    if (has(/scope\.ya?ml|\/config\//))    return { label: 'Verificando o escopo do engagement', Icon: Flag }
    if (has(/engagement-state/))           return { label: 'Lendo o estado do engagement', Icon: Flag }
    if (has(/routing-table/))              return { label: 'Definindo a estratégia de ataque', Icon: Crosshair }
    if (has(/skills\//))                   return { label: 'Consultando as skills do agente', Icon: BookOpen }
    if (has(/commands\/|\.claude/))        return { label: 'Carregando o playbook da fase', Icon: BookOpen }
    if (has(/finding/))                    return { label: 'Revisando os achados até agora', Icon: ShieldAlert }
    if (has(/report/))                     return { label: 'Revisando o relatório', Icon: FileText }
    return { label: 'Analisando arquivos do projeto', Icon: BookOpen }
  }

  // ── escrita (Write / Edit) ──
  if (tool === 'write' || tool === 'edit' || tool === 'multiedit') {
    if (has(/finding/))                    return { label: 'Registrando um achado', Icon: ShieldAlert }
    if (has(/report/))                     return { label: 'Escrevendo o relatório', Icon: FileText }
    if (has(/scope|state|\/config\//))     return { label: 'Salvando a configuração do escopo', Icon: Flag }
    return { label: 'Gravando resultados', Icon: FileText }
  }

  // ── busca / orquestração ──
  if (tool === 'grep' || tool === 'glob')          return { label: 'Procurando padrões no conteúdo', Icon: Search }
  if (tool === 'task' || tool === 'agent')         return { label: 'Ativando um agente especializado', Icon: Crosshair }
  if (tool === 'webfetch' || tool === 'websearch') return { label: 'Consultando fontes externas', Icon: Globe }
  if (tool === 'todowrite')                        return { label: 'Organizando o plano de ataque', Icon: Crosshair }

  const pretty = tool ? tool.charAt(0).toUpperCase() + tool.slice(1) : 'Processando'
  return { label: `Executando ${pretty}`, Icon: Terminal }
}

export function ExecutionPanel({
  engagement, messages, onAnswer, agentRunning, connected, runState, onStart, onStop, onContinue, onRestart,
}: {
  engagement: Engagement
  messages: WsMsg[]
  onAnswer: (opt: string) => void
  agentRunning: boolean
  connected: boolean
  runState: RunState
  onStart: () => void
  onStop: () => void
  onContinue: () => void
  onRestart: () => void
}) {
  const [feedOpen, setFeedOpen] = useState(false)
  // A-LIVE-2: qual marco está expandido (mostra o que foi encontrado).
  const [expandedMs, setExpandedMs] = useState<string | null>(null)

  // ── Findings (dedup por id, ordenado por severidade) ──────────────────────
  const findingMsgs = messages.filter((m) => m.type === 'finding')
  const allFindings = Object.values(
    findingMsgs.reduce((acc, f) => { acc[String(f.id ?? f._id)] = f; return acc }, {} as Record<string, WsMsg>)
  ).sort((a, b) => SEV_ORDER.indexOf(String(a.severity)) - SEV_ORDER.indexOf(String(b.severity)))

  // A-LIVE-3/4 + B-LINK: separar por taxonomia (state). Só `confirmed` é ACHADO;
  // `probable`/`informational` são SUPERFÍCIE/observações (o "mapa", muito ruído
  // esperado). `false_positive` some do painel. Isso mantém o painel baixo-ruído:
  // poucos achados, muito mapa — sem depender de a classificação estar perfeita.
  const confirmed = allFindings.filter((f) => String(f.state ?? '') === 'confirmed')
  const surface   = allFindings.filter((f) => {
    const st = String(f.state ?? '')
    return st !== 'confirmed' && st !== 'false_positive'   // probable/informational/(legado sem state)
  })
  const counts = SEV_ORDER.map((s) => ({ sev: s, n: confirmed.filter((f) => String(f.severity) === s).length }))

  // ── Fase atual / progresso (de phase_update) ──────────────────────────────
  const phaseUpdates = messages.filter((m) => m.type === 'phase_update')
  const latest = phaseUpdates[phaseUpdates.length - 1]
  const currentKey = latest ? normalizePhase(String(latest.phase ?? '')) : null
  const currentProgress = latest ? Number(latest.progress ?? 0) : 0
  const currentIdx = currentKey ? PHASES.findIndex((p) => p.key === currentKey) : -1

  function phaseStatus(idx: number): 'done' | 'running' | 'pending' {
    if (currentIdx === -1) {
      // sem phase_update ainda: se está rodando, a 1ª fase está em andamento
      return agentRunning && idx === 0 ? 'running' : 'pending'
    }
    if (idx < currentIdx) return 'done'
    if (idx === currentIdx) return currentProgress >= 100 ? 'done' : 'running'
    return 'pending'
  }

  // ── Decisão pendente (último agent_question ainda não respondido) ──────────
  let lastQ = -1
  messages.forEach((m, i) => { if (m.type === 'agent_question') lastQ = i })
  const answered = lastQ >= 0 && messages.slice(lastQ + 1).some(
    (m) => m.type === 'operator_message' || m.type === 'operator_answer'
  )
  const pendingQ = lastQ >= 0 && !answered ? messages[lastQ] : null

  // ── Custo ─────────────────────────────────────────────────────────────────
  // O cost_update do WS NÃO é persistido (não está em SAVE_TYPES) → some no reload
  // (por isso o custo "estacionava em $0.00"). Logo `costMsgs` contém APENAS os turnos
  // ao vivo desta sessão. Total = baseline persistido (soma de Usage no backend, em
  // engagement.costUsd, capturado no load) + a soma dos turnos ao vivo por cima. No
  // reload, o baseline já inclui os turnos anteriores e o live zera → segue correto.
  const costMsgs = messages.filter((m) => m.type === 'cost_update')
  const liveUsd = costMsgs.reduce((s, m) => s + Number(m.usd ?? 0), 0)
  const baselineUsd = Number((engagement as { costUsd?: number }).costUsd ?? 0)
  const usd = baselineUsd + liveUsd

  // ── Feed de atividade (mensagens/ações recentes do agente) ────────────────
  // Só ações em curso (não resultados) + mensagens — mantém o feed limpo.
  const feed = messages
    .filter((m) => m.type === 'agent_message' || (m.type === 'agent_action' && m.status !== 'done'))
    .slice(-40)

  // A-LIVE-1: "o que o agente faz AGORA" — última AÇÃO em curso + último resumo.
  // O resumo ignora linhas de [log] do CLI e mensagens de sistema/erro/bloqueio
  // (essas têm tratamento próprio) — senão a barra mostrava um log velho.
  const NOISE_RE = /^\[log\]|safeguard|API Error|cybersecurity|encerrado com erro|🛡️|🛑|⏹|⚠️/i
  let lastAction: WsMsg | null = null
  let lastAgentMsg: WsMsg | null = null
  for (let i = messages.length - 1; i >= 0 && (!lastAction || !lastAgentMsg); i--) {
    const m = messages[i]
    if (!lastAction && m.type === 'agent_action' && m.status !== 'done') lastAction = m
    if (!lastAgentMsg && m.type === 'agent_message') {
      const t = String(m.text ?? '').trim()
      if (t && !NOISE_RE.test(t)) lastAgentMsg = m
    }
  }
  const currentPhaseLabel = currentKey ? (PHASES.find((p) => p.key === currentKey)?.label ?? currentKey) : null

  // "Fazendo agora" legível: traduz a ação crua num rótulo de alto nível (+ ícone).
  const currentAction = lastAction ? humanizeAction(lastAction.tool, lastAction.args) : null
  const CurrentActionIcon = currentAction ? currentAction.Icon : null
  const currentActionRaw = lastAction
    ? `${String(lastAction.tool ?? '')} ${String(lastAction.args ?? '')}`.trim()
    : ''

  // "Run bloqueado": só se o ÚLTIMO turno (após a última msg do operador) produziu
  // um bloqueio de safeguard do modelo — não um erro genérico nem histórico velho.
  let lastOpIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].type === 'operator_message') { lastOpIdx = i; break } }
  let blockMsg: WsMsg | null = null
  for (let i = messages.length - 1; i > lastOpIdx; i--) {
    const m = messages[i]
    if (m.type === 'agent_message' && /safeguard|API Error|cybersecurity|🛡️/i.test(String(m.text ?? ''))) { blockMsg = m; break }
  }

  // Motivo da parada: só mostra "Run bloqueado" para bloqueio real de safeguard do
  // modelo no turno atual (blockMsg). Parada normal do operador não é bloqueio.
  const stopReason = (!agentRunning && runState === 'stopped' && blockMsg)
    ? String(blockMsg.text ?? '') : null

  // A-LIVE-2 (marcos): pontos concretos de progresso derivados do backend,
  // deduplicados por label, em ordem de descoberta.
  const seenMs = new Set<string>()
  const milestones: WsMsg[] = []
  for (const m of messages) {
    if (m.type !== 'milestone') continue
    const l = String(m.label ?? '')
    if (l && !seenMs.has(l)) { seenMs.add(l); milestones.push(m) }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>

      {/* HERO */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '1.1rem 1.25rem', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Mapeamento externo (Agente 1 · black-box)
          </div>
          <div style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, marginTop: 2 }}>
            {engagement.target}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <Stat label="Achados" value={String(confirmed.length)} />
          <Stat label="Superfície" value={String(surface.length)} />
          <Stat label="Custo" value={`$${usd.toFixed(2)}`} />
          <div style={{
            fontSize: 12, fontWeight: 600, padding: '0.3rem 0.7rem', borderRadius: 20,
            display: 'flex', alignItems: 'center', gap: 6,
            background: agentRunning ? 'rgba(124,58,237,.15)' : 'var(--bg)',
            border: `1px solid ${agentRunning ? 'var(--purple)' : runState === 'completed' ? 'var(--low)' : 'var(--border)'}`,
            color: agentRunning ? 'var(--purple-light)' : runState === 'completed' ? 'var(--low)' : 'var(--muted)',
          }}>
            {agentRunning
              ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> rodando</>
              : runState === 'completed' ? <><CheckCircle2 size={12} /> concluído</>
              : runState === 'stopped' ? 'parado'
              : 'não iniciado'}
          </div>
          {/* A-STATE-3: Parar sempre visível durante o run */}
          {agentRunning && (
            <button onClick={onStop} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: '1px solid var(--critical)', borderRadius: 8,
              color: 'var(--critical)', fontSize: 13, fontWeight: 600, padding: '0.35rem 0.9rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <Square size={12} fill="var(--critical)" /> Parar
            </button>
          )}
        </div>
      </div>

      {/* CTA — dirigido pelo runState do backend (A-STATE-2/5). Enquanto rodando,
          nenhum CTA de start aparece (o "Iniciar" fica travado); o Parar está no topo. */}
      {!agentRunning && runState === 'idle' && (
        <div style={{
          background: 'var(--surface)', border: '1px dashed var(--purple)', borderRadius: 12,
          padding: '2rem', textAlign: 'center', marginBottom: 16,
        }}>
          <div style={{ color: 'var(--text)', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            Pronto para mapear {engagement.target}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
            O Agente 1 roda recon → enumeração → vulnerabilidades simples automaticamente,
            sem credenciais, e mostra os achados aqui em tempo real.
          </div>
          <button onClick={onStart} disabled={!connected} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: connected ? 'var(--purple)' : 'var(--border)', border: 'none', borderRadius: 8,
            color: 'white', fontSize: 14, fontWeight: 600, padding: '0.6rem 1.4rem',
            cursor: connected ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
          }}>
            <Play size={15} /> Iniciar mapeamento automático
          </button>
        </div>
      )}

      {/* Depois de parado/concluído: retomar ou zerar (A-STATE-5) */}
      {!agentRunning && (runState === 'stopped' || runState === 'completed') && (
        <div style={{
          background: 'var(--surface)', border: `1px solid ${stopReason ? 'var(--critical)' : 'var(--border)'}`, borderRadius: 12,
          padding: '1.4rem 1.5rem', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              {runState === 'completed' ? 'Mapeamento concluído' : stopReason ? 'Run bloqueado' : 'Mapeamento parado'}
            </div>
            <div style={{ color: stopReason ? 'var(--critical)' : 'var(--muted)', fontSize: 12.5, lineHeight: 1.5 }}>
              {stopReason
                ? stopReason
                : runState === 'completed'
                ? 'O Agente 1 encerrou o ciclo. Você pode retomar (aprofundar) ou começar um novo mapeamento do zero.'
                : 'O run foi interrompido. Retome de onde parou (mantém o progresso do agente) ou comece do zero.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={onContinue} disabled={!connected} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: connected ? 'var(--purple)' : 'var(--border)', border: 'none', borderRadius: 8,
              color: 'white', fontSize: 13, fontWeight: 600, padding: '0.5rem 1.1rem',
              cursor: connected ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            }}>
              <PlayCircle size={14} /> Continuar
            </button>
            <button onClick={onRestart} disabled={!connected} title="Descarta a memória da sessão do agente e recomeça" style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: 'transparent', border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--muted)', fontSize: 13, fontWeight: 600, padding: '0.5rem 1.1rem',
              cursor: connected ? 'pointer' : 'not-allowed', opacity: connected ? 1 : 0.5, fontFamily: 'inherit',
            }}>
              <RotateCcw size={14} /> Começar do zero
            </button>
          </div>
        </div>
      )}

      {/* TIMELINE DE FASES */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 16,
      }}>
        {PHASES.map((p, idx) => {
          const st = phaseStatus(idx)
          const Icon = p.icon
          const color = st === 'done' ? 'var(--low)' : st === 'running' ? 'var(--purple)' : 'var(--border)'
          return (
            <div key={p.key} style={{
              flex: 1, background: 'var(--surface)', borderRadius: 10,
              border: `1px solid ${st === 'pending' ? 'var(--border)' : color}`,
              padding: '0.85rem', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Icon size={15} color={st === 'pending' ? 'var(--muted)' : color} />
                <span style={{ fontSize: 13, fontWeight: 600, color: st === 'pending' ? 'var(--muted)' : 'var(--text)' }}>
                  {p.label}
                </span>
                <span style={{ marginLeft: 'auto' }}>
                  {st === 'done'    && <CheckCircle2 size={14} color="var(--low)" />}
                  {st === 'running' && <Loader2 size={14} color="var(--purple)" style={{ animation: 'spin 1s linear infinite' }} />}
                  {st === 'pending' && <Circle size={13} color="var(--border)" />}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.hint}</div>
              {st === 'running' && (
                <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${currentProgress || 15}%`, background: 'var(--purple)', transition: 'width .3s' }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ATIVIDADE ATUAL (A-LIVE-1) — o que o agente faz agora, legível */}
      {agentRunning && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--purple)', borderRadius: 12,
          padding: '1rem 1.15rem', marginBottom: 16, boxShadow: '0 0 0 3px var(--purple-glow)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Loader2 size={14} color="var(--purple-light)" style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ color: 'var(--purple-light)', fontWeight: 600, fontSize: 13 }}>Fazendo agora</span>
            {currentPhaseLabel && (
              <span style={{
                marginLeft: 2, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                color: 'var(--purple-light)', border: '1px solid var(--purple)', borderRadius: 20, padding: '1px 8px',
              }}>{currentPhaseLabel}</span>
            )}
          </div>
          {currentAction && CurrentActionIcon ? (
            <div style={{
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '0.6rem 0.75rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--text)' }}>
                <CurrentActionIcon size={15} color="var(--purple-light)" style={{ flexShrink: 0 }} />
                <span style={{ fontWeight: 500 }}>{currentAction.label}</span>
              </div>
              {currentActionRaw && (
                <div style={{
                  marginTop: 5, fontSize: 10.5, color: 'var(--muted)', opacity: 0.5,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{currentActionRaw.slice(0, 120)}</div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Preparando o ambiente…</div>
          )}
          {lastAgentMsg && (
            <div style={{
              marginTop: 8, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {String(lastAgentMsg.text ?? '').replace(/\s+/g, ' ').slice(0, 220)}
            </div>
          )}
        </div>
      )}

      {/* MARCOS DO MAPEAMENTO (A-LIVE-2) — pontos concretos de progresso */}
      {milestones.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Flag size={14} color="var(--purple-light)" /> Marcos do mapeamento
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{milestones.length}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {milestones.slice(0, 30).map((m) => {
              const Icon = MILESTONE_ICON[String(m.kind ?? '')] ?? CheckCircle2
              const id = String(m._id)
              const items = Array.isArray(m.items) ? (m.items as unknown[]).map(String) : []
              const hasItems = items.length > 0
              const open = expandedMs === id
              return (
                <button
                  key={id}
                  onClick={() => hasItems && setExpandedMs(open ? null : id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    background: open ? 'rgba(124,58,237,.12)' : 'var(--surface)',
                    border: `1px solid ${open ? 'var(--purple)' : 'var(--border)'}`, borderRadius: 8,
                    padding: '0.4rem 0.7rem', fontSize: 12.5, fontFamily: 'inherit',
                    cursor: hasItems ? 'pointer' : 'default', color: 'var(--text)',
                  }}
                >
                  <Icon size={13} color="var(--purple-light)" style={{ flexShrink: 0 }} />
                  <span>{String(m.label ?? '')}</span>
                  {m.source ? <span style={{ color: 'var(--text-mute)', fontSize: 10.5, fontFamily: 'var(--mono, monospace)' }}>{String(m.source)}</span> : null}
                  {hasItems && (open ? <ChevronDown size={12} color="var(--muted)" /> : <ChevronRight size={12} color="var(--muted)" />)}
                </button>
              )
            })}
            {milestones.length > 30 && (
              <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-mute)', fontSize: 11.5, padding: '0.4rem 0.2rem' }}>
                + {milestones.length - 30} marcos
              </div>
            )}
          </div>

          {/* Detalhe do marco expandido — o QUE foi encontrado */}
          {expandedMs && (() => {
            const m = milestones.find((x) => String(x._id) === expandedMs)
            const items = m && Array.isArray(m.items) ? (m.items as unknown[]).map(String) : []
            if (!m || !items.length) return null
            return (
              <div style={{
                marginTop: 8, background: 'var(--surface)', border: '1px solid var(--purple)',
                borderRadius: 10, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '0.5rem 0.85rem', borderBottom: '1px solid var(--border)',
                  fontSize: 12, color: 'var(--purple-light)', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {String(m.label ?? '')}
                  <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>· {items.length} item{items.length > 1 ? 's' : ''}</span>
                </div>
                <div style={{
                  maxHeight: 220, overflowY: 'auto', padding: '0.5rem 0.85rem',
                  display: 'flex', flexDirection: 'column', gap: 3,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12,
                }}>
                  {items.map((it, i) => (
                    <div key={i} style={{ color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it}</div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* DECISÃO PENDENTE */}
      {pendingQ && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--purple)', borderRadius: 12,
          padding: '1rem 1.15rem', marginBottom: 16,
          boxShadow: '0 0 0 3px var(--purple-glow)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--purple-light)', fontWeight: 600, fontSize: 13 }}>
            <HelpCircle size={15} /> Decisão necessária
          </div>
          <div style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
            <ReactMarkdown>{String(pendingQ.text ?? '')}</ReactMarkdown>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(Array.isArray(pendingQ.options) ? pendingQ.options as string[] : []).map((opt) => (
              <button key={opt} onClick={() => onAnswer(opt)} style={{
                background: 'var(--purple)', border: 'none', borderRadius: 8, color: 'white',
                fontSize: 13, fontWeight: 600, padding: '0.5rem 1rem', cursor: 'pointer', fontFamily: 'inherit',
              }}>{opt}</button>
            ))}
          </div>
        </div>
      )}

      {/* ACHADOS CONFIRMADOS (B-LINK: só state=confirmed) */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={15} color="var(--high)" /> Achados confirmados
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {counts.filter((c) => c.n > 0).map((c) => (
              <span key={c.sev} style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                color: SEV_COLOR[c.sev], border: `1px solid ${SEV_COLOR[c.sev]}`, borderRadius: 20,
                padding: '1px 8px',
              }}>{c.n} {c.sev}</span>
            ))}
          </div>
        </div>

        {confirmed.length === 0 ? (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '1.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: 13,
          }}>
            {agentRunning
              ? 'Só entra aqui o que passa na verificação. Enquanto isso, o que foi observado aparece no mapa de superfície abaixo.'
              : 'Nenhum achado confirmado ainda.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }}>
            {confirmed.map((f) => {
              const sev = String(f.severity ?? 'info')
              const conf = String(f.confidence ?? '')
              const desc = String(f.description ?? '').replace(/\s+/g, ' ').trim()
              return (
                <div key={String(f._id)} style={{
                  background: 'var(--surface)', border: `1px solid ${SEV_COLOR[sev] ?? 'var(--border)'}`,
                  borderLeft: `3px solid ${SEV_COLOR[sev] ?? 'var(--border)'}`, borderRadius: 8, padding: '0.75rem 0.9rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ color: SEV_COLOR[sev], fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {sev}
                    </span>
                    <CheckCircle2 size={12} color="var(--low)" />
                    {conf && (
                      <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        confiança {conf === 'high' ? 'alta' : conf === 'low' ? 'baixa' : 'média'}
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.45, fontWeight: 500 }}>{String(f.title ?? '')}</div>
                  {desc && (
                    <div style={{ color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.5, marginTop: 4,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {desc}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MAPA DE SUPERFÍCIE (A-LIVE-3/4: probable/informational — observações, não achados) */}
      {surface.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Radar size={15} color="var(--purple-light)" /> Mapa de superfície
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              {surface.length} observaç{surface.length === 1 ? 'ão' : 'ões'} · hosts, tecnologias e exposições vistas (não confirmadas)
            </span>
          </div>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            maxHeight: 300, overflowY: 'auto',
          }}>
            {surface.slice(0, 60).map((f, i) => {
              const sev = String(f.severity ?? 'info')
              const st  = String(f.state ?? '')
              return (
                <div key={String(f._id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 0.85rem',
                  borderTop: i === 0 ? 'none' : '1px solid rgba(45,45,78,.35)',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: SEV_COLOR[sev] ?? 'var(--muted)', flexShrink: 0, opacity: 0.8 }} />
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {String(f.title ?? '')}
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 600, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    {st === 'probable' ? 'provável' : 'informativo'}
                  </span>
                </div>
              )
            })}
            {surface.length > 60 && (
              <div style={{ padding: '0.5rem 0.85rem', borderTop: '1px solid rgba(45,45,78,.35)', color: 'var(--text-mute)', fontSize: 11.5 }}>
                + {surface.length - 60} outras observações (ver aba Findings)
              </div>
            )}
          </div>
        </div>
      )}

      {/* FEED DE ATIVIDADE (colapsável, secundário) */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <button onClick={() => setFeedOpen((v) => !v)} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0.7rem 1rem',
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          color: 'var(--muted)', fontSize: 12,
        }}>
          {feedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Terminal size={13} /> Atividade do agente ({feed.length})
        </button>
        {feedOpen && (
          <div style={{ maxHeight: 320, overflowY: 'auto', padding: '0 1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {feed.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 12, padding: '0.5rem 0' }}>Sem atividade ainda.</div>
            ) : feed.map((m) => (
              <div key={String(m._id)} style={{ fontSize: 12, color: m.type === 'agent_action' ? 'var(--purple-light)' : 'var(--text)', lineHeight: 1.5, borderBottom: '1px solid rgba(45,45,78,.4)', paddingBottom: 5 }}>
                {m.type === 'agent_action'
                  ? <span><Terminal size={10} style={{ display: 'inline', marginRight: 4 }} />{String(m.tool ?? '')} {m.args ? <span style={{ color: 'var(--muted)' }}>{String(m.args).slice(0, 80)}</span> : null}</span>
                  : <span>{String(m.text ?? '').slice(0, 240)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  )
}
