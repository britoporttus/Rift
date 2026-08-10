import type { AreaPoint } from '@/components/ui/charts/AreaTrend'
import type { Finding } from '@/lib/api'

/**
 * Findings descobertos por dia nos últimos `days` dias, a partir do `firstSeen`
 * de cada finding. Série real (sem dado fake): dias sem descoberta ficam em
 * zero — o que também é informação. Chaves de dia em horário local para a
 * contagem não deslocar por fuso.
 */
export function findingsPerDay(findings: Finding[], days = 14): AreaPoint[] {
  const localKey = (dt: Date) => dt.toLocaleDateString('en-CA') // YYYY-MM-DD local
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const buckets: AreaPoint[] = []
  const idx = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    idx.set(localKey(d), buckets.length)
    buckets.push({ label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), value: 0 })
  }
  for (const f of findings) {
    if (!f.firstSeen) continue
    const i = idx.get(localKey(new Date(f.firstSeen)))
    if (i != null) buckets[i].value++
  }
  return buckets
}
