# Roadmap — Legibilidade e visões por papel

> **Escopo:** o módulo Domínios (ASM) e o que ele expõe. Nasce da crítica do
> operador em 2026-08-10 sobre a tela `/dominios` e o assessment de domínio.
>
> **Onde encaixa:** não é front novo. É o front **#2** do
> [PLANO-MESTRE](PLANO-MESTRE.md) §5 (*ASM: legibilidade e visões por papel*) —
> as fases 0–4 dão legibilidade, e as fases 5–6 puxam para perto os itens de
> §5.1 (papéis além de `admin`/`user`). O **#2b** (monitoramento risk-triggered)
> depende deste: "algo mudou" só vale se a tela souber dizer **o quê**.
>
> **Escopo ampliado em 2026-08-10:** começou na tela de Domínios, mas a Fase 1
> reorganiza o menu do produto inteiro — logo, vale para Rede Interna, Cloud,
> AD e SAP também.
>
> Legenda de tamanho: `P` cabe numa sessão · `M` duas a três · `G` semana

---

## 0. O que motivou

Onze queixas do operador, reagrupadas em cinco problemas — a lista longa
escondia que várias tinham a mesma raiz:

| | Problema | Sintomas relatados |
|---|---|---|
| **A** | Os números não se explicam | score invertido, ativos/vivos/exposições sobrepostos, `C`/`A`/`M`/`B` sem legenda, "+2 novos" de quê, "mais expostos" sem intuito |
| **B** | Não há profundidade | os 4 ativos e os 3 vivos não levam a lugar nenhum; só exposições aparecem listadas |
| **C** | Excesso na primeira tela | 10 cartões × 9 informações cada |
| **D** | Achado não tem ciclo de vida | ligar "exige atenção" ao explicador que já existe; gestor querendo "correções em andamento" |
| **E** | Três públicos, uma tela só | técnico / gestor / diretoria |

**Dependência dura:** D é pré-requisito de E. Hoje um achado nasce e fica —
não há estado, dono nem prazo. Construir a visão de gestor antes disso a faria
nascer como "a visão técnica com fonte maior", que é justamente o que se quer
evitar.

### 0.1. A descoberta que reordenou tudo

`Scan falhou: db is not defined`. A refatoração da Frente 0 passou `db` como
primeiro parâmetro, mas cinco fases de `asm/scanner.js` (`stageDns`,
`stageHttp`, `stageNuclei`, `stageTakeover`, `stagePortScan`) usavam `db` sem
recebê-lo. `scanner.js` não importa `db` por desenho, então dava
`ReferenceError` na primeira fase que grava ativo — que é a que grava
**subdomínio**.

Consequência: **nenhum scan de ASM funcionava desde a Frente 0.** As queixas de
"subdomínios só mostra 1", "não aparecem os 4 ativos e 3 vivos" e "monitoramento
de 30/07" eram dado morto, não design. Corrigido em 2026-08-10; a tela precisa
ser reavaliada com scan vivo antes de qualquer mudança visual.

---

## 1. Decisões tomadas (2026-08-10)

Não re-discutir sem motivo novo.

**1. O número do domínio passa a se chamar "Índice de exposição".**
`asm/score.js` computa **risco** (quanto maior, pior), mas a UI diz "Score de
segurança" — um domínio com 5 aparece pior do que é. Renomear mantém a conta e
o histórico de `DomainScan` intactos; inverter para `100 − risco` casaria com a
intuição de mercado (BitSight, SecurityScorecard) mas quebraria o histórico já
gravado. Escolhido: **renomear**, e corrigir a barra, que hoje vai de vermelho a
verde na direção errada.

**2. As três visões são papéis de acesso, não um seletor de tela.**
Contas diferentes do mesmo cliente entram e veem profundidades diferentes:
técnico vê tudo, gestor vê o andamento, diretor vê o núcleo — *"meu site está
seguro?"*. Três rotas com reaproveitamento entre si, não três produtos.

**3. Exposição (ASM) e finding (pentest) viram uma entidade só: "achado".**
Hoje são `DomainAsset{type:'exposure'}` e `Finding`. O gestor precisa de uma
fila só, e o ciclo de vida tem que valer para os dois — o ASM é o que roda todo
dia. É a mudança mais cara do roadmap e a que mais entrega.

---

## 2. As fases

```
Fase 0    destravar          →  o scan volta a rodar
Fase 0.5  triagem de bugs    →  o que o 1º scan real revelou (alimenta 2 e 5)
Fase 1    arquitetura de info→  o menu sai da proposta do produto
Fase 2    vocabulário        →  cada número responde uma pergunta
Fase 3    profundidade       →  todo número leva à lista que o sustenta
Fase 4    hierarquia         →  a tela decide o que vem primeiro
Fase 5    ciclo de vida      →  estado, dono, prazo
Fase 6    visões por papel   →  só agora faz sentido
```

**Critério de pronto, válido para todas:** a fase só fecha quando o operador
olha a tela e não precisa perguntar o que um número significa.

---

### Fase 0.5 — Os quatro bugs do primeiro scan real (2026-08-10)

O operador rodou `myakdmi.com` depois do deploy. Inspeção do banco
(`rift_t_porttus`) revelou que "os dados estão errados" são **quatro bugs
distintos**, não um. Evidência crua: 9 `DomainAsset` = 1 `web` + 8 `port`,
**zero `subdomain`**.

**Bug 1 — `stageHttp` apaga o subdomínio (perda de dado).** `stageDns` grava o
host como fingerprint `${domainId}:host:X` tipo `subdomain`; `stageHttp` grava o
**mesmo** fingerprint tipo `web`. `upsertAsset` faz `findOneAndUpdate` por
fingerprint → o `web` sobrescreve o `subdomain`. O apex vira `web` e some da aba
Subdomínios (que filtra `type==='subdomain'`). É por isso que "achou 1
subdomínio e não aparece em subdomínios". **Regressão da Frente 0. `P`.**

**Bug 2 — "9 ativos" conta porta como ativo.** Dos 9, oito são linhas de porta
(`104.21.66.2:443`, `:8080`…) de 2 IPs Cloudflare, 4 portas cada. É 1 host
inflado para 9. Mesma raiz do Bug 1: **um host é modelado como N linhas, não
como 1 asset com atributos.** Ver §3 (unidade de cobrança) — é o mesmo problema.

**Bug 3 — "26 vulns" com "0 exposições" e score 5.** `exposureCount=0` (ASM não
achou exposição real). Os "26 vulns" são nós `vuln` do **grafo** — `Finding` de
5 engagements de pentest, casados por string de domínio. Não são inventados, mas
`score.js` só soma exposições de ASM → **os 26 findings não entram no score**.
Um domínio "26 vulns / risco baixo" é a prova viva da decisão 3 (unificar
exposição e finding). Some no ciclo de vida, Fase 5.

**Bug 4 — "+8 novos" no monitoramento** = as 8 portas contadas como ativos
novos. Mesmo Bug 2 vazando para o diff.

**Decisão:** Bugs 1, 2 e 4 têm a **mesma raiz** (host = N linhas). Corrigir
junto na Fase 2 (modelar host como 1 asset, porta/serviço como atributo) em vez
de hot-patch — patch isolado do Bug 1 faria `assetCount` subir de 9 para 10 e
pioraria a queixa. Bug 3 é da Fase 5. Nenhum é hot-patch às cegas.

---

### Fase 0 — Destravar `P`

O fix de `db` já está em `asm/scanner.js`, testado (525/525 backend, 49/49
frontend, TypeScript limpo) e **não deployado**.

- [x] `db` passa pelas cinco fases e pelos seis pontos de chamada
- [x] Banner de prova de posse oculto atrás de `NEXT_PUBLIC_RIFT_DOMAIN_VERIFY`
      (componente e rota intactos — decisão: pronto, mas não vai a prod agora)
- [x] Deploy — feito em 2026-08-10 (build com `.next/cache` limpo + `pm2 restart`)
- [ ] Scan real num domínio autorizado (o operador roda)
- [ ] Reavaliar `/dominios` e `/dominios/[id]` com dado vivo

**Pronto quando:** um domínio mostra subdomínios completos e `lastScanAt` de hoje.
**Risco de pular:** todas as fases seguintes seriam desenhadas sobre dado de 30/07.

---

### Fase 1 — Arquitetura de informação `M`

> Acrescentada em 2026-08-10. O operador recusou a divisão atual do menu
> (*Superfície / Resultados / Sistema*): **"você tem que levar em consideração a
> proposta da solução para construir as páginas"**.

**O diagnóstico.** *Superfície* e *Resultados* são **etapas de um processo
interno**, não coisas que alguém procura. Ninguém abre o menu pensando "vou na
superfície" — pensa "quero ver a rede interna" ou "quero testar a aplicação".
A taxonomia descreve como o Rift funciona por dentro, e o menu tem que
descrever o que o cliente contratou.

**O eixo certo é o ambiente testado**, porque foi assim que o produto foi
descrito e — não por acaso — é assim que ele vai ser vendido:

```
ALVOS
  Web / API            domínios · subdomínios · pentest logado e não logado
  Rede interna         hosts · ESXi / Proxmox / VMware · Windows Server
  Cloud                Azure · Entra ID
  Active Directory     on-premises                                  🔜
  SAP                                                               🔜

RESULTADO
  Achados              fila única (Fase 5)
  Relatórios
  Mapa                 lente sobre todos os alvos

CONTA
  Usuários · Configurações
```

**Três consequências:**

- **"Domínios" deixa de ser um item de menu.** Domínio é o *inventário* do alvo
  externo, não o alvo. Vira a lista de entrada de **Web / API** — que é onde
  também vive o pentest com e sem login.
- **"Mapa" não é um lugar, é uma lente.** Sai de "alvos" e passa a ser
  acionável a partir de qualquer alvo (o botão "ver no mapa" já existe no
  domínio).
- **Itens futuros aparecem desabilitados.** O menu vira o roadmap visível para
  o cliente, e isso vende. Com a ressalva de dose: dois `🔜` comunicam ambição,
  cinco comunicam produto vazio.

**Pronto quando:** um cliente novo entende o que o produto faz lendo só o menu.

---

### Fase 2 — Vocabulário `M`

O problema não é layout, é modelo vazando para a tela.

**2.1 · Os contadores se sobrepõem.** `recomputeDomain` grava `assetCount` como
*todos* os `DomainAsset` — subdomínio + web + porta + exposição. Então
"4 ativos, 3 vivos, 2 exposições" são três recortes do mesmo conjunto, dois
deles aninhados: as exposições estão **dentro** dos ativos. Separar em grandezas
que não se contêm:

| hoje | vira | responde |
|---|---|---|
| `assetCount` (tudo) | `subdomainCount` | quantos nomes existem |
| `aliveCount` | `webAliveCount` | quantos respondem na web |
| `portCount` | `portCount` | quantas portas abertas |
| `exposureCount` | `exposureCount` | quantos problemas |

`assetCount` continua existindo no banco (histórico do `DomainScan` depende
dele), mas sai da UI.

**2.2 · Índice de exposição.** Renomear em `/dominios`, `/dominios/[id]`,
relatório e PDF. Inverter o sentido da barra. Manter o painel "por que este
score" — é o melhor da tela hoje e é o que impede que vire caixa-preta.

**2.3 · Severidade escrita por extenso.** `C`/`A`/`M`/`B` só existe abreviado.
No cartão, com espaço curto: ponto colorido + número + `tooltip`. No detalhe,
a palavra.

**2.4 · "+2 novos" ganha substantivo.** É `lastDiff.newCount` — ativos com
fingerprint inédito, de qualquer tipo. O número grande não diz de quê; a linha
de baixo já sabe ("+2 outros ativos (portas/IPs)"). Promover o substantivo para
o destaque.

**2.5 · "Domínios mais expostos" — decidir o destino.** É o top 6 por
`exposureCount`. Com 2 e 1 no ambiente real, ocupa meia tela para dizer "um
domínio tem duas coisas". Ranking só informa com volume.
**Proposta:** trocar por *"o que mudou desde ontem"* — que é a pergunta que o
monitoramento contínuo deveria responder, e que hoje nenhuma tela responde.

**Pronto quando:** nenhum número da tela precisa de explicação verbal, e nenhum
está contido em outro.

---

### Fase 3 — Profundidade `P`

Todo número vira porta. Hoje só exposições aparecem listadas; os 4 ativos e os
3 vivos são becos.

- `GET /:id/assets?type=` já existe e não tem limite — falta só a UI consumir
- Cada contador do assessment abre a lista que o sustenta
- Subdomínios: **todos**, com estado (vivo / não resolve / novo / sumiu), sem
  filtrar por antiguidade
- ~~"Exige atenção" liga ao explicador (`VulnEducation`, `AttackStory`)~~ →
  **movido para a Fase 5.** O explicador recebe um `Finding`; "Exige atenção"
  mostra exposição de ASM (`DomainAsset`). Ligar agora exigiria um shim de
  conversão que a Fase 5 (unificar exposição+finding em "achado") joga fora.
  Fica nativo quando exposição virar achado.

**Pronto quando:** de qualquer número dá para chegar à lista dele em um clique.

---

### Fase 4 — Hierarquia `M`

Só depois da 3, porque enxugar exige ter para onde mandar.

- **Cartão de domínio:** de nove informações para as que decidem se vale abrir —
  nome, índice, o que mudou, e o estado do scan. O resto vive no detalhe.
- **Home:** o topo responde "onde eu olho primeiro?", não "quantos domínios eu
  tenho". Os quatro KPIs atuais só informam quando há volume.
- Linha de comando/busca para quem tem muitos domínios (hoje a lista é a única
  navegação).

**Pronto quando:** a primeira tela cabe sem rolagem e diz para onde ir.

---

### Fase 5 — Ciclo de vida do achado `G`

A mudança estrutural. Exposição e finding viram **achado**, com estado.

**Modelo:** `estado` (novo → em correção → corrigido → aceito → falso positivo),
`dono`, `prazo`, `histórico de transição`. Prazo derivado de política por
severidade, com sobrescrita manual.

**Superfícies afetadas** — o custo real está aqui, não no modelo:
`asm/scanner.js` (grava exposição), `findings-watcher.js` (ingere do framework),
`api/findings.js`, `report.js` e o PDF, `graph/build.js` (o Mapa liga por
achado), os contadores de `recomputeDomain`, e a migração dos dados existentes.

**Regra que não pode ser quebrada:** re-scan não pode ressuscitar achado já
tratado. Um achado marcado "aceito" que continua aparecendo é o que faz o time
perder a confiança na lista — o problema que o produto inteiro existe para
resolver.

**Pronto quando:** dá para perguntar "o que está em correção agora?" e ter
resposta.

---

### Fase 6 — Visões por papel `G`

**Papéis.** Hoje o enum de `User` é `admin | user | client` — `client` é um só,
achatado. Proposta: manter `role` como o eixo de **acesso** (interno vs cliente,
já usado pela Frente 0) e acrescentar `depth` como eixo de **profundidade**
(`tecnico | gestor | diretor`). São ortogonais — um operador interno também
pode querer a leitura de gestor, e forçar cinco papéis achatados impediria isso.

| | técnico | gestor | diretor |
|---|---|---|---|
| pergunta | o que está exposto e como reproduzo? | o que mudou e quem está corrigindo? | estamos melhor ou pior? |
| forma | lista densa, evidência, CVE, porta | fila por estado, tendência, prazo estourado | uma linha do tempo e três números |
| rota | `/dominios` (atual) | `/painel` | `/executivo` |

**Reaproveitamento:** um núcleo de dados só (seletores sobre os mesmos
modelos), três composições. A de diretor provavelmente nem é lista — é
tendência + veredito.

**Depende de:** Fase 5 (sem estado, `/painel` não tem o que mostrar).

**Pronto quando:** três contas do mesmo cliente entram e cada uma vê a sua
pergunta respondida na tela inicial.

---

## 3. A unidade de cobrança é a mesma decisão da Fase 2

O modelo de negócio ainda está em aberto — **por ativo ou por domínio**, e o
formato do contrato indefinido. Mas as duas coisas se encontram aqui, e isso
muda a prioridade da Fase 2 de "UX" para "pré-requisito comercial":

**Se o contrato for por ativo, `ativo` não pode continuar sendo uma palavra
ambígua — ela vai na fatura.** Hoje `assetCount` soma subdomínio + host web +
porta + exposição. Cobrar sobre isso teria dois efeitos que o cliente percebe
na primeira conta:

1. **Cobrança dupla pelo mesmo host** — um subdomínio que responde na web e tem
   3 portas abertas conta como 5.
2. **Incentivo perverso**: exposição entra na conta, então *quanto pior a
   segurança do cliente, maior a fatura*. É indefensável numa renovação.

Por isso a Fase 2 tem que produzir uma grandeza faturável e defensável. A
candidata natural é **host único** (nome que resolve ou IP), que não se
sobrepõe, é estável entre scans e é o que o cliente reconhece como "meu
parque". Porta e exposição viram **atributo** do host, não unidade.

Por domínio é mais simples de vender e de explicar, mas trata igual um domínio
com 3 hosts e um com 4.000 — e é justamente em Rede Interna, Cloud e AD que a
contagem por domínio deixa de fazer sentido, porque lá não existe domínio.

**Decisão pendente do operador.** Registrado aqui porque, escolhida a unidade,
ela precisa ser contada do mesmo jeito em todos os alvos — e é a Fase 2 que
define esse jeito.

---

## 4. Fora de escopo

- **Billing e onboarding self-service** — §5.1 do PLANO-MESTRE, decidir depois
- **Prova de posse em produção** — pronta, oculta por decisão do operador
- **Vazamentos** — segue represado atrás de `RIFT_LEAKS_ENABLED`
- **Inverter o índice para `100 − risco`** — avaliado e recusado nesta rodada

## 5. Ordem e por quê

1 antes de tudo porque o menu define **quais páginas existem** — não dá para
enxugar uma tela cuja identidade ainda vai mudar. 2 logo em seguida porque
**toda visão herda o vocabulário**: se "score de segurança" continuar
significando o contrário do que diz, as três telas mentem juntas. 3 antes de 4
porque não se tira coisa da tela sem ter para onde mandar. 5 antes de 6 pela
dependência de estado. E 0 antes de tudo, porque até 10/08 estávamos criticando
dado morto.
