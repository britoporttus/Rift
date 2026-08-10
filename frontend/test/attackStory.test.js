// "Anatomia do ataque": a história é DADO, então o que precisa de rede de
// segurança é a resolução — 5 atos sempre, alvo real injetado, e nenhum token
// `{host}` sobrando na tela do cliente.
const { test } = require('node:test')
const assert = require('node:assert')
const { ACTS, STORIES, storyFor, parseTarget, fill } = require('../lib/attackStory')

const licao = (id) => ({
  id,
  title: 'Controle de acesso quebrado (IDOR)',
  why: 'porque sim',
  where: 'no endpoint',
  impact: 'impacto de classe',
  matched: true,
})

/** Percorre toda a estrutura procurando token não substituído. */
function tokensSobrando(valor, caminho = '', achados = []) {
  if (typeof valor === 'string') {
    const m = valor.match(/\{(host|path|port|url)\}/g)
    if (m) achados.push(`${caminho}: ${m.join(', ')}`)
  } else if (Array.isArray(valor)) {
    valor.forEach((v, i) => tokensSobrando(v, `${caminho}[${i}]`, achados))
  } else if (valor && typeof valor === 'object') {
    for (const k of Object.keys(valor)) tokensSobrando(valor[k], `${caminho}.${k}`, achados)
  }
  return achados
}

test('parseTarget entende URL completa, host:porta e host puro', () => {
  const url = parseTarget('https://api.exemplo.com/v1/clients/1042/documents')
  assert.equal(url.host, 'api.exemplo.com')
  assert.equal(url.path, '/v1/clients/1042/documents')
  assert.equal(url.port, '443')
  assert.equal(url.resolved, true)

  const hostPorta = parseTarget('db.exemplo.com:6379')
  assert.equal(hostPorta.host, 'db.exemplo.com')
  assert.equal(hostPorta.port, '6379')

  const soHost = parseTarget('exemplo.com')
  assert.equal(soHost.host, 'exemplo.com')
  assert.equal(soHost.path, '/')
})

test('location ausente ou em texto livre cai no alvo padrão, sem quebrar', () => {
  for (const entrada of [null, undefined, '', '   ', 'cabeçalho de resposta HTTP']) {
    const alvo = parseTarget(entrada)
    assert.equal(typeof alvo.host, 'string')
    assert.ok(alvo.host.length > 0, `host vazio para ${JSON.stringify(entrada)}`)
    assert.equal(typeof alvo.port, 'string')
  }
  // texto livre não é URL válida → não pode fingir que resolveu o alvo
  assert.equal(parseTarget('cabeçalho de resposta HTTP').resolved, false)
})

test('fill substitui só os 4 tokens conhecidos, em profundidade', () => {
  const alvo = { host: 'h.com', path: '/p', port: '8080', url: 'https://h.com/p' }
  assert.equal(fill('em {host}:{port}{path}', alvo), 'em h.com:8080/p')
  assert.deepEqual(fill(['a {host}', { b: ['{port}'] }], alvo), ['a h.com', { b: ['8080'] }])
  assert.equal(fill('{outroToken} fica', alvo), '{outroToken} fica')
})

test('a história tem sempre os 5 atos, na ordem dos ACTS', () => {
  const historia = storyFor(licao('idor'), { location: 'https://api.exemplo.com/v1/x' })
  assert.equal(historia.acts.length, 5)
  assert.deepEqual(historia.acts.map((a) => a.key), ACTS.map((a) => a.key))
  for (const ato of historia.acts) {
    assert.ok(ato.narration, `ato ${ato.key} sem narração`)
    assert.ok(ato.label && ato.n, `ato ${ato.key} sem rótulo/número`)
  }
})

test('classe sem roteiro próprio cai no genérico derivado da lição (nunca vazio)', () => {
  const l = { id: 'weak-tls', title: 'Fraqueza de TLS/SSL', why: 'cifra obsoleta', where: 'no servidor TLS', impact: 'interceptação', matched: true }
  const historia = storyFor(l, { location: 'exemplo.com' })
  assert.equal(historia.scripted, false)
  assert.equal(historia.acts.length, 5)
  const causa = historia.acts.find((a) => a.key === 'cause')
  assert.equal(causa.bad, null, 'genérico não inventa código vulnerável')
  assert.equal(causa.narration, 'cifra obsoleta', 'genérico reaproveita o texto da lição')
})

test('lição ausente/desconhecida não derruba a história', () => {
  const l = { id: 'generic', title: 'Contexto de segurança', why: 'w', where: 'o', impact: 'i', matched: false }
  assert.equal(storyFor(l, {}).acts.length, 5)
  assert.equal(storyFor(l, null).acts.length, 5)
})

test('o alvo real do finding entra no roteiro (não fala de exemplo genérico)', () => {
  const historia = storyFor(licao('idor'), { location: 'https://api.mujackdmi.com/api/v1/clients/1042/documents' })
  const texto = JSON.stringify(historia.acts)
  assert.ok(texto.includes('api.mujackdmi.com'), 'host real não foi injetado')
  assert.equal(historia.target.host, 'api.mujackdmi.com')
})

test('nenhum roteiro deixa token sem substituir (regressão de vazamento visual)', () => {
  const alvo = { location: 'https://alvo.real.com:6379/caminho' }
  for (const id of Object.keys(STORIES)) {
    const historia = storyFor({ ...licao(id), id }, alvo)
    const sobrando = tokensSobrando(historia.acts, id)
    assert.deepEqual(sobrando, [], `tokens não substituídos: ${sobrando.join(' | ')}`)
  }
})

test('todo roteiro escrito à mão preenche os 5 atos por completo', () => {
  for (const [id, roteiro] of Object.entries(STORIES)) {
    for (const { key } of ACTS) {
      assert.ok(roteiro[key], `${id} não tem o ato "${key}"`)
      assert.ok(roteiro[key].narration, `${id}.${key} sem narração`)
    }
    assert.ok(roteiro.breach.request.length && roteiro.breach.response.length, `${id}: cena da brecha incompleta`)
    assert.ok(roteiro.exploit.steps.length >= 2, `${id}: invasão precisa de ao menos 2 passos`)
    assert.ok(roteiro.impact.app.length && roteiro.impact.business.length && roteiro.impact.legal.length, `${id}: impacto incompleto`)
  }
})

test('a linha destacada da brecha existe de verdade na cena', () => {
  for (const [id, roteiro] of Object.entries(STORIES)) {
    const { side, line } = roteiro.breach.flag
    assert.ok(side === 'request' || side === 'response', `${id}: lado inválido no destaque`)
    const linhas = roteiro.breach[side]
    assert.ok(line >= 0 && line < linhas.length, `${id}: destaque aponta para a linha ${line}, fora de ${linhas.length}`)
  }
})

test('impacto escrito pelo agente para ESTE finding vem antes do texto de classe', () => {
  const historia = storyFor(licao('idor'), { location: 'exemplo.com', impact: 'Vazam 12.400 contratos deste cliente.' })
  assert.equal(historia.acts[4].app[0], 'Vazam 12.400 contratos deste cliente.')
  assert.ok(historia.acts[4].app.length > 1, 'o texto de classe deve continuar abaixo do específico')
})

test('storyFor não muta o roteiro-fonte (duas aberturas seguidas são iguais)', () => {
  const f = { location: 'exemplo.com', impact: 'impacto específico' }
  const a = storyFor(licao('idor'), f)
  const b = storyFor(licao('idor'), f)
  assert.deepEqual(a.acts, b.acts)
  assert.equal(b.acts[4].app.filter((x) => x === 'impacto específico').length, 1, 'impacto duplicado a cada abertura')
})
