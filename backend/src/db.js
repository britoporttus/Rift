const mongoose = require('mongoose')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rift'

async function connect() {
  await mongoose.connect(MONGO_URI)
  console.log('[db] MongoDB conectado')
}

module.exports = { connect }
