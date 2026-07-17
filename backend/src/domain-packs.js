'use strict'
const fs = require('fs')
const path = require('path')
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
    requiresRunner: false,
    toolManifest: ['subfinder', 'httpx', 'naabu', 'nuclei', 'ffuf', 'katana', 'gobuster'],
    // Vazio de propósito: o comportamento nativo do framework JÁ é o pentest web.
    // Nada é injetado → ETAPA 0 é no-op em runtime (risco zero).
    systemPrompt: '',
  },
  {
    id: 'azure',
    label: 'Azure / Entra ID (autenticado)',
    note: 'Cloud, autenticado via API (Graph/ARM) — roda da VPS sem runner. Requer credencial (SP) no início do run e tooling (az/ScoutSuite/Prowler).',
    status: 'ready',
    position: 'external',
    checkpointPolicy: 'per-action',
    credentialHandling: 'vault',
    requiresRunner: false,
    toolManifest: ['az', 'scout', 'prowler'],
    promptFile: 'packs/azure.md',
    systemPrompt: '',
    // Campos que o operador informa por-run (efêmero) → env do processo do run.
    credentialSpec: {
      fields: [
        { name: 'tenantId',       label: 'Tenant ID',            secret: false },
        { name: 'clientId',       label: 'Client ID (App/SP)',   secret: false },
        { name: 'clientSecret',   label: 'Client Secret',        secret: true },
        { name: 'subscriptionId', label: 'Subscription ID',      secret: false, optional: true },
      ],
      env: {
        tenantId:       'AZURE_TENANT_ID',
        clientId:       'AZURE_CLIENT_ID',
        clientSecret:   'AZURE_CLIENT_SECRET',
        subscriptionId: 'AZURE_SUBSCRIPTION_ID',
      },
    },
  },
  {
    id: 'ad',
    label: 'Active Directory (on-premises)',
    note: 'AD interno — exige RUNNER dentro da rede (posição de rede, não alcança da VPS). Tooling: BloodHound/NetExec/Certipy. Conteúdo pronto; runner é o bloqueio.',
    status: 'planned',
    position: 'network',
    checkpointPolicy: 'per-action',
    credentialHandling: 'vault',
    requiresRunner: true,
    toolManifest: ['nxc', 'bloodhound-python', 'certipy', 'impacket'],
    promptFile: 'packs/ad.md',
    systemPrompt: '',
    credentialSpec: {
      fields: [
        { name: 'domain',   label: 'Domínio AD (FQDN)',           secret: false },
        { name: 'dcIp',     label: 'IP/host do Domain Controller', secret: false },
        { name: 'username', label: 'Usuário',                     secret: false },
        { name: 'password', label: 'Senha',                       secret: true, optional: true },
        { name: 'ntHash',   label: 'NT hash (pass-the-hash)',     secret: true, optional: true },
      ],
      // Consumidas pelo RUNNER interno (não pela VPS).
      env: { domain: 'AD_DOMAIN', dcIp: 'AD_DC_IP', username: 'AD_USER', password: 'AD_PASSWORD', ntHash: 'AD_NT_HASH' },
    },
  },
  {
    id: 'sap',
    label: 'SAP (interno)',
    note: 'ERP SAP — maior raio de explosão. Exige RUNNER interno. Tooling: pysap/bizploit. Conteúdo pronto; runner é o bloqueio.',
    status: 'planned',
    position: 'network',
    checkpointPolicy: 'per-action',
    credentialHandling: 'vault',
    requiresRunner: true,
    toolManifest: ['pysap', 'bizploit'],
    promptFile: 'packs/sap.md',
    systemPrompt: '',
    credentialSpec: {
      fields: [
        { name: 'host',     label: 'Host (ASHOST)',      secret: false },
        { name: 'sysnr',    label: 'System Number',      secret: false, optional: true },
        { name: 'client',   label: 'Client (MANDT)',     secret: false },
        { name: 'username', label: 'Usuário SAP',        secret: false },
        { name: 'password', label: 'Senha',              secret: true },
      ],
      env: { host: 'SAP_HOST', sysnr: 'SAP_SYSNR', client: 'SAP_CLIENT', username: 'SAP_USER', password: 'SAP_PASSWORD' },
    },
  },
  {
    id: 'aws',
    label: 'AWS (autenticado)',
    note: 'Cloud, autenticado via API — roda da VPS sem runner. FUTURO (depois de Azure/AD/SAP). Tooling: aws CLI/ScoutSuite/Prowler/Pacu.',
    status: 'planned',
    position: 'external',
    checkpointPolicy: 'per-action',
    credentialHandling: 'vault',
    requiresRunner: false,
    toolManifest: ['aws', 'scout', 'prowler', 'pacu'],
    promptFile: 'packs/aws.md',
    systemPrompt: '',
    credentialSpec: {
      fields: [
        { name: 'accessKeyId',     label: 'Access Key ID',     secret: false },
        { name: 'secretAccessKey', label: 'Secret Access Key', secret: true },
        { name: 'sessionToken',    label: 'Session Token',     secret: true, optional: true },
        { name: 'region',          label: 'Região padrão',     secret: false, optional: true },
      ],
      env: {
        accessKeyId:     'AWS_ACCESS_KEY_ID',
        secretAccessKey: 'AWS_SECRET_ACCESS_KEY',
        sessionToken:    'AWS_SESSION_TOKEN',
        region:          'AWS_DEFAULT_REGION',
      },
    },
  },
  {
    id: 'gcp',
    label: 'Google Cloud (autenticado)',
    note: 'Cloud, autenticado via SA JSON — roda da VPS sem runner. FUTURO. Credencial baseada em arquivo (materialização em memória a resolver no wire).',
    status: 'planned',
    position: 'external',
    checkpointPolicy: 'per-action',
    credentialHandling: 'vault',
    requiresRunner: false,
    toolManifest: ['gcloud', 'scout', 'prowler'],
    promptFile: 'packs/gcp.md',
    systemPrompt: '',
    credentialSpec: {
      fields: [
        { name: 'serviceAccountJson', label: 'Service Account JSON', secret: true },
        { name: 'project',            label: 'Project ID',           secret: false, optional: true },
      ],
      // GCP quer um FILE (GOOGLE_APPLICATION_CREDENTIALS). Sem persistência, o wire
      // materializa o JSON num path em tmpfs só durante o run. Env resolvido no wire.
      env: { project: 'GOOGLE_CLOUD_PROJECT' },
    },
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

// Normaliza a entrada (id string | objeto pack | inválido) para um pack resolvido.
// Um objeto já-resolvido (tem os campos) é usado direto; string/parcial/ausente
// cai no getDomainPack (com fallback p/ o default 'web').
function resolvePack(pack) {
  if (typeof pack === 'string') return getDomainPack(pack)
  if (pack && (typeof pack.systemPrompt === 'string' || pack.checkpointPolicy)) return pack
  return getDomainPack(pack?.id)
}

// Texto do domínio a injetar no system-context do agente (vazio p/ 'web' → no-op).
// Prioriza systemPrompt inline; se vazio e houver promptFile, lê do disco (metodologia
// versionada em src/packs/*.md). Falha de leitura → '' (nunca quebra o run).
function loadDomainPrompt(pack) {
  const p = resolvePack(pack)
  if (p.systemPrompt) return p.systemPrompt
  if (p.promptFile) {
    try { return fs.readFileSync(path.join(__dirname, p.promptFile), 'utf8') } catch { return '' }
  }
  return ''
}

// ── Checkpoint por-ação (RBAC destrutivo) ──────────────────────────────────────
// Prioridade #1 de segurança destrutiva do Conselho: em domínios autenticados que
// alteram estado (cloud/AD/SAP), o gate NÃO é por fase — é por AÇÃO. Este bloco é
// injetado no contexto quando o pack tem checkpointPolicy 'per-action'. Para 'web'
// (per-phase, black-box read-only) retorna '' → nada muda no comportamento atual.
const PER_ACTION_CHECKPOINT = `
[CHECKPOINT POR AÇÃO — POLÍTICA DESTRUTIVA DESTE DOMÍNIO]
Este domínio opera com credenciais e pode ALTERAR O ESTADO do alvo. REGRA DURA:
- Antes de CADA ação que crie, modifique ou remova recursos, altere permissões/RBAC,
  reinicie serviços ou escreva em qualquer sistema do alvo: PARE e peça aprovação
  EXPLÍCITA do operador — descreva a ação, o recurso EXATO e o raio de impacto (blast
  radius). NÃO encadeie ações destrutivas sem aprovação individual.
- Ações somente-leitura (enumeração, listagem, coleta de configuração/RBAC) seguem
  normalmente, sem aprovação por ação.
- Em dúvida sobre o impacto, trate como destrutiva e peça aprovação.`

// Bloco de checkpoint a injetar para este pack ('' quando per-phase → no-op p/ web).
function loadCheckpointDirective(pack) {
  return resolvePack(pack).checkpointPolicy === 'per-action' ? PER_ACTION_CHECKPOINT : ''
}

// Shape JSON-safe para a API/seletor.
// ── Credenciais / tooling / runner (para o gate do run) ────────────────────────
// Pack precisa de credencial do operador? (autenticado, credentialHandling 'vault')
function needsCredentials(pack) {
  return resolvePack(pack).credentialHandling === 'vault'
}

// Pack exige runner interno (posição de rede — não alcança da VPS)? (AD/SAP)
function requiresRunner(pack) {
  const p = resolvePack(pack)
  return !!p.requiresRunner || p.position === 'network'
}

// Campos de credencial que o operador deve informar (metadados p/ UI/validação —
// NUNCA contém valores). [] se o pack não usa credencial.
function credentialFields(pack) {
  const p = resolvePack(pack)
  return (p.credentialSpec && p.credentialSpec.fields) || []
}

// Ferramentas esperadas no host/runner p/ este pack.
function requiredTools(pack) {
  return resolvePack(pack).toolManifest || []
}

// Mapeia as credenciais efêmeras (do cred-vault) para variáveis de ambiente do
// processo do run, conforme o credentialSpec.env do pack. Só inclui campos presentes.
// É ISTO que server.js passa em opts.credentialEnv → buildAgentEnv do agent-runner.
function buildCredentialEnv(pack, creds) {
  const p = resolvePack(pack)
  const map = (p.credentialSpec && p.credentialSpec.env) || {}
  const out = {}
  if (!creds || typeof creds !== 'object') return out
  for (const [field, envVar] of Object.entries(map)) {
    const v = creds[field]
    if (v != null && v !== '') out[envVar] = String(v)
  }
  return out
}

// Valida um objeto de credenciais submetido contra o spec do pack: todos os campos
// obrigatórios presentes. Retorna { ok, missing: [nomes] }.
function validateCredentials(pack, creds) {
  const fields = credentialFields(pack)
  const missing = fields
    .filter((f) => !f.optional)
    .filter((f) => !creds || creds[f.name] == null || creds[f.name] === '')
    .map((f) => f.name)
  return { ok: missing.length === 0, missing }
}

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
    requiresRunner: !!entry.requiresRunner || entry.position === 'network',
    // Metadados dos campos de credencial (labels/secret/optional) — sem valores.
    credentialFields: (entry.credentialSpec && entry.credentialSpec.fields) || [],
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
  loadCheckpointDirective,
  listDomainPacks,
  needsCredentials,
  requiresRunner,
  credentialFields,
  requiredTools,
  buildCredentialEnv,
  validateCredentials,
}
