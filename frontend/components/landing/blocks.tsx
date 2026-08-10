'use client'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { CONTACT_HREF } from './site'

/**
 * Peças compartilhadas entre a home e as páginas internas do site público.
 * Existem para que "cabeçalho de seção" e "faixa de CTA" tenham UMA definição —
 * foi exatamente a falta disso que deixou o app com seis dialetos visuais.
 */

export function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="kick">{children}</div>
}

/** Cabeçalho de página interna: rótulo, título grande e um parágrafo. */
export function PageHead({ kicker, title, lead }: {
  kicker: string
  title: React.ReactNode
  lead?: React.ReactNode
}) {
  return (
    <div className="page-head">
      <Kicker>{kicker}</Kicker>
      <h1 className="page-h1">{title}</h1>
      {lead && <p className="lead">{lead}</p>}
    </div>
  )
}

export function SectionHead({ kicker, title, lead }: {
  kicker: string
  title: React.ReactNode
  lead?: React.ReactNode
}) {
  return (
    <div className="blk-head">
      <Kicker>{kicker}</Kicker>
      <h2 className="sec">{title}</h2>
      {lead && <p className="lead">{lead}</p>}
    </div>
  )
}

/** Linha de barra do contraste — a largura entra na revelação (`data-w`). */
export function Bar({ label, w, v }: { label: string; w: string; v: string }) {
  return (
    <div className="r">
      <span>{label}</span>
      <span className="b"><i data-w={w} /></span>
      <b>{v}</b>
    </div>
  )
}

/** O contraste "achar mais" × "achar certo" — a tese de venda do produto. */
export function Contrast() {
  return (
    <>
      <div className="contrast">
        <div className="cx bad">
          <div className="cx-l">Scanner comum</div>
          <h3>Achar mais</h3>
          <p>
            Otimiza para cobertura. Reporta tudo o que <i>talvez</i> seja — header ausente vira
            &ldquo;vulnerabilidade&rdquo;, versão exposta vira &ldquo;crítico&rdquo;. O time trata as
            dez primeiras, descobre que oito não existem, e para de abrir o relatório.
          </p>
          <div className="stack">
            <Bar label="reportados" w="100%" v="200" />
            <Bar label="reais" w="6%" v="12" />
            <Bar label="lidos" w="2%" v="~4" />
          </div>
        </div>
        <div className="cx good">
          <div className="cx-l">Rift</div>
          <h3>Achar certo</h3>
          <p>
            Sem reprodução real — requisição, resposta e print — o achado não sai como confirmado.
            Antes de reportar, um passo adversarial tenta derrubar o próprio achado. O que sobra é
            curto o bastante para ser tratado inteiro.
          </p>
          <div className="stack">
            <Bar label="reportados" w="22%" v="18" />
            <Bar label="reais" w="22%" v="18" />
            <Bar label="lidos" w="22%" v="18" />
          </div>
        </div>
      </div>
      <p className="note">
        Números ilustrativos da diferença de método — não são uma medição de campanha.
      </p>
    </>
  )
}

/** Cartão de navegação para outra página do site. */
export function NavCard({ href, kicker, title, body }: {
  href: string; kicker: string; title: string; body: string
}) {
  return (
    <Link className="navcard" href={href}>
      <span className="navcard-k">{kicker}</span>
      <span className="navcard-t">{title}</span>
      <span className="navcard-b">{body}</span>
      <span className="navcard-go">Ver <ArrowRight size={13} /></span>
    </Link>
  )
}

export function CtaBand({ kicker, title, lead }: {
  kicker: string; title: React.ReactNode; lead: string
}) {
  return (
    <section className="cta" id="falar">
      <div className="cta-bg" />
      <div className="wrap">
        <div className="kick" style={{ justifyContent: 'center' }}>{kicker}</div>
        <h2>{title}</h2>
        <p className="lead" style={{ textAlign: 'center', maxWidth: '52ch' }}>{lead}</p>
        <div className="hero-acts" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-p btn-lg" href="/login">Acessar plataforma</Link>
          <a className="btn btn-lg" href={CONTACT_HREF}>Falar com a equipe</a>
        </div>
      </div>
    </section>
  )
}

export function SiteFooter() {
  return (
    <footer>
      <div className="wrap foot-top">
        <div className="foot-brand">
          <span className="mark-g">R</span>
          <span>Rift · Trustsis</span>
        </div>
        <nav className="foot-nav" aria-label="Rodapé">
          <Link href="/modulos">Módulos</Link>
          <Link href="/metodo">Como funciona</Link>
          <Link href="/entrega">O que você recebe</Link>
          <Link href="/seguranca">Segurança</Link>
          <a href={CONTACT_HREF}>Contato</a>
        </nav>
        <span className="foot-note">Testes autorizados apenas</span>
      </div>
    </footer>
  )
}
