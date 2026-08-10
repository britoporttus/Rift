'use client'
import Link from 'next/link'
import { HeroScan } from '@/components/landing/HeroScan'
import { ExecPanel } from '@/components/landing/ExecPanel'
import { OrbitalAct } from '@/components/landing/OrbitalAct'
import { SectionHead, Contrast, NavCard, CtaBand } from '@/components/landing/blocks'
import { ScrambleText } from '@/components/ui/fx/ScrambleText'

/**
 * Home pública do Rift.
 *
 * O acesso à plataforma SEMPRE passa pelo login (home → login → dashboard) —
 * é por isso que "Acessar plataforma" aparece no topo, no hero e no fim. Não
 * remover esse caminho ao mexer no conteúdo.
 *
 * A tese sai de `docs/DIRECAO-PRODUTO.md` §2: o diferencial não é achar MAIS,
 * é achar CERTO. A home entrega essa tese e a órbita dos módulos; o detalhe de
 * cada assunto mora na sua própria página (/metodo, /entrega, /seguranca).
 */
export default function Home() {
  return (
    <>
      {/* ── abertura: o túnel, e o mergulho ao rolar ───────────────────── */}
      <HeroScan />

      {/* ── abertura: argumento à esquerda, produto à direita ──────────── */}
      <section className="intro">
        <div className="wrap intro-grid">
          <div className="intro-l" data-rv="left">
            <div className="kick">Plataforma de pentest contínuo</div>
            <h2>
              <ScrambleText text="Poucos achados." replayOnHover={false} playOnVisible />
              <em><ScrambleText text="Todos verdadeiros." replayOnHover={false} playOnVisible duration={34} /></em>
            </h2>
            <p className="lead">
              O Rift mapeia sua superfície externa e roda as checagens de baixo risco sozinho —
              e só reporta o que consegue <span className="strong">reproduzir</span>. Cada achado
              vem com a requisição, a resposta e o print que provam que ele existe.
            </p>
            <div className="hero-acts">
              <Link className="btn btn-p btn-lg" href="/login">Acessar plataforma</Link>
              <Link className="btn btn-lg" href="/modulos">Ver os módulos</Link>
            </div>
            <div className="since">
              Seis superfícies · relatório executivo e técnico · evidência obrigatória
            </div>
          </div>

          {/* entra depois da coluna da esquerda: a leitura ganha ordem */}
          <div data-rv="right" style={{ transitionDelay: '220ms' }}>
            <ExecPanel />
          </div>
        </div>
      </section>

      <OrbitalAct />

      {/* ── a tese ────────────────────────────────────────────────────── */}
      <section className="blk" id="metodo">
        <div className="wrap">
          <SectionHead
            kicker="O problema"
            title={<>Ninguém lê o <em>relatório de 200 críticas</em></>}
            lead="A adesão a pentest automatizado é baixa por um motivo só: falso positivo. Quando o time perde a confiança na lista, a lista inteira vira ruído — inclusive as três linhas que importavam."
          />
          <Contrast />
        </div>
      </section>

      {/* ── portas para o detalhe ─────────────────────────────────────── */}
      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <SectionHead
            kicker="Continue por aqui"
            title={<>O resto está <em>a um clique</em></>}
            lead="Cada assunto tem sua própria página — curta, direto ao ponto."
          />
          <div className="navcards">
            <NavCard
              href="/metodo" kicker="Método" title="Como funciona"
              body="As seis etapas, do escopo ao relatório, e as regras que decidem o que vira achado."
            />
            <NavCard
              href="/entrega" kicker="Entrega" title="O que você recebe"
              body="A anatomia de um achado, o mapa de superfície e os dois relatórios."
            />
            <NavCard
              href="/seguranca" kicker="Segurança" title="Como tratamos seu ambiente"
              body="Autorização antes de sondar, credenciais em memória e quem pode disparar o quê."
            />
          </div>
        </div>
      </section>

      <CtaBand
        kicker="Comece pela superfície"
        title={<>Aponte um domínio.<br />Veja o que aparece.</>}
        lead="A primeira varredura é passiva — mapeia o que já está exposto na internet sem tocar em nada. Você decide se vale ir adiante."
      />
    </>
  )
}
