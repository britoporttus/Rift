const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true },
  name:         { type: String, required: true },
  role:         { type: String, enum: ['admin', 'user'], default: 'user' },
  passwordHash: { type: String, default: null },
  provider:     { type: String, enum: ['local', 'microsoft'], default: 'local' },
  azureId:      { type: String, default: null },
  lastLogin:    { type: Date, default: null },
}, { timestamps: true })

module.exports = mongoose.model('User', userSchema)
