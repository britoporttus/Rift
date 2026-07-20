// Montagem do "Mapa de Superfície" — normaliza os dados que os módulos de scan já
// coletam (Domínios/ASM, Findings, Vazamentos) em um grafo { nodes, edges, stats }.
//
// É uma CAMADA DE VISUALIZAÇÃO: nada é recoletado. A costura entre módulos é a
// STRING de domínio (Domain.domain == DomainAsset.domainId == LeakedCredential.domain
// == LeakDomain.domain) e, para Findings, engagement.target ≈ domínio (apex).
//
// O pulo do gato do grafo são os HUBS COMPARTILHADOS: um mesmo IP/tech/família de
// stealer recebe id NÃO escopado por domínio (`ip:...`, `tech:...`, `family:...`),
// então aparece UMA vez e várias arestas apontam pra ele — quando dois domínios
// resolvem no mesmo IP ou rodam a mesma stack vulnerável, o cluster emerge sozinho.
//
// Puro/sem DB (recebe POJOs) → testável isoladamente. A cor real é aplicada no front
// (lib/severity); aqui só carregamos os metadados. NENHUM segredo entra no payload —
// `leaked_account` usa o `account` já mascarado do model.

// Cap de segurança: o grafo global pode ficar denso. Limitamos o total de nós e
// LOGAMOS o que truncou (nunca truncar em silêncio — critério de aceite).
const DEFAULT_NODE_CAP = 2000

// Normaliza um host: tira esquema/caminho/porta/www, minúsculas. Mesma regra do
// normalizeDomain de api/domains.js, mas sem validar formato (aceita subdomínio).
function normHost(raw) {
  if (!raw || typeof raw !== 'string') return null
  const d = raw.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0].split('?')[0].split('#')[0]
    .split(':')[0]
    .replace(/^www\./, '')
    .replace(/\.$/, '')
  return d || null
}

// `host` é o mesmo domínio ou um subdomínio de `domain`? Usado para casar
// engagement.target ↔ Domain.domain sem depender de "registrable domain"
// (evita o problema de .com.br): casamos contra a lista conhecida de domínios.
function hostMatchesDomain(host, domain) {
  if (!host || !domain) return false
  return host === domain || host.endsWith('.' + domain)
}

// Acumulador do grafo. Deduplica nós por id e arestas por (source|target|type).
function createBuilder({ nodeCap = DEFAULT_NODE_CAP } = {}) {
  const nodes = new Map()
  const edgeKeys = new Set()
  const edges = []
  let truncated = 0

  // Nó "único" (domain, subdomain, exposure, vuln, leaked_account) — id já é único.
  function node(id, type, label, meta) {
    if (nodes.has(id)) return nodes.get(id)
    if (nodes.size >= nodeCap) { truncated++; return null }
    const n = { id, type, label: label == null ? id : String(label), meta: meta || {} }
    nodes.set(id, n)
    return n
  }

  // Nó "hub" compartilhável (ip, tech, webserver, stealer_family, breach) — id NÃO
  // escopado por domínio. Cada uso incrementa meta.count (grau lógico de compartilhamento).
  function hub(id, type, label, meta) {
    let n = nodes.get(id)
    if (!n) {
      if (nodes.size >= nodeCap) { truncated++; return null }
      n = { id, type, label: label == null ? id : String(label), meta: { count: 0, ...(meta || {}) } }
      nodes.set(id, n)
    }
    n.meta.count = (n.meta.count || 0) + 1
    return n
  }

  // Aresta — só criada se AMBAS as pontas existem (um nó pode ter sido cortado no cap).
  function edge(source, target, type) {
    if (!source || !target) return
    if (!nodes.has(source) || !nodes.has(target)) return
    const k = `${source}|${target}|${type}`
    if (edgeKeys.has(k)) return
    edgeKeys.add(k)
    edges.push({ source, target, type })
  }

  function result({ log = true } = {}) {
    if (truncated > 0 && log) {
      console.warn(`[graph] cap de ${nodeCap} nós atingido — ${truncated} nó(s) truncado(s) (não silencioso)`)
    }
    const list = [...nodes.values()]
    const by = (t) => list.filter((n) => n.type === t).length
    const stats = {
      domains: by('domain'),
      subdomains: by('subdomain'),
      ips: by('ip'),
      techs: by('tech'),
      exposures: by('exposure'),
      vulns: by('vuln'),
      leaks: by('leaked_account') + by('breach'),
      families: by('stealer_family'),
      nodes: list.length,
      edges: edges.length,
      truncated,
    }
    return { nodes: list, edges, stats }
  }

  return { node, hub, edge, result, get truncated() { return truncated } }
}

// Adiciona ao builder o "pacote" de um domínio: seu nó + subdomínios→IP/tech/webserver,
// exposições, vulns (Findings casados) e leaks (credenciais/famílias/breaches).
// `subIndex` (opcional) é preenchido com value→subId dos subdomínios deste pacote,
// usado para ligar vulns/exposições ao host específico quando a location casa.
function addDomainBundle(b, { domain, assets = [], findings = [], leaks = [], aggFamilies = {} }) {
  if (!domain || !domain.domain) return
  const domId = `dom:${domain.domain}`
  b.node(domId, 'domain', domain.domain, {
    domainId: domain._id,
    name: domain.name || null,
    riskScore: domain.riskScore ?? 0,
    riskLevel: domain.riskLevel || 'info',
    authorized: !!domain.authorized,
    kind: domain.kind || null,
  })

  // value(host) → subId, para casar vuln/exposure ao subdomínio certo.
  const subByHost = new Map()

  for (const a of assets) {
    if (a.type === 'exposure') {
      const expId = `exp:${a._id}`
      b.node(expId, 'exposure', a.label || a.value, {
        severity: a.severity || 'info',
        value: a.value,
        source: a.source || null,
        statusCode: a.statusCode ?? null,
      })
      // Liga ao host da exposição se ele for um subdomínio conhecido; senão ao domínio.
      const host = normHost(a.value)
      const anchor = (host && subByHost.get(host)) || domId
      b.edge(anchor, expId, 'exposes')
      continue
    }

    // subdomain | web | url  → nó de superfície
    const host = normHost(a.value) || a.value
    const subId = `sub:${a.value}`
    b.node(subId, 'subdomain', a.value, {
      alive: !!a.alive,
      statusCode: a.statusCode ?? null,
      title: a.title || null,
      assetType: a.type,
      scheme: a.scheme || null,
      domainId: domain._id,
    })
    if (host) subByHost.set(host, subId)
    b.edge(domId, subId, 'has_subdomain')

    for (const ip of a.ips || []) {
      if (!ip) continue
      const ipId = `ip:${ip}`
      b.hub(ipId, 'ip', ip)
      b.edge(subId, ipId, 'resolves_to')
    }
    for (const t of a.tech || []) {
      const key = String(t || '').toLowerCase().trim()
      if (!key) continue
      const techId = `tech:${key}`
      b.hub(techId, 'tech', t)
      b.edge(subId, techId, 'runs')
    }
    if (a.webServer) {
      const wsKey = String(a.webServer).toLowerCase().trim()
      if (wsKey) {
        const wsId = `ws:${wsKey}`
        b.hub(wsId, 'webserver', a.webServer)
        b.edge(subId, wsId, 'served_by')
      }
    }
  }

  // Vulns (Findings casados por engagement.target). Liga ao subdomínio da `location`
  // quando ela casa um host conhecido; senão ao domínio (apex).
  for (const f of findings) {
    const vId = `vuln:${f._id}`
    b.node(vId, 'vuln', f.title, {
      severity: f.severity || 'info',
      cvss: f.cvss ?? null,
      state: f.state || null,
      type: f.type || null,
      location: f.location || null,
      engagementId: f.engagementId,
    })
    const host = normHost(f.location)
    const anchor = (host && subByHost.get(host)) || domId
    b.edge(anchor, vId, 'vulnerable_to')
  }

  // Leaks record-level (módulo Vazamentos).
  for (const c of leaks) {
    if (c.category === 'malware') {
      const acctId = `acct:${c._id}`
      b.node(acctId, 'leaked_account', c.account || 'conta mascarada', {
        severity: c.severity || 'medium',
        sourceUrl: c.sourceUrl || null,
        seenDate: c.seenDate || null,
        hasPassword: !!c.hasPassword,
      })
      b.edge(domId, acctId, 'leaked')
      if (c.stealerFamily) {
        const famId = `family:${String(c.stealerFamily).toLowerCase()}`
        b.hub(famId, 'stealer_family', c.stealerFamily)
        b.edge(acctId, famId, 'via')
      }
    } else {
      // breach / combolist → hub por nome (aparições da mesma base agrupam)
      const bname = c.breachName || c.breachTitle || 'Vazamento'
      const bId = `breach:${String(bname).toLowerCase()}`
      b.hub(bId, 'breach', bname, { breachDate: c.breachDate || null })
      b.edge(domId, bId, 'appears_in')
    }
  }

  // Famílias de stealer do AGREGADO (Hudson Rock dá famílias sem records individuais).
  // Liga domínio → família direto — o mesmo hub `family:` costura com os records acima.
  for (const [name, count] of Object.entries(aggFamilies || {})) {
    if (!name) continue
    const famId = `family:${String(name).toLowerCase()}`
    const n = b.hub(famId, 'stealer_family', name)
    if (n && Number(count) > (n.meta.aggCount || 0)) n.meta.aggCount = Number(count)
    b.edge(domId, famId, 'via')
  }
}

module.exports = {
  DEFAULT_NODE_CAP,
  normHost,
  hostMatchesDomain,
  createBuilder,
  addDomainBundle,
}
