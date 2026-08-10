'use client'
import { PageHead, SectionHead, Contrast, CtaBand } from '@/components/landing/blocks'

/**
 * Como funciona — as seis etapas + as regras anti-falso-positivo.
 * Conteúdo espelha `docs/DIRECAO-PRODUTO.md` §3 (o fluxo) e §6 (os princípios).
 * Se o fluxo do produto mudar, esta página muda junto.
 */

const STEPS = [
  { n: '01', t: 'Escopo', d: 'Você informa o alvo e o que está autorizado. Nada é sondado ativamente antes desse aceite — domínio sem autorização registrada fica só na coleta passiva.' },
  { n: '02', t: 'Intake guiado', d: 'Perguntas objetivas em etapas — ambiente, intensidade, WAF, foco — com respostas padrão sensatas. Dois minutos, não um formulário de trinta campos.' },
  { n: '03', t: 'Execução automática', d: 'Recon, enumeração e checagens de baixo risco encadeadas sem intervenção. A timeline mostra a fase atual e a ferramenta que está rodando agora.' },
  { n: '04', t: 'Achados ao vivo', d: 'Cada confirmação aparece no painel na hora — severidade, evidência, prova de conceito. Você não espera o relatório para saber que tem um bucket aberto.', hi: true },
  { n: '05', t: 'Checkpoint', d: 'Num ponto sensível o agente para e pergunta: "achei isto, quero tentar aquilo?" Ações agressivas exigem aprovação de quem tem o papel para dar.' },
  { n: '06', t: 'Relatório', d: 'Executivo para a diretoria e técnico para quem vai corrigir, com o mapa de superfície e a recomendação do que merece um humano olhando.' },
]

const RULES = [
  { t: 'Confirmar ou rebaixar', d: <>Sem reprodução real — requisição, resposta e print — o achado sai como <b>provável</b>, nunca como confirmado. A dúvida fica visível em vez de virar certeza.</> },
  { t: 'Verificação adversarial', d: <>Antes de reportar, uma passada tenta <b>derrubar o próprio achado</b>. O que sobrevive à tentativa de refutação é o que chega até você.</> },
  { t: 'Severidade honesta', d: <>Header ausente é <b>informativo</b>, não vulnerabilidade. Versão exposta é informativo. Inflar severidade compra atenção uma vez e perde a confiança para sempre.</> },
  { t: 'Evidência obrigatória', d: <>Todo achado carrega a <b>prova junto</b>. Se não dá para anexar a requisição ou o print, não dá para afirmar.</> },
]

export default function MetodoPage() {
  return (
    <>
      <div className="page">
        <div className="wrap">
          <PageHead
            kicker="Método"
            title={<>Você acompanha. <em>Ele executa.</em></>}
            lead="Não é um chat onde você digita comando a comando. É um painel que roda sozinho e para nos pontos em que a decisão é sua."
          />
        </div>
      </div>

      <section className="blk">
        <div className="wrap">
          <SectionHead kicker="O fluxo" title={<>Seis etapas, <em>uma varredura</em></>} />
          <div className="flow">
            {STEPS.map((s) => (
              <article className={`step${s.hi ? ' hi' : ''}`} key={s.n}>
                <div className="step-n">/{s.n}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <SectionHead
            kicker="O problema que isso resolve"
            title={<>Achar mais não é <em>achar melhor</em></>}
            lead="A adesão a pentest automatizado é baixa por um motivo só: falso positivo. Quando o time perde a confiança na lista, a lista inteira vira ruído."
          />
          <Contrast />
        </div>
      </section>

      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <SectionHead
            kicker="As regras"
            title={<>O que decide se algo <em>vira achado</em></>}
            lead="Quatro regras aplicadas antes de qualquer coisa aparecer no seu painel."
          />
          <dl className="rules">
            {RULES.map((r) => (
              <div className="rule" key={r.t}>
                <dt>{r.t}</dt>
                <dd>{r.d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <CtaBand
        kicker="Veja rodando"
        title={<>Uma varredura vale<br />mais que a explicação.</>}
        lead="Aponte um domínio e acompanhe a execução ao vivo — da coleta passiva ao primeiro achado confirmado."
      />
    </>
  )
}
