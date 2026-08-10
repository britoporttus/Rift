'use client'
import { PageHead, SectionHead, CtaBand } from '@/components/landing/blocks'

/**
 * Segurança e escopo.
 *
 * IMPORTANTE: cada afirmação aqui corresponde a um comportamento que existe no
 * produto — gate de autorização por domínio, credenciais só em memória durante a
 * execução, RBAC de fases agressivas (ver a tabela de papéis no CLAUDE.md) e
 * máscara de PII nos vazamentos. Não adicionar promessa que o código não cumpre:
 * esta é a página que um comprador manda para o jurídico dele.
 */

const RULES = [
  { t: 'Autorização primeiro', d: <>Um domínio só entra em varredura ativa depois de a autorização ser registrada na plataforma. Sem esse aceite, ele fica em <b>coleta passiva</b> — apenas fontes públicas, nada é enviado ao alvo.</> },
  { t: 'Credencial em memória', d: <>Credenciais de módulos autenticados (nuvem, área logada) vivem <b>só durante a execução</b> e não são persistidas em disco nem no banco.</> },
  { t: 'Fase agressiva com papel', d: <>Recon e enumeração qualquer operador dispara. Exploração e pós-exploração exigem <b>papel de administrador</b> — e um checkpoint aprovado, não um clique distraído.</> },
  { t: 'Dado pessoal mascarado', d: <>Onde a coleta esbarra em dado pessoal (credencial vazada, e-mail exposto), o valor é <b>mascarado na interface</b> por padrão.</> },
]

export default function SegurancaPage() {
  return (
    <>
      <div className="page">
        <div className="wrap">
          <PageHead
            kicker="Segurança e escopo"
            title={<>Nada é sondado <em>sem aceite</em></>}
            lead="Uma plataforma que testa segurança precisa ser a primeira a se comportar. Estas são as regras que valem para qualquer varredura, em qualquer módulo."
          />
        </div>
      </div>

      <section className="blk">
        <div className="wrap">
          <dl className="rules" style={{ marginTop: 0 }}>
            {RULES.map((r) => (
              <div className="rule" key={r.t}>
                <dt>{r.t}</dt>
                <dd>{r.d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <SectionHead
            kicker="Passivo × ativo"
            title={<>A diferença que <em>muda tudo</em></>}
            lead="A distinção que separa o que pode rodar de imediato do que precisa de contrato assinado."
          />
          <div className="twocol">
            <div className="col">
              <div className="cx-l" style={{ color: 'var(--accent)' }}>Coleta passiva</div>
              <div className="prose">
                <p>
                  Lê apenas o que já é público: registros DNS, certificados emitidos, índices de
                  buscadores, bases de vazamento. <b>Nenhum pacote sai em direção ao alvo.</b>
                </p>
                <p>
                  É por isso que você pode apontar o Rift para o domínio de um fornecedor sem
                  pedir autorização a ele — a informação já estava lá, exposta.
                </p>
              </div>
            </div>
            <div className="col">
              <div className="cx-l" style={{ color: 'var(--accent)' }}>Varredura ativa</div>
              <div className="prose">
                <p>
                  Envia requisições ao alvo para confirmar o que a coleta passiva sugeriu.
                  <b> Exige autorização registrada</b> antes de qualquer disparo.
                </p>
                <p>
                  Fases mais invasivas ficam atrás de um segundo portão: papel de administrador
                  e um checkpoint aprovado explicitamente durante a execução.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="blk" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <SectionHead kicker="Quem faz o quê" title={<>Papéis e <em>permissões</em></>} />
          <div className="howlist">
            {[
              ['Criar escopo e engajamento', 'Qualquer operador autenticado'],
              ['Rodar fases passivas (recon, enumeração)', 'Qualquer operador autenticado'],
              ['Rodar fases agressivas (exploração, pós)', 'Somente administrador'],
              ['Aprovar checkpoint crítico', 'Somente administrador — o operador é notificado'],
              ['Ver relatório técnico', 'Qualquer operador autenticado'],
              ['Ver relatório executivo e painel de custo', 'Somente administrador'],
            ].map(([a, q]) => (
              <div className="howrow" key={a} style={{ gridTemplateColumns: '1.4fr 1fr' }}>
                <span style={{ color: 'var(--text)' }}>{a}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{q}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        kicker="Dúvida de contrato?"
        title={<>Fale com a equipe<br />antes de assinar.</>}
        lead="Escopo, janela de execução e o que fica registrado — tudo definido antes da primeira varredura ativa."
      />
    </>
  )
}
