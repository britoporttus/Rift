'use strict'
// Gerador de relatório do Rift a partir dos FINDINGS no banco. Independe do agente /
// framework (sempre funciona), HTML self-contained (pronto para impressão/PDF).
// Design "Nocturne" (dark) — reproduzido do template do operador. Dois formatos:
// 'technical' (completo, com índice + cards) e 'executive' (C-level, resumo + IA).
//
// SEGURANÇA: todo conteúdo derivado de findings/alvo é escapado (escapeHtml) — o template
// é NOSSO, então renderizar inline é seguro (o XSS temido era do HTML do agente).

// Cores de severidade no tema dark (do template): tile/borda + dot no índice.
const SEV = {
  critical: { label: 'Crítica', color: '#e07a7a', order: 0 },
  high:     { label: 'Alta',    color: '#e0954f', order: 1 },
  medium:   { label: 'Média',   color: '#d9b74f', order: 2 },
  low:      { label: 'Baixa',   color: '#63b68c', order: 3 },
  info:     { label: 'Info',    color: '#8b93d6', order: 4 },
}
const STATE = {
  confirmed:     { label: 'Confirmado',  color: '#e07a7a' },
  probable:      { label: 'Provável',    color: '#d9b74f' },
  informational: { label: 'Informativo', color: '#8b93d6' },
  false_positive:{ label: 'Falso-positivo', color: '#9397ab' },
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function para(s) {
  const e = escapeHtml(s).trim()
  return e ? e.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') : ''
}
function sevOf(f) { return (f.severity || 'info').toLowerCase() }
function stateOf(f) { return (f.state || (f.confirmed ? 'confirmed' : 'informational')).toLowerCase() }

function severityCounts(findings) {
  const c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  for (const f of findings) { const s = sevOf(f); if (s in c) c[s]++ }
  return c
}
function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) } catch { return '' }
}

// SVGs inline (sem dependência de icon-font). currentColor herda a cor do contexto.
const SVG = {
  shield: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 2l8 3.5v5.5c0 5-3.6 8.4-8 9.5-4.4-1.1-8-4.5-8-9.5V5.5z"/><path d="M9 12l2 2 4-4"/></svg>',
  globe:  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/></svg>',
  caret:  '<svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>',
}

const CSS = `
:root{
  --bg:#161826;--surface:#232532;--text:#e9e9ed;--accent:#9184d9;
  --divider:rgba(233,233,237,.16);
  --n200:#e4e7f5;--n300:#cfd3e5;--n400:#b2b6ca;--n500:#9397ab;
  --rsm:4px;--rmd:8px;--rlg:14px;--code:#12131c;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-size:15px;line-height:1.55;font-weight:400;
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
a{color:var(--accent)}
.wrap{max-width:920px;margin:0 auto;padding:0 34px 72px}
.cover{position:relative;padding:44px 0 0;margin-bottom:8px}
.cover .topbar{position:absolute;top:0;left:-34px;right:-34px;height:3px;background:linear-gradient(90deg,transparent,var(--accent),transparent)}
.kicker{display:flex;align-items:center;gap:9px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:600}
.cover h1{font-size:44px;line-height:1.08;margin:16px 0 10px;letter-spacing:-.02em;font-weight:600}
.chip{display:inline-flex;align-items:center;gap:8px;font-family:ui-monospace,Menlo,monospace;font-size:14px;color:var(--n300);
  background:var(--surface);border:1px solid var(--divider);border-radius:var(--rmd);padding:6px 12px}
.chip svg{color:var(--accent)}
.meta{display:flex;flex-wrap:wrap;gap:36px;margin-top:30px}
.meta .l{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--n500)}
.meta .v{font-size:15px;font-weight:600;margin-top:3px}
section{margin-top:44px}
h2.sec{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--n400);margin:0 0 20px;font-weight:600}
.tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.tile{border:1px solid var(--divider);border-radius:var(--rlg);padding:18px 14px;background:var(--surface)}
.tile .n{font-size:30px;font-weight:600;line-height:1}
.tile .l{font-size:11px;letter-spacing:.05em;text-transform:uppercase;margin-top:8px;color:var(--n400)}
table.toc{width:100%;border-collapse:collapse;font-size:13px;background:var(--surface);border:1px solid var(--divider);border-radius:var(--rlg);overflow:hidden}
table.toc th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--n400);padding:11px 14px;border-bottom:1px solid var(--divider);font-weight:600}
table.toc td{padding:10px 14px;border-bottom:1px solid var(--divider);vertical-align:middle}
table.toc tr:last-child td{border-bottom:none}
.mono{font-family:ui-monospace,Menlo,monospace}
.finding{background:var(--surface);border:1px solid var(--divider);border-radius:var(--rlg);overflow:hidden;margin-bottom:12px}
.finding>summary{display:flex;align-items:flex-start;gap:14px;padding:18px 20px;cursor:pointer;list-style:none}
.finding>summary::-webkit-details-marker{display:none}
.finding .chev{color:var(--n400);margin-top:2px;flex-shrink:0;transition:transform .18s}
.finding[open] .chev{transform:rotate(90deg)}
.fmeta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.fid{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--n500)}
.pill{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--n400);border:1px solid var(--divider);border-radius:var(--rsm);padding:2px 7px}
.sev-badge{font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px}
.finding h3{font-size:18px;margin:0;line-height:1.25;font-weight:600}
.fbody{padding:0 20px 20px 48px;display:flex;flex-direction:column;gap:16px}
.field .k{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:6px;display:block}
.field p{margin:0;font-size:13.5px;color:var(--n200);line-height:1.6}
.field .loc{font-family:ui-monospace,Menlo,monospace;color:var(--n200)}
pre.ev{margin:0;font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.6;color:var(--n300);
  background:var(--code);border:1px solid var(--divider);border-radius:var(--rmd);padding:14px 16px;white-space:pre-wrap;word-break:break-word;overflow-x:auto}
.secret{display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:12px;background:var(--code);color:var(--n200);
  border:1px solid var(--divider);border-radius:var(--rsm);padding:3px 8px;margin:0 6px 6px 0;word-break:break-all}
.ai{border:1px solid var(--divider);border-left:3px solid var(--accent);border-radius:var(--rlg);padding:18px 20px;background:var(--surface)}
.ai-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.ai-head b{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.ai-seal{font-size:10px;font-weight:700;color:#d9b74f;border:1px solid #d9b74f55;border-radius:999px;padding:2px 8px}
.ai p{font-size:14px;color:var(--n200);margin:0 0 10px;line-height:1.65}
.ai h4{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin:16px 0 6px}
.ai ul{margin:0;padding-left:18px}.ai li{font-size:13.5px;margin-bottom:6px;color:var(--n200);line-height:1.55}
.risk-chip{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;color:#161826}
.empty{padding:44px;text-align:center;color:var(--n400)}
.footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--divider);color:var(--n500);font-size:11.5px}
@page{margin:14mm}
@media (max-width:640px){.tiles{grid-template-columns:repeat(3,1fr)}.wrap{padding-left:20px;padding-right:20px}.cover h1{font-size:34px}}
`

function shell(title, body) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>${CSS}</style></head><body><div class="wrap">${body}</div></body></html>`
}

function cover(engagement, kicker, metaItems) {
  const meta = metaItems.filter(Boolean).map((m) => `<div><div class="l">${m[0]}</div><div class="v">${escapeHtml(m[1])}</div></div>`).join('')
  return `<div class="cover">
    <div class="topbar"></div>
    <div class="kicker">${SVG.shield} ${escapeHtml(kicker)}</div>
    <h1>${escapeHtml(engagement.name || 'Engagement')}</h1>
    <div class="chip">${SVG.globe}${escapeHtml(engagement.target || '')}</div>
    <div class="meta">${meta}</div>
  </div>`
}

function summaryTiles(counts) {
  const tiles = ['critical', 'high', 'medium', 'low', 'info'].map((s) => {
    const m = SEV[s]
    return `<div class="tile" style="border-top:2px solid ${m.color}"><div class="n" style="color:${m.color}">${counts[s]}</div><div class="l">${m.label}</div></div>`
  }).join('')
  return `<section><h2 class="sec">Resumo executivo</h2><div class="tiles">${tiles}</div></section>`
}

function sortFindings(findings) {
  return [...findings].sort((a, b) => {
    const sa = (SEV[sevOf(a)] || SEV.info).order, sb = (SEV[sevOf(b)] || SEV.info).order
    if (sa !== sb) return sa - sb
    return (stateOf(a) === 'confirmed' ? 0 : 1) - (stateOf(b) === 'confirmed' ? 0 : 1)
  })
}
function anchorId(i) { return `f-${String(i + 1).padStart(3, '0')}` }
function displayId(f, i) { return f.id && /^[\w-]{2,20}$/.test(f.id) ? f.id : `F-${String(i + 1).padStart(3, '0')}` }

// Índice de findings (TOC) com âncoras clicáveis.
function tocSection(sorted) {
  const rows = sorted.map((f, i) => {
    const s = sevOf(f), m = SEV[s] || SEV.info, a = anchorId(i)
    return `<tr><td><a href="#${a}" class="mono" style="text-decoration:none;color:var(--accent)">${escapeHtml(displayId(f, i))}</a></td>
      <td><span style="color:${m.color}">● ${m.label}</span></td>
      <td><a href="#${a}" style="text-decoration:none;color:var(--text)">${escapeHtml(f.title || '')}</a></td>
      <td style="color:var(--n400)">${escapeHtml(f.type || '—')}</td>
      <td style="text-align:right" class="mono">${f.cvss ? escapeHtml(f.cvss) : '—'}</td></tr>`
  }).join('')
  return `<section><h2 class="sec">Índice de findings</h2>
    <table class="toc"><thead><tr>
      <th style="width:64px">ID</th><th style="width:100px">Sev.</th><th>Finding</th><th style="width:150px">Tipo</th><th style="width:70px;text-align:right">CVSS</th>
    </tr></thead><tbody>${rows}</tbody></table></section>`
}

// `detail: 'summary'` = plano free. Mostra QUE existe o achado, sua gravidade e
// onde — o suficiente para o valor ser óbvio — mas retém o que se compra ao
// assinar: descrição completa, payload, evidência, impacto e recomendação.
// Reter é diferente de esconder: o card diz explicitamente o que falta e por quê,
// em vez de simplesmente aparecer vazio (o que pareceria produto quebrado).
// Bloco que substitui o detalhe no plano free. Explícito de propósito: um card
// vazio pareceria produto quebrado; dizer o que falta e por quê é honesto e é o
// próprio argumento de venda.
function lockedDetail() {
  return `<div class="field"><span class="k">Detalhe técnico</span>
    <p>Descrição completa, evidência, payload de reprodução, impacto e recomendação
    de correção fazem parte do relatório completo. Este resumo mostra o que foi
    encontrado e a gravidade; o como reproduzir e como corrigir vem no plano Pro.</p>
  </div>`
}

function findingCard(f, i, detail = 'full') {
  const s = sevOf(f), st = stateOf(f), m = SEV[s] || SEV.info, sm = STATE[st] || STATE.informational
  const field = (k, v, mono) => v ? `<div class="field"><span class="k">${k}</span><p class="${mono ? 'loc' : ''}">${mono ? escapeHtml(v) : para(v)}</p></div>` : ''
  const pills = [f.type, f.cvss ? `CVSS ${f.cvss}` : '', f.cwe, f.owasp].filter(Boolean).map((p) => `<span class="pill">${escapeHtml(p)}</span>`).join('')
  const evidence = f.evidence ? `<div class="field"><span class="k">Evidência</span><pre class="ev">${escapeHtml(f.evidence)}</pre></div>` : ''
  return `<details class="finding" id="${anchorId(i)}" open style="border-left:3px solid ${m.color}">
    <summary>
      ${SVG.caret}
      <div style="flex:1;min-width:0">
        <div class="fmeta">
          <span class="fid">${escapeHtml(displayId(f, i))}</span>
          <span class="sev-badge" style="background:${m.color}22;color:${m.color}">${m.label}</span>
          <span class="sev-badge" style="background:${sm.color}22;color:${sm.color}">${sm.label}</span>
          ${pills}
        </div>
        <h3>${escapeHtml(f.title || `Finding ${i + 1}`)}</h3>
      </div>
    </summary>
    <div class="fbody">
      ${f.location ? field('Localização', f.location + (f.parameter ? ` · param: ${f.parameter}` : ''), true) : ''}
      ${detail === 'summary' ? lockedDetail() : `
      ${field('Descrição', f.description)}
      ${f.payload ? field('Payload', f.payload, true) : ''}
      ${evidence}
      ${field('Impacto', f.impact)}
      ${field('Recomendação', f.recommendation)}`}
    </div>
  </details>`
}

// ── Segredos & informações descobertas (extraído dos findings) ──────────────────────
// IPs de documentação/exemplo (RFC 5737, TEST-NET, DNS públicos comuns) — não são achados.
const EXAMPLE_IPS = new Set(['0.0.0.0', '127.0.0.1', '255.255.255.255', '1.2.3.4', '1.1.1.1', '8.8.8.8', '8.8.4.4'])
function isExampleIp(ip) {
  if (EXAMPLE_IPS.has(ip)) return true
  return /^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(ip)   // RFC 5737 doc ranges
}
// Serviços por porta (para rotular "22 (SSH)").
const PORT_SVC = { 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 143: 'IMAP', 389: 'LDAP', 443: 'HTTPS', 445: 'SMB', 993: 'IMAPS', 995: 'POP3S', 1433: 'MSSQL', 3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL', 6379: 'Redis', 8080: 'HTTP-alt', 8443: 'HTTPS-alt', 9090: 'HTTP-alt', 27017: 'MongoDB' }
function extractPorts(text) {
  const nums = new Set()
  for (const m of text.matchAll(/\b(\d{1,5})\/tcp\b/gi)) nums.add(+m[1])
  for (const m of text.matchAll(/\bportas?\s+(?:tcp\s+)?(\d{2,5})\b/gi)) nums.add(+m[1])
  for (const m of text.matchAll(/\bport\s+(\d{2,5})\b/gi)) nums.add(+m[1])
  return [...nums].filter((n) => n > 0 && n <= 65535).sort((a, b) => a - b).slice(0, 24)
    .map((n) => (PORT_SVC[n] ? `${n} (${PORT_SVC[n]})` : String(n)))
}

function extractArtifacts(findings) {
  const text = findings.map((f) => [f.title, f.description, f.evidence, f.payload, f.location, f.parameter].filter(Boolean).join('\n')).join('\n')
  const uniq = (arr, cap = 30) => [...new Set(arr)].slice(0, cap)
  const emails = uniq((text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])
    .filter((e) => !/@openssh\.com$|@example\.|@sentry\.|\.png$|\.jpg$/i.test(e) && !/email.?protect/i.test(e)))
  const guids = uniq(text.match(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g) || [])
  const ips = uniq((text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [])
    .filter((ip) => ip.split('.').every((o) => +o <= 255) && !isExampleIp(ip)))
  const ports = extractPorts(text)
  const jwts = uniq(text.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g) || [], 8)
  const secrets = uniq(text.match(/AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|client_secret=[^\s&"']+/gi) || [], 12)
  const endpoints = uniq(findings.map((f) => f.location).filter(Boolean)
    .filter((l) => /\/(admin|metrics|actuator|swagger|api-docs|graphql|\.env|\.git|phpinfo|filebrowser|backup|debug|\.map)\b/i.test(l)), 20)
  return { emails, guids, ips, ports, jwts, secrets, endpoints }
}

function secretsSection(a) {
  const groups = [
    ['Identificadores (GUID · Tenant/Client ID)', a.guids],
    ['E-mails descobertos', a.emails],
    ['Portas / serviços', a.ports],
    ['Endpoints sensíveis expostos', a.endpoints],
    ['IPs', a.ips],
    ['Tokens / segredos', [...a.jwts, ...a.secrets]],
  ].filter(([, v]) => v.length)
  if (!groups.length) return ''
  const block = groups.map(([label, vals]) =>
    `<div class="field"><span class="k">${label}</span><div>${vals.map((v) => `<span class="secret">${escapeHtml(v)}</span>`).join('')}</div></div>`).join('')
  return `<section><h2 class="sec">Segredos &amp; informações descobertas</h2>
    <div class="finding" style="border-left:3px solid var(--accent);padding:18px 20px"><div style="display:flex;flex-direction:column;gap:14px">${block}</div></div></section>`
}

// ── Resumo executivo por IA (opt-in) ────────────────────────────────────────────────
function narrativeSection(n) {
  if (!n || !n.summary) return ''
  const risk = SEV[(n.riskLevel || '').toLowerCase()]
  const riskChip = risk ? `<span class="risk-chip" style="background:${risk.color}">Risco ${risk.label.toLowerCase()}</span>` : ''
  const chains = (n.attackChains || []).length
    ? `<h4>Cadeias de ataque</h4><ul>${n.attackChains.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : ''
  const recs = (n.recommendations || []).length
    ? `<h4>Prioridades de remediação</h4><ul>${n.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : ''
  return `<section><h2 class="sec">Análise executiva</h2>
    <div class="ai">
      <div class="ai-head"><b>Resumo por IA</b><span class="ai-seal">revisar</span>${riskChip}</div>
      <p>${para(n.summary)}</p>${chains}${recs}
    </div></section>`
}

function footer(kind) {
  return `<div class="footer">${kind} · gerado pelo Rift a partir dos findings do engagement · ${new Date().toLocaleString('pt-BR')}</div>`
}

function renderTechnical(engagement, findings, opts = {}) {
  const detail = opts.detail === 'summary' ? 'summary' : 'full'
  const counts = severityCounts(findings)
  const sorted = sortFindings(findings)
  const meta = [
    ['Data', fmtDate(engagement.date || engagement.createdAt || new Date())],
    ['Agente', engagement.frameworkId || 'v2'],
    ['Findings', String(findings.length)],
    typeof opts.costUsd === 'number' ? ['Custo', `US$ ${opts.costUsd.toFixed(2)}`] : null,
  ]
  const body = cover(engagement, 'Relatório técnico · Rift', meta)
    + summaryTiles(counts)
    + secretsSection(extractArtifacts(findings))
    + (findings.length
      ? tocSection(sorted) + `<section><h2 class="sec">Findings detalhados</h2>${sorted.map((f, i) => findingCard(f, i, detail)).join('')}</section>`
      : `<div class="empty">Nenhum finding registrado para este engagement ainda.</div>`)
    + footer('Relatório técnico')
  return shell(`Relatório técnico — ${engagement.name || ''}`, body)
}

function renderExecutive(engagement, findings, opts = {}) {
  const counts = severityCounts(findings)
  const sorted = sortFindings(findings).filter((f) => sevOf(f) !== 'info')
  const meta = [
    ['Data', fmtDate(engagement.date || engagement.createdAt || new Date())],
    ['Agente', engagement.frameworkId || 'v2'],
    ['Findings', String(findings.length)],
  ]
  const body = cover(engagement, 'Relatório executivo · Rift', meta)
    + summaryTiles(counts)
    + narrativeSection(opts.narrative)
    + (sorted.length ? tocSection(sorted)
      : `<section><h2 class="sec">Principais riscos</h2><p style="color:var(--n400)">Nenhum risco de severidade relevante registrado.</p></section>`)
    + footer('Relatório executivo')
  return shell(`Relatório executivo — ${engagement.name || ''}`, body)
}

// O Rift é servido atrás do Cloudflare, cujo "Email Address Obfuscation" (Scrape Shield)
// reescreve QUALQUER e-mail em respostas HTML como "[email protected]" — inclusive neste
// relatório, escondendo os e-mails REAIS descobertos. Quebramos o padrão inserindo um
// <span> no @: o browser renderiza o e-mail inteiro, mas o scanner do Cloudflare não o
// reconhece como e-mail (tem tag no meio) e não ofusca. (Fix permanente: desligar essa
// opção no painel Cloudflare.) A regex casa só e-mails — não toca em @media/@page do CSS.
function deCloudflareEmails(html) {
  return html.replace(/([A-Za-z0-9._%+-]+)@([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,})/g, '$1<span>@</span>$2')
}

function renderReport(engagement, findings, { type = 'technical', costUsd, narrative, detail = 'full' } = {}) {
  const html = type === 'executive'
    ? renderExecutive(engagement, findings, { costUsd, narrative })
    : renderTechnical(engagement, findings, { costUsd, detail })
  return deCloudflareEmails(html)
}

module.exports = { renderReport, renderTechnical, renderExecutive, escapeHtml }
