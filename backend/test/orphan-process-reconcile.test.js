// P1-14 (auditoria 2026-07-20): `runningSessions` é só em memória — some num
// crash duro do backend (OOM/kill -9), deixando o grupo de processos do agente
// (+ nmap/ffuf/etc que ele disparou) órfão, reparentado à init, sem
// enforcement de timeout algum. Persistimos o PID em disco e, no boot,
// matamos qualquer grupo ainda vivo. Ver docs/ROADMAP-AUDITORIA-2026-07-20.md.
const { test } = require('node:test')
const assert = require('node:assert')
const os = require('os')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const {
  reconcileOrphanedProcesses, persistPid, removePid, readPidFile, isGroupAlive,
} = require('../src/agent-runner')

function tmpPidFile() {
  return path.join(os.tmpdir(), `rift-test-pids-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

test('persistPid/readPidFile/removePid: ciclo básico de leitura/escrita', () => {
  const file = tmpPidFile()
  try {
    assert.deepEqual(readPidFile(file), {})
    persistPid('s1', 'eng-1', 12345, file)
    const data = readPidFile(file)
    assert.equal(data.s1.engagementId, 'eng-1')
    assert.equal(data.s1.pid, 12345)
    removePid('s1', file)
    assert.deepEqual(readPidFile(file), {})
  } finally { fs.rmSync(file, { force: true }) }
})

test('reconcileOrphanedProcesses mata um grupo de processo real ainda vivo e limpa o arquivo', async () => {
  const file = tmpPidFile()
  // Processo real, líder do próprio grupo (detached) — simula o `claude` spawnado
  // pelo agent-runner que sobreviveu a um crash do backend.
  const child = spawn('sleep', ['20'], { detached: true, stdio: 'ignore' })
  const pid = child.pid
  child.unref()
  try {
    assert.equal(isGroupAlive(pid), true, 'processo de teste deveria estar vivo antes do reconcile')
    persistPid('sessao-orfa', 'eng-x', pid, file)

    const killed = reconcileOrphanedProcesses(file)
    assert.equal(killed, 1)

    // SIGTERM não é instantâneo — dá uma janela curta antes de confirmar.
    await sleep(300)
    assert.equal(isGroupAlive(pid), false, 'processo órfão deveria ter sido morto')
    assert.deepEqual(readPidFile(file), {}, 'arquivo de PIDs deveria ser limpo após reconcile')
  } finally {
    try { process.kill(-pid, 'SIGKILL') } catch {}
    fs.rmSync(file, { force: true })
  }
})

test('reconcileOrphanedProcesses ignora PID que já não existe (sem erro, killed=0 pra essa entrada)', () => {
  const file = tmpPidFile()
  try {
    // PID improvável de existir — se por acaso existir no CI, isGroupAlive já
    // filtra e o teste segue correto de qualquer forma.
    const fakePid = 999999
    persistPid('sessao-morta-ha-tempos', 'eng-y', fakePid, file)
    const killed = reconcileOrphanedProcesses(file)
    assert.equal(killed, isGroupAlive(fakePid) ? 1 : 0)
    assert.deepEqual(readPidFile(file), {})
  } finally { fs.rmSync(file, { force: true }) }
})

test('reconcileOrphanedProcesses com arquivo ausente não lança erro (retorna 0)', () => {
  const file = tmpPidFile() // nunca criado
  assert.equal(reconcileOrphanedProcesses(file), 0)
})
