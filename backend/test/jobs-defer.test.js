// P1-20: deferJob devolve um job 'running' pra fila sem contar tentativa/falha.
const { test } = require('node:test')
const assert = require('node:assert')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'chave-de-teste-com-mais-de-32-caracteres-aleatorios'
const jobs = require('../src/jobs')
const Job = require('../src/models/Job')
// Frente 0: os módulos recebem o `db` do tenant. Aqui o db falso aponta para o
// MESMO objeto de model que o teste monkeypatcha, então o stub segue valendo.
const db = { Job }

test('deferJob seta status de volta pra queued e limpa startedAt/heartbeatAt', async () => {
  const original = Job.findByIdAndUpdate
  let call = null
  Job.findByIdAndUpdate = async (id, update) => { call = { id, update } }
  try {
    await jobs.deferJob(db, 'job-42')
    assert.equal(call.id, 'job-42')
    assert.equal(call.update.$set.status, 'queued')
    assert.equal(call.update.$set.startedAt, null)
    assert.equal(call.update.$set.heartbeatAt, null)
    assert.ok(!('attempts' in (call.update.$inc || {})), 'não deveria incrementar attempts (já incrementado no claim)')
  } finally { Job.findByIdAndUpdate = original }
})
