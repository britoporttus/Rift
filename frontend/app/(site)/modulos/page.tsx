'use client'
import Link from 'next/link'
import { PageHead, CtaBand } from '@/components/landing/blocks'
import { MODULES } from '@/components/landing/modules'

/** Índice dos módulos. Cada card leva para a página do módulo. */
export default function ModulosPage() {
  return (
    <>
      <div className="page">
        <div className="wrap">
          <PageHead
            kicker="Módulos"
            title={<>Seis superfícies. <em>Um painel.</em></>}
            lead="Cada módulo cobre uma superfície diferente do seu ambiente e alimenta o mesmo mapa. Dois ainda estão em construção — estão aqui porque fazem parte do plano, não porque já entregam."
          />
        </div>
      </div>

      <section className="blk">
        <div className="wrap">
          <div className="modgrid">
            {MODULES.map((m) => {
              const Icon = m.icon
              return (
                <Link className="modcard" href={`/modulos/${m.id}`} key={m.id}>
                  <div className="modcard-top">
                    <span className="modcard-i"><Icon size={20} /></span>
                    <div>
                      <h3>{m.title}</h3>
                      <div className="modcard-m">{m.mode}</div>
                    </div>
                  </div>
                  <p>{m.tagline}</p>
                  <span className="navcard-go">
                    {m.live ? 'Ver módulo' : 'Em breve'}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <CtaBand
        kicker="Não sabe por onde começar"
        title={<>Comece pela<br />superfície externa.</>}
        lead="É o único módulo que roda sem tocar no alvo e sem pedir nada além do domínio. O que ele achar decide os próximos."
      />
    </>
  )
}
