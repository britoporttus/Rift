// Frente 0 — isolamento no DISCO. O spec é explícito: "o isolamento não pode
// parar no Mongo". O agente escreve escopo/estado/findings/relatórios em disco e
// roda Bash com o framework como cwd.
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  safeSegment, contextDir, clientDir, readContextDir, readClientDir, vaultKey,
} = require('../src/tenant-paths')

const FW = '/opt/framework'

// ── o bug que motivou a partição ────────────────────────────────────────────

test('dois tenants com o MESMO nome de engagement não colidem em disco', () => {
  // `slug` deriva do NOME do engagement, então "Pentest Site" em dois clientes
  // gerava exatamente o mesmo diretório — os findings de um sobrescreviam os do
  // outro. Não é ataque: é o caminho feliz de dois clientes parecidos.
  const a = clientDir(FW, 'porttus',  'pentest-site', '2026-08-01')
  const b = clientDir(FW, 'trustsis', 'pentest-site', '2026-08-01')
  assert.notEqual(a, b, 'mesmo slug em tenants diferentes TEM que dar diretórios diferentes')
  assert.ok(a.includes(`${path.sep}porttus${path.sep}`))
  assert.ok(b.includes(`${path.sep}trustsis${path.sep}`))
})

test('o tenant é o PRIMEIRO nível — `ls` de um tenant não lista os outros', () => {
  const d = clientDir(FW, 'trustsis', 'alvo', '2026-08-01')
  assert.equal(d, path.join(FW, 'clients', 'trustsis', 'alvo', '2026-08-01'))
  const c = contextDir(FW, 'trustsis', 'eng-1')
  assert.equal(c, path.join(FW, 'context', 'trustsis', 'eng-1'))
})

// ── travessia de path ───────────────────────────────────────────────────────

test('slug hostil não escapa do diretório do tenant', () => {
  const root = path.join(FW, 'clients', 'trustsis')
  for (const evil of ['../porttus', '..', '../../etc', 'a/../../b', '/etc/passwd', '....//....//x']) {
    const d = clientDir(FW, 'trustsis', evil, '2026-08-01')
    // A propriedade que importa é o caminho RESOLVIDO ficar dentro da raiz do
    // tenant. Um nome de diretório que por acaso contenha ".." como texto
    // (ex.: "a-..-..-b") é inofensivo — o que não pode existir é um separador
    // que faça o SO subir de nível.
    assert.ok(path.resolve(d).startsWith(path.resolve(root) + path.sep),
      `"${evil}" escapou: ${d}`)
    assert.equal(path.relative(root, d).startsWith('..'), false, `"${evil}" saiu da raiz`)
  }
})

test('tenantSlug hostil também é neutralizado', () => {
  const d = contextDir(FW, '../../root', 'eng-1')
  assert.equal(d.includes('..'), false)
  assert.ok(d.startsWith(path.join(FW, 'context') + path.sep))
})

test('safeSegment nunca devolve string vazia (viraria o diretório pai)', () => {
  for (const v of ['', null, undefined, '...', '///', '---']) {
    assert.ok(safeSegment(v).length > 0, `"${v}" virou vazio`)
    assert.equal(safeSegment(v).includes('/'), false)
  }
})

// ── compatibilidade com o que já está em disco ──────────────────────────────

test('leitura cai no layout legado quando o do tenant ainda não existe', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-paths-'))
  try {
    // Simula um engagement pré-Frente 0: só o caminho antigo existe.
    const legacy = path.join(tmp, 'clients', 'alvo-antigo', '2026-07-01')
    fs.mkdirSync(legacy, { recursive: true })
    assert.equal(readClientDir(tmp, 'porttus', 'alvo-antigo', '2026-07-01'), legacy,
      'engagement antigo tem que continuar achando os arquivos dele')

    // Quando o do tenant existe, ele vence.
    const scoped = path.join(tmp, 'clients', 'porttus', 'alvo-antigo', '2026-07-01')
    fs.mkdirSync(scoped, { recursive: true })
    assert.equal(readClientDir(tmp, 'porttus', 'alvo-antigo', '2026-07-01'), scoped)
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})

test('sem nenhum dos dois, a leitura aponta para o caminho DO TENANT (não o global)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-paths-'))
  try {
    const d = readContextDir(tmp, 'trustsis', 'eng-novo')
    assert.equal(d, path.join(tmp, 'context', 'trustsis', 'eng-novo'))
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})

// ── cofre de credenciais ────────────────────────────────────────────────────

test('a chave do cofre inclui o tenant — credencial de um nunca casa com a de outro', () => {
  const a = vaultKey('porttus',  'eng-1', 'default')
  const b = vaultKey('trustsis', 'eng-1', 'default')
  assert.notEqual(a, b, 'mesmo engagementId em tenants diferentes não pode dar a mesma chave')
})

test('chave do cofre é estável e sem separador de path', () => {
  assert.equal(vaultKey('porttus', 'eng-1'), vaultKey('porttus', 'eng-1', 'default'))
  assert.equal(vaultKey('../x', 'eng/1', 'sess').includes('/'), false)
})
