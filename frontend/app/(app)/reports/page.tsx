'use client'
import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api, Engagement, ReportFile, DomainSummary } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useEscapeClose } from '@/hooks/useEscapeClose'
import { engagementMatchesDomain } from '@/lib/domainMatch'
import {
  Page, PageHeader, Card, Btn, Collapsible, EmptyState, Kpi, KpiRow, tint,
} from '@/components/ui/kit'
import {
  FileText, Eye, Download, X, Globe, Target, Briefcase, Layers, Paperclip,
} from 'lucide-react'

interface PreviewState {
  name: string
  blobUrl: string
  ext: string
  downloadUrl: string
}

export default function ReportsPage() {
  // Suspense: a view lê ?engagement=/?domain= via useSearchParams.
  return (
    <Suspense fallback={<Page><div style={{ color: 'var(--text-mute)', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO…</div></Page>}>
      <ReportsView />
    </Suspense>
  )
}

function ReportsView() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const params = useSearchParams()
  const scopeEngagement = params.get('engagement') || ''
  const scopeDomainId   = params.get('domain') || ''

  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [domains, setDomains]         = useState<DomainSummary[]>([])
  const [reports, setReports]         = useState<Record<string, ReportFile[]>>({})
  const [loading, setLoading]         = useState(true)
  const [preview, setPreview]         = useState<PreviewState | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    Promise.all([api.engagements.list(), api.domains.list().catch(() => [] as DomainSummary[])])
      .then(async ([engs, doms]) => {
        setEngagements(engs)
        setDomains(doms)
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

  const scopeDomain = domains.find((d) => d.id === scopeDomainId) || null

  // Mostra qualquer engagement que TENHA o que relatar: findings no banco (relatório
  // gerado pelo Rift) OU arquivos narrativos do agente. Antes só listava arquivos crus.
  const withReports = useMemo(() => engagements.filter((e) => {
    if (scopeEngagement && e.id !== scopeEngagement) return false
    if (scopeDomain && !engagementMatchesDomain(e.target, scopeDomain.domain)) return false
    return (e.findingsCount ?? 0) > 0 || (reports[e.id]?.length ?? 0) > 0
  }), [engagements, reports, scopeEngagement, scopeDomain])

  const scopedEngagement = engagements.find((e) => e.id === scopeEngagement) || null
  const totalFiles = withReports.reduce((a, e) => a + (reports[e.id]?.length ?? 0), 0)
  const totalFindings = withReports.reduce((a, e) => a + (e.findingsCount ?? 0), 0)
  const scoped = !!(scopeDomain || scopedEngagement)

  // Domínio de origem de cada engagement — dá o caminho de volta ao assessment.
  const domainFor = (e: Engagement) => domains.find((d) => engagementMatchesDomain(e.target, d.domain)) || null

  return (
    <Page>
      <PageHeader
        icon={<FileText size={19} color="var(--purple-light)" />}
        title="Relatórios"
        subtitle={
          scopeDomain ? <>Relatórios dos pentests de <strong style={{ color: 'var(--text)' }}>{scopeDomain.domain}</strong>.</>
            : 'Relatório executivo (C-level) e técnico por engagement, gerados a partir dos achados — visualize no navegador ou baixe em PDF.'
        }
        eyebrow={
          scopeDomain ? { href: `/dominios/${scopeDomain.id}`, label: scopeDomain.domain }
            : scopedEngagement ? { href: `/engagement/${scopedEngagement.id}`, label: scopedEngagement.name }
            : undefined
        }
      />

      {scoped && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          background: tint('var(--purple)', 8), border: '1px solid var(--border-mid)',
          borderRadius: 10, padding: '0.6rem 0.95rem', fontSize: 12, color: 'var(--purple-light)',
        }}>
          {scopeDomain ? <Globe size={14} /> : <Target size={14} />}
          <span>Escopo: <strong>{scopeDomain ? scopeDomain.domain : scopedEngagement?.name}</strong></span>
          <Link href="/reports" style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11.5, color: 'var(--muted)', textDecoration: 'none',
          }}>
            <X size={12} /> ver todos
          </Link>
        </div>
      )}

      {!loading && withReports.length > 0 && (
        <KpiRow>
          <Kpi label="Engagements com relatório" value={withReports.length} color="var(--purple-light)" icon={<Briefcase size={18} />} />
          <Kpi label="Achados cobertos" value={totalFindings} color="var(--high)" icon={<Layers size={18} />} />
          <Kpi label="Arquivos do agente" value={totalFiles} color="var(--info)" icon={<Paperclip size={18} />}
            hint="narrativas geradas durante o run" />
        </KpiRow>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-mute)', textAlign: 'center', padding: '3rem', fontSize: 12, letterSpacing: '0.1em' }}>CARREGANDO...</div>
      ) : withReports.length === 0 ? (
        <EmptyState
          icon={<FileText size={32} />}
          title="Nenhum relatório disponível."
          hint="Relatórios são gerados a partir dos achados de um engagement. Rode um pentest para produzir o primeiro."
          action={<Btn variant="primary" href="/novo-pentest">Novo Pentest</Btn>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {withReports.map((e, ri) => {
            const nf = e.findingsCount ?? 0
            const files = reports[e.id] ?? []
            const dom = domainFor(e)
            return (
              <Card key={e.id} pad="1rem 1.2rem" style={{ animation: `rowIn 0.3s ease both`, animationDelay: `${Math.min(ri, 12) * 50}ms` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: 'var(--purple-light)',
                    background: tint('var(--purple)', 14), border: '1px solid var(--border-mid)',
                  }}>
                    <FileText size={16} />
                  </div>

                  <div style={{ flex: 1, minWidth: 180 }}>
                    <Link href={`/engagement/${e.id}`} style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>
                      {e.name}
                    </Link>
                    <div style={{ fontSize: 10.5, color: 'var(--text-mute)', marginTop: 3, fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{e.target}</span>
                      {dom && (
                        <Link href={`/dominios/${dom.id}`} title="Abrir assessment do domínio"
                          style={{ color: 'var(--purple-light)', textDecoration: 'none', fontFamily: 'inherit' }}>
                          · domínio
                        </Link>
                      )}
                      {nf > 0 && (
                        <Link href={`/findings?engagement=${e.id}`} title="Ver os achados deste engagement"
                          style={{ color: 'var(--purple-light)', textDecoration: 'none', fontFamily: 'inherit' }}>
                          · {nf} achado{nf === 1 ? '' : 's'}
                        </Link>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                    {nf > 0 && (
                      <Btn variant="primary" onClick={() => openGenerated(e, 'technical')} disabled={previewLoading}>
                        <Eye size={13} /> Técnico
                      </Btn>
                    )}
                    {nf > 0 && isAdmin && (
                      <Btn onClick={() => openGenerated(e, 'executive')} disabled={previewLoading}>
                        <Eye size={13} /> Executivo
                      </Btn>
                    )}
                    {nf > 0 && (
                      <a href={api.reports.pdfUrl(e.id, 'technical')} download
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.5rem 0.95rem',
                          borderRadius: 7, fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
                          background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)',
                        }}>
                        <Download size={13} /> PDF
                      </a>
                    )}
                  </div>
                </div>

                {/* Arquivos narrativos escritos pelo agente durante o run.
                    Eram buscados e contados no cabeçalho, mas nunca renderizados
                    — ficavam inacessíveis pela UI. */}
                {files.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <Collapsible title="Arquivos do agente" icon={<Paperclip size={12} />} count={files.length}
                      meta="gerados durante a execução">
                      {files.map((f) => (
                        <div key={f.name} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: 'var(--bg)', border: '1px solid var(--border)',
                          borderRadius: 8, padding: '0.55rem 0.8rem',
                        }}>
                          <FileText size={13} color="var(--text-mute)" />
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {f.name}
                          </span>
                          <button onClick={() => openPreview(f)} disabled={previewLoading} title="Visualizar"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6,
                              fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                              background: tint('var(--purple)', 12), color: 'var(--purple-light)', border: '1px solid var(--border-mid)',
                            }}>
                            <Eye size={11} /> Ver
                          </button>
                          <a href={f.url} download title="Baixar"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6,
                              fontSize: 11, fontWeight: 600, textDecoration: 'none',
                              background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)',
                            }}>
                            <Download size={11} />
                          </a>
                        </div>
                      ))}
                    </Collapsible>
                  </div>
                )}
              </Card>
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
              borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 24px 80px rgba(0,0,0,0.85)',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', padding: '0.65rem 1.1rem',
              borderBottom: '1px solid var(--border)',
              background: 'var(--panel)', gap: 10, flexShrink: 0,
            }}>
              <FileText size={14} color="var(--purple-light)" />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--muted)', fontWeight: 500, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preview.name}
              </span>
              <a href={preview.downloadUrl} download style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '0.28rem 0.7rem',
                background: 'var(--purple)', border: 'none', borderRadius: 6,
                fontSize: 10.5, color: 'white', fontWeight: 600, textDecoration: 'none', marginRight: 8,
              }}>
                <Download size={11} /> Baixar PDF
              </a>
              <button onClick={closePreview} aria-label="Fechar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, display: 'flex' }}
                onMouseEnter={(ev) => (ev.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={(ev) => (ev.currentTarget.style.color = 'var(--muted)')}>
                <X size={16} />
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
    </Page>
  )
}
