'use strict'
/**
 * Layout de disco por tenant (Frente 0 — "o isolamento não pode parar no Mongo").
 *
 * O agente escreve escopo, estado, findings e relatórios em disco, dentro do
 * diretório do framework. O layout antigo era global:
 *
 *     context/<engagementId>/
 *     clients/<slug>/<date>/{findings,reports}/
 *
 * Dois problemas, ambos reais assim que existe mais de um tenant:
 *
 *  1. **Colisão.** `slug` deriva do NOME do engagement
 *     (`name.toLowerCase().replace(...)`). Dois clientes que criem "Pentest
 *     Site" produzem o MESMO diretório — os findings de um sobrescrevem os do
 *     outro, e o relatório de um sai com o conteúdo do outro. Não é um vetor de
 *     ataque exótico: é o caminho feliz de dois clientes com nomes parecidos.
 *
 *  2. **Leitura cruzada.** O agente roda Bash com o framework como cwd. Sem
 *     partição, `ls clients/` lista os alvos de todos os clientes — nomes de
 *     empresa, datas de teste e achados. Uma injeção de prompt vinda do alvo
 *     escaneado tem isso ao alcance de um `cat`.
 *
 * Layout novo: `<tenantSlug>` como primeiro nível.
 *
 *     context/<tenantSlug>/<engagementId>/
 *     clients/<tenantSlug>/<slug>/<date>/{findings,reports}/
 *
 * **Compatibilidade com o que já está em disco.** Os engagements que já existem
 * têm arquivos no layout antigo. Em vez de migrar (arriscado e desnecessário),
 * a leitura procura primeiro o caminho do tenant e cai no legado se ele não
 * existir; a escrita usa sempre o caminho novo. Assim nada que já roda quebra, e
 * nada novo nasce compartilhado.
 */
const path = require('path')
const fs = require('fs')

/** Slug seguro para nome de diretório — nunca deixa `..` ou `/` entrarem. */
function safeSegment(v, fallback = '_') {
  const s = String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '')
  return s || fallback
}

function contextDir(frameworkPath, tenantSlug, engagementId) {
  return path.join(frameworkPath, 'context', safeSegment(tenantSlug), safeSegment(engagementId))
}

function clientDir(frameworkPath, tenantSlug, slug, date) {
  return path.join(frameworkPath, 'clients', safeSegment(tenantSlug), safeSegment(slug), safeSegment(date))
}

// ── caminhos legados (pré-Frente 0) ──────────────────────────────────────────
function legacyContextDir(frameworkPath, engagementId) {
  return path.join(frameworkPath, 'context', safeSegment(engagementId))
}
function legacyClientDir(frameworkPath, slug, date) {
  return path.join(frameworkPath, 'clients', safeSegment(slug), safeSegment(date))
}

/**
 * Caminho para LER: prefere o do tenant; cai no legado só se o novo não existir
 * E o legado existir. Sem tenant conhecido, devolve o legado (não inventa
 * diretório) — quem chama sem tenant é código antigo, e é melhor ele continuar
 * lendo o que sempre leu do que apontar para o lugar errado.
 */
function readContextDir(frameworkPath, tenantSlug, engagementId) {
  if (!tenantSlug) return legacyContextDir(frameworkPath, engagementId)
  const scoped = contextDir(frameworkPath, tenantSlug, engagementId)
  if (fs.existsSync(scoped)) return scoped
  const legacy = legacyContextDir(frameworkPath, engagementId)
  return fs.existsSync(legacy) ? legacy : scoped
}

function readClientDir(frameworkPath, tenantSlug, slug, date) {
  if (!tenantSlug) return legacyClientDir(frameworkPath, slug, date)
  const scoped = clientDir(frameworkPath, tenantSlug, slug, date)
  if (fs.existsSync(scoped)) return scoped
  const legacy = legacyClientDir(frameworkPath, slug, date)
  return fs.existsSync(legacy) ? legacy : scoped
}

/** Chave do cofre de credenciais — o tenant entra na chave (§2.3 do spec). */
function vaultKey(tenantSlug, engagementId, sessionId = 'default') {
  return `${safeSegment(tenantSlug, 'no-tenant')}:${safeSegment(engagementId)}:${safeSegment(sessionId)}`
}

module.exports = {
  safeSegment,
  contextDir, clientDir,
  legacyContextDir, legacyClientDir,
  readContextDir, readClientDir,
  vaultKey,
}
