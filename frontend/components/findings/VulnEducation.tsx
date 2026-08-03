import type { Finding } from '@/lib/api'
import { SEV_COLOR } from '@/lib/severity'
import { lessonFor, REMEDIATION_SLA } from '@/lib/vulnEducation'
import { GraduationCap, HelpCircle, MapPin, Clock, Zap } from 'lucide-react'

/**
 * Painel "Entenda a vulnerabilidade": além de reportar, ensina.
 * Conteúdo por quê/onde/impacto vem da base curada (CWE/OWASP); "onde" e
 * "consequência" preferem os campos reais do finding quando existem; "quando
 * corrigir" sai da severidade (SLA sugerido). Ver [[lib/vulnEducation]].
 */
export function VulnEducation({ finding }: { finding: Finding }) {
  const lesson = lessonFor(finding)
  const sev = finding.severity || 'info'
  const sla = REMEDIATION_SLA[sev] || REMEDIATION_SLA.info
  const onde = (finding.location && String(finding.location).trim()) || lesson.where
  const impacto = (finding.impact && String(finding.impact).trim()) || lesson.impact
  const sevColor = SEV_COLOR[sev] || 'var(--high)'

  const blocks = [
    { icon: <HelpCircle size={14} />, label: 'Por que acontece', text: lesson.why, color: 'var(--info)' },
    { icon: <MapPin size={14} />, label: 'Onde ocorre', text: onde, color: 'var(--purple-light)' },
    { icon: <Clock size={14} />, label: 'Quando corrigir', text: sla, color: 'var(--medium)' },
    { icon: <Zap size={14} />, label: 'Consequência real se explorada', text: impacto, color: sevColor },
  ]

  return (
    <div style={{
      background: 'var(--bg)', border: '1px solid var(--border)', borderLeft: '3px solid var(--purple)',
      borderRadius: 8, padding: '12px 14px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, flexWrap: 'wrap' }}>
        <GraduationCap size={14} color="var(--purple-light)" />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--purple-light)' }}>
          Entenda a vulnerabilidade
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--text-mute)' }}>· {lesson.title}</span>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {blocks.map((b) => (
          <div key={b.label} style={{ display: 'flex', gap: 10 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'grid', placeItems: 'center',
              color: b.color, background: `color-mix(in srgb, ${b.color} 14%, transparent)`,
              border: `1px solid color-mix(in srgb, ${b.color} 30%, transparent)`,
            }}>{b.icon}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: b.color, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>
                {b.label}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>{b.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
