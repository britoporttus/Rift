const mongoose = require('mongoose')
const { v4: uuid } = require('uuid')

const chatSessionSchema = new mongoose.Schema(
  {
    _id:          { type: String, default: () => uuid() },
    engagementId: { type: String, required: true, index: true },
    name:         { type: String, default: 'Chat' },
    lastMessageAt:{ type: Date, default: Date.now },
    // Continuidade da conversa do claude CLI: persiste o session_id para
    // retomar (--resume) mesmo após reinício do backend.
    claudeSessionId: { type: String, default: null },
    // Tamanho aproximado do contexto no último turno (tokens de entrada) —
    // alimenta o medidor de "memória" e o aviso de compactação no front.
    contextTokens:   { type: Number, default: 0 },
  },
  { timestamps: true }
)

chatSessionSchema.index({ engagementId: 1, createdAt: 1 })

module.exports = mongoose.model('ChatSession', chatSessionSchema)
