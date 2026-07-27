'use client'
import { useState, useEffect, useCallback } from 'react'
import { api, Engagement, ReportFile } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { SI } from '@/components/ui/SI'

const EyeIco    = (s?: number, c?: string) => <SI s={s || 12} c={c || 'var(--muted)'}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></SI>
const DlIco     = (s?: number, c?: string) => <SI s={s || 12} c={c || 'white'}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></SI>
const FileIco   = (s?: number, c?: string) => <SI s={s || 14} c={c || 'var(--muted)'}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></SI>
const XIco      = (s?: number, c?: string) => <SI s={s || 16} c={c || 'var(--muted)'} sw={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></SI>

interface PreviewState {
  name: string
  blobUrl: string
  ext: string
  downloadUrl: string
}

export default function ReportsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [reports, setReports]         = useState<Record<string, ReportFile[]>>({})
  const [loading, setLoading]         = useState(true)
  const [preview, setPreview]         = useState<PreviewState | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    api.engagements.list()
      .then(async (engs) => {
        setEngagements(engs)
        const pairs = await Promise.all(
          engs.map((e) => api.reports.list(e.id).then((files) => [e.id, files] as const).catch(() => [e.id, []] as const))
        )
        setReports(Object.fromEntries(pairs))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const openPreview = useCallback(async (file: ReportFile) => {
    setPreviewLoading(true)
    try {
      const res = await fetch(file.viewUrl, { credentials: 'include' })
      if (!res.ok) throw new Error('Falha ao carregar relatório')
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      setPreview({ name: file.name, blobUrl, ext: file.ext, downloadUrl: file.url })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao carregar relatório')
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.blobUrl)
    setPreview(null)
  }

  // P2-41 (auditoria 2026-07-20): closePreview só revogava a blob URL em
  // fechamento EXPLÍCITO — navegar pra outra rota (SPA) com o modal aberto
  // nunca chamava closePreview, retendo o Blob na memória da aba pelo resto
  // da sessão. Cleanup no unmount/troca de preview cobre esse caso.
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview.blobUrl) }
  }, [preview])

  // P2-39: Esc fecha o modal + foco vai pro container ao abrir.
  const modalRef = useEscapeClose(!!preview, closePreview)

  // Abre o relatório GERADO pelo Rift (a partir dos findings) no modal de preview.
  const openGenerated = useCallback(async (e: Engagement, type: 'technical' | 'executive') => {
    setPreviewLoading(true)
    try {
      const res = await fetch(api.reports.generatedUrl(e.id, type), { credentials: 'include' })
      if (!res.ok) throw new Error('Falha ao gerar relatório')
      const blob = await res.blob()
      setPreview({
        name: `Relatório ${type === 'executive' ? 'executivo' : 'técnico'} — ${e.name}`,
        blobUrl: URL.createObjectURL(blob),
        ext: '.html',
        downloadUrl: api.reports.pdfUrl(e.id, type),   // "baixar" no modal = PDF
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao gerar relatório')
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  // Mostra qualquer engagement que TENHA o que relatar: findings no banco (relatório
  // gerado pelo Rift) OU arquivos narrativos do agente. Antes só listava arquivos crus.
  const withReports = engagements.filter((e) => (e.findingsCount ?? 0) > 0 || (reports[e.id]?.length ?? 0) > 0)
  const totalFiles = withReports.reduce((a, e) => a + (reports[e.id]?.length ?? 0), 0)

  return (
    <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeIn 0.2s ease' }}>

      {/* Page header */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>Relatórios</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-mute)', marginTop: 2 }}>
          {totalFiles} {totalFiles === 1 ? 'arquivo' : 'arquivos'} · {withReports.length} {withReports.length === 1 ? 'engagement' : 'engagements'}
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-mute)', textAlign: 'center', padding: '3rem', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO...</div>
      ) : withReports.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '3rem', textAlign: 'center', color: 'var(--text-mute)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', opacity: 0.4 }}>{FileIco(32)}</div>
          <p style={{ fontSize: 13 }}>Nenhum relatório disponível.</p>
          <p style={{ fontSize: 11, marginTop: 4, color: 'var(--text-dim)' }}>
            Use <span style={{ color: 'var(--purple-light)' }}>/pentest-report</span> no chat para gerar.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {withReports.map((e, ri) => {
            const nf = e.findingsCount ?? 0
            return (
              <div key={e.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '0.9rem 1.2rem', display: 'flex', alignItems: 'center', gap: 12,
                animation: `rowIn 0.3s ease both`, animationDelay: `${ri * 50}ms`,
              }}>
                <span style={{ color: 'var(--purple)', opacity: 0.85 }}>{FileIco(15, 'var(--purple)')}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{e.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>{e.target}</div>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-mute)', whiteSpace: 'nowrap', marginRight: 4 }}>
                  {nf} finding{nf === 1 ? '' : 's'}
                </span>
                {nf > 0 && (
                  <button
                    onClick={() => openGenerated(e, 'technical')}
                    disabled={previewLoading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6,
                      fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                      background: 'var(--purple)', color: '#fff', border: 'none',
                    }}
                  >
                    {EyeIco(12, '#fff')} Ver relatório
                  </button>
                )}
                {nf > 0 && isAdmin && (
                  <button
                    onClick={() => openGenerated(e, 'executive')}
                    disabled={previewLoading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6,
                      fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                      background: 'transparent', color: 'var(--purple-light)', border: '1px solid var(--border-hi)',
                    }}
                  >
                    {EyeIco(12, 'var(--purple-light)')} Ver executivo
                  </button>
                )}
                {nf > 0 && (
                  <a
                    href={api.reports.pdfUrl(e.id, 'technical')} download
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6,
                      fontSize: 11.5, fontWeight: 600, textDecoration: 'none',
                      background: 'transparent', color: 'var(--purple-light)', border: '1px solid var(--border-hi)',
                    }}
                  >
                    {DlIco(11, 'var(--purple-light)')} PDF
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div
          onClick={closePreview}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(2,2,8,0.88)',
            zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={preview.name}
            tabIndex={-1}
            onClick={(ev) => ev.stopPropagation()}
            style={{
              width: '90%', maxWidth: 1180, height: '92vh',
              background: 'var(--surface)', border: '1px solid var(--border-mid)',
              borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 24px 80px rgba(0,0,0,0.85)',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', padding: '0.65rem 1.1rem',
              borderBottom: '1px solid var(--border)',
              background: 'var(--panel)', gap: 10, flexShrink: 0,
            }}>
              <span style={{ color: 'var(--info)' }}>{FileIco(14, 'var(--info)')}</span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--muted)', fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>{preview.name}</span>
              <a href={preview.downloadUrl} download style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '0.28rem 0.7rem',
                background: 'var(--purple)', border: 'none', borderRadius: 5,
                fontSize: 10, color: 'white', fontWeight: 600, textDecoration: 'none', marginRight: 8,
              }}>
                {DlIco()} Baixar PDF
              </a>
              <button onClick={closePreview} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}>
                {XIco()}
              </button>
            </div>
            <iframe
              src={preview.blobUrl}
              style={{ flex: 1, border: 'none', background: 'var(--raised)' }}
              title={preview.name}
              // Relatório é HTML não-confiável (deriva de dados do alvo). Sandbox sem
              // allow-same-origin/allow-scripts → origem opaca, sem JS, sem acesso ao token.
              sandbox=""
            />
          </div>
        </div>
      )}
    </div>
  )
}
