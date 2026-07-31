// DNS bruteforce NATIVO (dns.resolve4 do Node) — sem binário externo (não temos
// dnsx na VPS), mesma decisão de engenharia do port scan nativo (probeTcp).
//
// PASSIVO: só consulta o DNS público (resolver do sistema), não envia um único
// pacote à infra do alvo. Descobre subdomínios que as fontes passivas do
// subfinder não listam (nomes internos previsíveis: vpn, gitlab, jenkins…).
//
// Puro o suficiente pra testar: o `resolver` (com .resolve4) é injetável, então
// os testes rodam sem DNS real.
const fs = require('fs')
const path = require('path')
const dnsPromises = require('dns').promises

const WORDLIST_PATH = path.join(__dirname, 'wordlists', 'subdomains.txt')

// Carrega e normaliza a wordlist embarcada (ignora comentários/linhas vazias).
function loadWordlist(file = WORDLIST_PATH) {
  let raw = ''
  try { raw = fs.readFileSync(file, 'utf8') } catch { return [] }
  const out = []
  const seen = new Set()
  for (const line of raw.split('\n')) {
    const w = line.trim().toLowerCase()
    if (!w || w[0] === '#') continue
    if (seen.has(w)) continue
    seen.add(w)
    out.push(w)
  }
  return out
}

// Pool de concorrência fixo (não depende do scanner).
async function mapPool(items, size, fn) {
  let i = 0
  const n = Math.min(size, items.length) || 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx) }
  }))
}

async function resolve4Safe(resolver, host) {
  try { const ips = await resolver.resolve4(host); return Array.isArray(ips) ? ips : [] }
  catch { return [] }
}

// Wildcard guard: domínios com *.dominio fazem QUALQUER host resolver → bruteforce
// viraria uma lista de lixo. Resolve rótulos improváveis fixos; os IPs que eles
// devolverem são o "conjunto wildcard". Retorna esse Set (vazio = sem wildcard).
const WILDCARD_PROBES = ['zz--rift-wildcard-probe-9x7', 'qq-nao-existe-xyz-42', 'no-such-host-3task-k9']

async function detectWildcard(domain, { resolver = dnsPromises, probes = WILDCARD_PROBES } = {}) {
  const wildcardIps = new Set()
  await mapPool(probes, probes.length, async (label) => {
    const ips = await resolve4Safe(resolver, `${label}.${domain}`)
    for (const ip of ips) wildcardIps.add(ip)
  })
  return wildcardIps
}

// Host cujo rótulo mais à esquerda é infraestrutura de DNS: ns, ns1..ns9, dns,
// dns1.., resolver. Não é superfície de ataque — o operador pediu pra não
// apresentar nameservers como achado (a relação já está implícita no NS que
// aponta pra eles). Determinístico e testável (não depende de resolveNs, que é
// instável e nem pega vanity records tipo ns1.dominio.com fora do NS autoritativo).
const DNS_INFRA_RE = /^(ns\d*|dns\d*|resolver)\./i
function isDnsInfraHost(host) {
  return DNS_INFRA_RE.test(String(host || '').toLowerCase() + '.')
}

// bruteforceSubdomains(domain, opts) → { hosts: string[], wildcard: boolean }.
// `hosts` são FQDNs que resolveram para IP(s) reais (fora do conjunto wildcard).
async function bruteforceSubdomains(domain, {
  words = null, concurrency = 40, resolver = dnsPromises, wildcardIps = null,
} = {}) {
  const list = words || loadWordlist()
  if (!domain || !list.length) return { hosts: [], wildcard: false }

  const wild = wildcardIps || await detectWildcard(domain, { resolver })
  const hasWildcard = wild.size > 0

  const found = new Set()
  await mapPool(list, concurrency, async (word) => {
    const host = `${word}.${domain}`
    const ips = await resolve4Safe(resolver, host)
    if (!ips.length) return
    // Com wildcard ativo, só aceita se resolver para ALGUM IP fora do conjunto
    // wildcard (host distinto de verdade); senão é só o curinga respondendo.
    if (hasWildcard && ips.every((ip) => wild.has(ip))) return
    found.add(host)
  })

  return { hosts: [...found], wildcard: hasWildcard }
}

module.exports = { WORDLIST_PATH, loadWordlist, detectWildcard, bruteforceSubdomains, isDnsInfraHost }
