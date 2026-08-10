'use client'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { PageHead, SectionHead, CtaBand } from '@/components/landing/blocks'
import { MODULES, MODULE_LABEL } from '@/components/landing/modules'

/**
 * Página de um módulo. Todo o conteúdo vem de `components/landing/modules.ts` —
 * uma rota, seis páginas. Se um módulo sair do "em construção", basta virar
 * `live: true` lá e esta página, o índice, o menu e a órbita acompanham juntos.
 */
export default function ModuloPage({ params }: { params: { id: string } }) {
  const mod = MODULES.find((m) => m.id === params.id)
  if (!mod) notFound()

  const Icon = mod.icon

  return (
    <>
      <div className="page">
        <div className="wrap">
          <Link href="/modulos" className="navcard-go" style={{ marginBottom: 18 }}>
            <ArrowLeft size={13} /> Todos os módulos
          </Link>
          <PageHead
            kicker={mod.live ? mod.mode : `${mod.mode} · em construção`}
            title={<><em>{mod.title}</em></>}
            lead={mod.desc}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <span className="modcard-i" style={{ width: 46, height: 46 }}><Icon size={22} /></span>
            <span className={`pill ${mod.live ? 'on' : 'soon'}`}>
              {mod.live ? 'Disponível' : 'Em breve'}
            </span>
          </div>
        </div>
      </div>

      <section className="blk">
        <div className="wrap">
          <SectionHead kicker="Como opera" title={<>Do disparo ao <em>achado</em></>} />
          <div className="howlist">
            {mod.how.map((step, i) => (
              <div className="howrow" key={step}>
                <b>/{String(i + 1).padStart(2, '0')}</b>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="twocol">
            <div className="col">
              <div className="cx-l" style={{ color: 'var(--accent)' }}>O que cobre</div>
              <ul>{mod.covers.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
            <div className="col">
              <div className="cx-l" style={{ color: 'var(--accent)' }}>O que precisamos de você</div>
              <ul>{mod.needs.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      {mod.pairs.length > 0 && (
        <section className="blk" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <SectionHead
              kicker="Combina com"
              title={<>Sozinho ele vê metade. <em>Junto, vê o caminho.</em></>}
              lead="Um achado isolado é um achado. Dois módulos cruzados viram uma rota de ataque."
            />
            <div className="modgrid">
              {mod.pairs.map((p) => {
                const other = MODULES.find((m) => m.id === p)
                if (!other) return null
                const OtherIcon = other.icon
                return (
                  <Link className="modcard" href={`/modulos/${other.id}`} key={p}>
                    <div className="modcard-top">
                      <span className="modcard-i"><OtherIcon size={20} /></span>
                      <div>
                        <h3>{MODULE_LABEL[p]}</h3>
                        <div className="modcard-m">{other.mode}</div>
                      </div>
                    </div>
                    <p>{other.tagline}</p>
                    <span className="navcard-go">Ver módulo <ArrowRight size={13} /></span>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <CtaBand
        kicker={mod.live ? 'Disponível hoje' : 'Ainda em construção'}
        title={mod.live
          ? <>Rode {mod.title}<br />no seu ambiente.</>
          : <>Quer {mod.title}?<br />Fale com a equipe.</>}
        lead={mod.live
          ? 'Configure o escopo na plataforma e acompanhe a execução ao vivo.'
          : 'Este módulo depende de um runner interno. Nos diga o seu caso — a fila de construção é priorizada por demanda real.'}
      />
    </>
  )
}
