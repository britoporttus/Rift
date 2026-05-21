'use client'
import { useState, useEffect } from 'react'
import { api, Engagement, ReportFile } from '@/lib/api'
import { FileText, Download, ChevronDown, ChevronRight } from 'lucide-react'

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function ReportsPage() {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [reports, setReports] = useState<Record<string, ReportFile[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.engagements.list()
      .then(async (engs) => {
        setEngagements(engs)
        const pairs = await Promise.all(
          engs.map((e) => api.reports.list(e.id).then((files) => [e.id, files] as const))
        )
        setReports(Object.fromEntries(pairs))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const withReports = engagements.filter((e) => (reports[e.id]?.length ?? 0) > 0)

  return (
    <div style={{ padding: '2rem', maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: '1.5rem' }}>Relatórios</h1>

      {loading ? (
        <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '3rem', fontSize: 13 }}>Carregando...</div>
      ) : withReports.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '3rem', textAlign: 'center', color: 'var(--muted)',
        }}>
          <FileText size={32} style={{ margin: '0 auto 1rem', display: 'block', opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>Nenhum relatório gerado ainda.</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Use <code style={{ color: 'var(--purple-light)' }}>/pentest-report</code> no chat para gerar.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {withReports.map((e) => {
            const files = reports[e.id] ?? []
            const open = expanded === e.id
            return (
              <div key={e.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div
                  onClick={() => setExpanded(open ? null : e.id)}
                  style={{
                    padding: '0.9rem 1.25rem', display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                >
                  {open ? <ChevronDown size={15} color="var(--muted)" /> : <ChevronRight size={15} color="var(--muted)" />}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>{e.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{e.target}</div>
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{files.length} arquivo{files.length !== 1 ? 's' : ''}</span>
                </div>

                {open && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {files.map((f) => (
                      <div key={f.name} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '0.5rem 0.75rem', borderRadius: 6, background: 'var(--bg)',
                        border: '1px solid var(--border)',
                      }}>
                        <FileText size={14} color="var(--purple-light)" style={{ flexShrink: 0 }} />
                        <span style={{ color: 'var(--text)', fontSize: 13, flex: 1 }}>{f.name}</span>
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtSize(f.size)}</span>
                        <a
                          href={f.url} download
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            color: 'var(--purple-light)', fontSize: 12, textDecoration: 'none',
                            padding: '0.25rem 0.6rem', borderRadius: 4,
                            border: '1px solid var(--purple)', background: 'var(--purple-glow)',
                          }}
                        >
                          <Download size={12} /> baixar
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
