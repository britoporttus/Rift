'use client'
import { AlertTriangle, Share2, FileText } from 'lucide-react'
import { PageHead, SectionHead, CtaBand } from '@/components/landing/blocks'

/**
 * O que você recebe — os três entregáveis, a anatomia de um achado e a
 * diferença entre os dois relatórios.
 */

const DELIVERABLES = [
  { icon: <AlertTriangle size={19} />, t: 'Achados com evidência',
    d: 'Requisição, resposta e print anexados. Severidade honesta: header ausente é informativo, não “vulnerabilidade”.' },
  { icon: <Share2 size={19} />, t: 'Mapa de superfície',
    d: 'Todo ativo descoberto ligado ao domínio, à tecnologia e ao achado que saiu dele — navegável, não uma planilha.' },
  { icon: <FileText size={19} />, t: 'Dois relatórios',
    d: 'Executivo em linguagem de negócio e técnico com o passo a passo da reprodução. PDF e HTML, na mesma varredura.' },
]

const ANATOMY = [
  ['Título e classe', 'O que é, na linguagem de quem vai corrigir — não o nome do plugin que detectou.'],
  ['Severidade e confiança', 'Duas coisas separadas: quão grave é, e quanto o Rift conseguiu confirmar.'],
  ['Alvo exato', 'Host, rota e parâmetro. Sem "o site está vulnerável".'],
  ['Evidência', 'A requisição enviada, a resposta recebida e o print da tela quando aplicável.'],
  ['Reprodução', 'Os passos para o seu time ver o mesmo com as próprias mãos.'],
  ['Remediação', 'O que mudar, com o porquê — não um link genérico para a OWASP.'],
]

export default function EntregaPage() {
  return (
    <>
      <div className="page">
        <div className="wrap">
          <PageHead
            kicker="Entrega"
            title={<>Prova, não <em>suspeita</em></>}
            lead="O que sai de uma varredura, e em que formato. Tudo é gerado na mesma execução — não há um passo manual depois."
          />
        </div>
      </div>

      <section className="blk">
        <div className="wrap">
          <div className="deliv">
            {DELIVERABLES.map((d) => (
              <div className="dl" key={d.t}>
                <div className="dl-i">{d.icon}</div>
                <h3>{d.t}</h3>
                <p>{d.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <SectionHead
            kicker="Anatomia"
            title={<>O que vem dentro de <em>um achado</em></>}
            lead="Seis campos, todos preenchidos. Um achado sem evidência não sai como confirmado — sai como provável, e diz isso."
          />
          <div className="howlist">
            {ANATOMY.map(([t, d], i) => (
              <div className="howrow" key={t}>
                <b>{String(i + 1).padStart(2, '0')}</b>
                <span><strong style={{ color: 'var(--text)', fontWeight: 600 }}>{t}</strong> — {d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <SectionHead
            kicker="Relatórios"
            title={<>Dois públicos, <em>dois documentos</em></>}
            lead="O mesmo dado, contado de dois jeitos. Mandar o técnico para a diretoria é como não mandar nada."
          />
          <div className="twocol">
            <div className="col">
              <div className="cx-l" style={{ color: 'var(--accent)' }}>Executivo</div>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>
                Para quem decide orçamento
              </h3>
              <ul>
                <li>Postura geral e como ela mudou desde a última varredura</li>
                <li>Os riscos em linguagem de negócio, sem jargão de ferramenta</li>
                <li>O que exige decisão agora e o que pode entrar no ciclo normal</li>
                <li>Sem payload, sem stack trace, sem nome de porta</li>
              </ul>
            </div>
            <div className="col">
              <div className="cx-l" style={{ color: 'var(--accent)' }}>Técnico</div>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>
                Para quem vai corrigir
              </h3>
              <ul>
                <li>Cada achado com host, rota, parâmetro e evidência anexada</li>
                <li>Passo a passo da reprodução, para o time confirmar sozinho</li>
                <li>Remediação específica, com o porquê da mudança</li>
                <li>O inventário completo do que foi descoberto na superfície</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        kicker="Comece pela superfície"
        title={<>Veja o relatório<br />do seu próprio domínio.</>}
        lead="A primeira varredura é passiva e já gera o mapa de superfície. Você decide se vale ir adiante."
      />
    </>
  )
}
