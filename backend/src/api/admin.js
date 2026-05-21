const { Router } = require('express')
const os = require('os')
const { execSync } = require('child_process')
const { requireAuth } = require('../auth')
const { readUsage } = require('../store')

const router = Router()
router.use(requireAuth(['admin']))

router.get('/metrics', (_req, res) => {
  const cpus = os.cpus()
  const totalMem = os.totalmem()
  const freeMem = os.freemem()

  let diskTotal = 0, diskUsed = 0
  try {
    const df = execSync('df -BM / | tail -1', { encoding: 'utf-8' }).trim().split(/\s+/)
    diskTotal = parseInt(df[1])
    diskUsed = parseInt(df[2])
  } catch {}

  res.json({
    cpu: {
      model: cpus[0]?.model ?? 'unknown',
      cores: cpus.length,
      loadAvg: os.loadavg(),
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: totalMem - freeMem,
      usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
    disk: { total: diskTotal, used: diskUsed },
    uptime: os.uptime(),
  })
})

router.get('/usage', (_req, res) => {
  const all = readUsage()
  // Aggregate by day
  const byDay = {}
  for (const entry of all) {
    const day = (entry.ts || entry.date || '').slice(0, 10)
    if (!day) continue
    if (!byDay[day]) byDay[day] = { date: day, usd: 0, tokens: 0 }
    byDay[day].usd += entry.usd || 0
    byDay[day].tokens += entry.tokens || 0
  }
  res.json(Object.values(byDay).sort((a, b) => b.date.localeCompare(a.date)))
})

module.exports = router
