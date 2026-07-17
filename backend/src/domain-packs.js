'use strict'
// ── Domain Packs (ETAPA 0 do roadmap multi-domínio) ────────────────────────────
// docs/ROADMAP-MULTI-DOMINIO.md — veredito do Conselho: "núcleo único + domain
// packs", NÃO 4 orquestradores. O orquestrador (recon→enum→exploit→report) é o
// MESMO em Web/Cloud/AD/SAP; o domínio é CONTEÚDO, não arquitetura.
//
// Um domain pack especializa o mesmo tronco para um domínio, declarando 4 coisas
// (a definição do Conselho) + o "eixo real" que a revisão por pares identificou:
//   systemPrompt        — addendum injetado no contexto do agente (o "conteúdo")
//   toolManifest        — ferramentas/binaries esperadas nesse domínio
//   checkpointPolicy    — 'per-phase' (web) | 'per-action' (destrutivo: cloud/AD/SAP)
//   credentialHandling  — 'none' (black-box externo) | 'vault' (autenticado)
//   position            — EIXO REAL do Conselho: 'external' (roda da VPS, alcance
//                          externo) vs 'network' (exige runner DENTRO da rede do alvo)
//
// NÃO confundir com o módulo ASM "Domínios" (api/domains.js), que analisa domínios
// de empresas. Aqui `domain` = domínio TÉCNICO de pentest (web/cloud/AD/SAP).
//
// Pack #0 = 'web': systemPrompt vazio → reproduz EXATAMENTE o comportamento atual do
// Rift (nada muda em runtime). azure/ad/sap entram como 'planned' (status != 'ready'):
// aparecem no seletor DESABILITADOS — espelham as ETAPAs 1-3 do roadmap, sem risco.

const DEFAULT_DOMAIN_PACK_ID = 'web'

const REGISTRY = [
  {
    id: 'web',
    label: 'Web / API (externo)',
    note: 'Pentest da superfície web/API a partir da VPS (black-box). Comportamento atual do Rift.',
    status: 'ready',
    position: 'external',
    checkpointPolicy: 'per-phase',
    credentialHandling: 'none',
    toolManifest: ['subfinder', 'httpx', 'naabu', 'nuclei', 'ffuf', 'katana', 'gobuster'],
    // Vazio de propósito: o comportamento nativo do framework JÁ é o pentest web.
    // Nada é injetado → ETAPA 0 é no-op em runtime (risco zero).
    systemPrompt: '',
  },
  {
    id: 'azure',
    label: 'Azure / Cloud (autenticado)',
    note: 'ETAPA 1 — autenticado via API (Graph/ARM), roda da VPS sem runner. Valida credencial + RBAC destrutivo + vault. Em construção.',
    status: 'planned',
    position: 'external',
    checkpointPolicy: 'per-action',
    credentialHandling: 'vault',
    toolManifest: ['az', 'scoutsuite', 'prowler', 'pacu'],
    systemPrompt: '',
  },
  {
    id: 'ad',
    label: 'Active Directory (interno)',
    note: 'ETAPA 2 — exige runner dentro da rede. Tooling maduro (BloodHound/NetExec/Certipy). Bloqueado por transporte de inferência. Em construção.',
    status: 'planned',
    position: 'network',
    checkpointPolicy: 'per-action',
    credentialHandling: 'vault',
    toolManifest: ['bloodhound', 'netexec', 'certipy', 'impacket'],
    systemPrompt: '',
  },
  {
    id: 'sap',
    label: 'SAP (interno)',
    note: 'ETAPA 3 — maior raio de explosão (ERP). Por último; ambientes próprios de-riscam o runner. Em construção.',
    status: 'planned',
    position: 'network',
    checkpointPolicy: 'per-action',
    credentialHandling: 'vault',
    toolManifest: ['pysap', 'bizploit'],
    systemPrompt: '',
  },
]

const BY_ID = new Map(REGISTRY.map((p) => [p.id, p]))

// Um pack é EXECUTÁVEL quando 'ready'. planned = visível no seletor, mas não roda.
function isRunnable(entry) {
  return !!entry && entry.status === 'ready'
}

// SEMPRE retorna um pack válido (fallback → default 'web') para nenhum caller quebrar
// por um domainPackId ausente/inválido persistido no banco.
function getDomainPack(id) {
  const entry = (id && BY_ID.get(id)) || BY_ID.get(DEFAULT_DOMAIN_PACK_ID)
  return { ...entry, available: isRunnable(entry) }
}

// id existe no registro (inclui planned) — usado para não persistir lixo.
function isValidDomainPackId(id) {
  return typeof id === 'string' && BY_ID.has(id)
}

// id existe E pode rodar agora — usado pela API para recusar selecionar um pack
// que ainda está em construção (planned).
function isRunnableDomainPackId(id) {
  return isValidDomainPackId(id) && isRunnable(BY_ID.get(id))
}

// Texto do domínio a injetar no system-context do agente (vazio p/ 'web' → no-op).
function loadDomainPrompt(pack) {
  const p = pack && typeof pack.systemPrompt === 'string' ? pack : getDomainPack(pack?.id)
  return p.systemPrompt || ''
}

// Shape JSON-safe para a API/seletor.
function toPublic(entry) {
  return {
    id: entry.id,
    label: entry.label,
    note: entry.note,
    status: entry.status,
    available: isRunnable(entry),
    position: entry.position,
    checkpointPolicy: entry.checkpointPolicy,
    credentialHandling: entry.credentialHandling,
  }
}

function listDomainPacks() {
  return REGISTRY.map(toPublic)
}

module.exports = {
  DEFAULT_DOMAIN_PACK_ID,
  getDomainPack,
  isValidDomainPackId,
  isRunnableDomainPackId,
  loadDomainPrompt,
  listDomainPacks,
}
