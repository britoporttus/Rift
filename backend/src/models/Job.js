const mongoose = require('mongoose')

// Uma ETAPA do fluxo (uma fase do pentest). O Job garante que o fluxo seja
// rastreado do início ao fim, mesmo que o run caia/reinicie.
const stepSchema = new mongoose.Schema({
  key:     { type: String, required: true },   // recon | enum | vuln | exploit | post | report
  label:   { type: String, required: true },
  status:  { type: String, enum: ['pending', 'active', 'done', 'skipped'], default: 'pending' },
  startedAt: { type: Date, default: null },
  endedAt:   { type: Date, default: null },
}, { _id: false })

// Job = UM run do agente (uma "tarefa" orquestrada). O agente executa o pentest; o
// backend mantém o Job avançando pelas etapas a partir da ATIVIDADE REAL do agente
// (mesma inferência de fase do painel), e o fecha no desfecho.
//
// Fluxo de FILA (padrão "outbox" — runs agendados/headless): a intenção de rodar é
// gravada como 'queued' ANTES de qualquer processo existir. Um worker (jobs-worker.js)
// lê a tabela a cada ~2s, "trava" o job atomicamente (queued→running via
// findOneAndUpdate) e o despacha. Se o backend cair no meio, o job fica 'running'
// órfão; no boot, os retomáveis (kind:'scheduled' + claudeSessionId salvo + tentativas
// restantes) voltam pra 'queued' com resume:true e o worker os re-despacha com
// `claude --resume` — "forçar até o fim". Runs interativos (chat) continuam com dispatch
// inline e não são retomados headless: no boot viram 'failed'/interrupted.
const jobSchema = new mongoose.Schema({
  _id:          { type: String },
  engagementId: { type: String, required: true, index: true },
  sessionId:    { type: String, default: 'default' },
  frameworkId:  { type: String, default: 'v2' },
  // Domain pack usado neste run (ETAPA 0 multi-domínio). Snapshot do domainPackId do
  // engagement no momento do run. Default 'web' → runs antigos = comportamento atual.
  domainPackId: { type: String, default: 'web' },
  // Origem/roteamento do run: 'interactive' = chat (dispatch inline no server.js);
  // 'scheduled' = agendado/headless (enfileirado, despachado pelo worker).
  kind:         { type: String, enum: ['interactive', 'scheduled'], default: 'interactive', index: true },
  // Espelha o runState do engagement, mas por-run (histórico de execuções).
  // 'queued' = na fila, aguardando o worker (só kind:'scheduled').
  status:       { type: String, enum: ['queued', 'running', 'completed', 'stopped', 'failed'], default: 'running', index: true },
  reason:       { type: String, default: null },     // stopReason (operator|budget|incomplete|safeguard|timeout|error…)
  steps:        { type: [stepSchema], default: [] },
  currentStep:  { type: String, default: null },
  findingsCount:{ type: Number, default: 0 },
  spentUsd:     { type: Number, default: 0 },
  // Fila/durabilidade:
  payload:      { type: mongoose.Schema.Types.Mixed, default: null }, // snapshot p/ o worker reconstruir o run
  attempts:     { type: Number, default: 0 },        // incrementa a cada claim (dispatch)
  maxAttempts:  { type: Number, default: 3 },         // teto de retomadas antes de desistir
  resume:       { type: Boolean, default: false },    // worker deve passar --resume (continuar de onde parou)
  claudeSessionId: { type: String, default: null },   // cópia durável do session_id do CLI (habilita o resume)
  lastError:    { type: String, default: null },
  heartbeatAt:  { type: Date, default: null },        // último sinal de vida do run (detecta órfãos)
  queuedAt:     { type: Date, default: null },         // quando entrou na fila
  startedAt:    { type: Date, default: Date.now },
  endedAt:      { type: Date, default: null },
  updatedAt:    { type: Date, default: Date.now },
}, { _id: false, timestamps: false })

jobSchema.index({ engagementId: 1, startedAt: -1 })
// Claim da fila: pega o mais antigo 'queued' de um dado kind (FIFO por queuedAt).
jobSchema.index({ status: 1, kind: 1, queuedAt: 1 })

module.exports = mongoose.model('Job', jobSchema)
