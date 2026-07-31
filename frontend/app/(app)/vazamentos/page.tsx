'use client'
import Link from 'next/link'
import { Database, Clock, ArrowLeft } from 'lucide-react'

// Módulo Vazamentos pausado (reforma de UX 2026-07): "em construção" por ora — não
// é prioridade no roadmap atual. A lógica (providers, máscara LGPD, agregação) e os
// dados permanecem no backend; o sinal de vazamento foi neutralizado no score e no
// Mapa via RIFT_LEAKS_ENABLED. Esta tela substitui a UI antiga sem deletá-la (git).
export default function VazamentosEmConstrucao() {
  return (
    <div style={{ padding: '2rem', maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <div style={{
        background: 'var(--surface)', border: '1px dashed var(--border-mid)', borderRadius: 16,
        padding: '3.5rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--purple) 12%, transparent)', border: '1px solid var(--border-mid)', color: 'var(--purple-light)',
          position: 'relative',
        }}>
          <Database size={26} />
          <span style={{ position: 'absolute', bottom: -6, right: -6, width: 24, height: 24, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--purple-light)' }}>
            <Clock size={13} />
          </span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Vazamentos — em construção</div>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6, margin: 0, maxWidth: 460 }}>
          O módulo de exposição de credenciais está pausado por enquanto. Os dados já coletados
          seguem preservados; quando voltar, aparece de novo no menu. Por ora, o foco é o fluxo
          de pentest (Domínios → Novo Pentest).
        </p>
        <Link href="/dominios" style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 8, padding: '0.6rem 1.2rem',
          background: 'var(--purple)', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 700, textDecoration: 'none',
        }}>
          <ArrowLeft size={15} /> Voltar para Domínios
        </Link>
      </div>
    </div>
  )
}
