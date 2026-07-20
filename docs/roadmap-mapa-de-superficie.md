# Roadmap — Mapa de Superfície (grafo visual interligado)

**Para:** agente de desenvolvimento que vai construir a feature
**Plataforma:** Rift (monorepo Next.js 14 + Node/Express + MongoDB/Mongoose + WebSocket)
**Objetivo:** transformar os dados que os módulos de scan já coletam (domínios, subdomínios, IPs, tecnologias, exposições, vulns, credenciais/famílias de stealer) num **grafo interativo** — um "mapa mental" navegável que mostra visualmente como tudo se interliga.

> Este documento é auto-contido. Todos os arquivos citados são caminhos reais do repositório. Não invente estrutura nova onde já existe uma — reutilize os models e o padrão de rotas/paleta descritos abaixo.

---

## 1. O que JÁ existe (as fontes de dados — não recolete)

O grafo é uma **camada de visualização sobre dados que já estão no MongoDB**. As coleções relevantes:

| Model (arquivo) | O que tem | Campos-chave para o grafo |
|---|---|---|
| `backend/src/models/Domain.js` | Domínio-alvo (fornecedor/parceiro) + score de segurança | `_id`, `domain`, `name`, `riskScore`, `riskLevel`, `authorized` |
| `backend/src/models/DomainAsset.js` | Ativos descobertos pelo ASM passivo | `domainId`, `type` (`subdomain\|web\|url\|exposure`), `value` (host/url), `ips[]`, `cname`, `tech[]`, `webServer`, `tlsIssuer`, `alive`, `statusCode`, `severity`, `label`, `source` |
| `backend/src/models/Finding.js` | Vulns/achados dos pentests (engagements) | `engagementId`, `severity`, `title`, `type`, `location`, `state`, `cvss` |
| `backend/src/models/LeakedCredential.js` | Credenciais vazadas por domínio | `domain`, `category` (`malware\|breach`), `account` (mascarado), `stealerFamily`, `sourceUrl`, `breachName`, `seenDate` |
| `backend/src/models/LeakDomain.js` | Assessment de exposição por domínio | `domain`, `riskScore`, `agg.families` (mapa família→contagem) |

**Ponto de junção entre os módulos:** a **string de domínio** (`Domain.domain` == `DomainAsset` via `domainId` == `LeakedCredential.domain` == `LeakDomain.domain`). É por ela que o grafo costura ASM + Vazamentos. Findings ligam por `engagementId` → engagement → target (ver `backend/src/models/Engagement.js`, campo `target`); casar `engagement.target` com `Domain.domain`.

---

## 2. Modelo do grafo (nós e arestas)

Normalizar tudo para `{ nodes: [], edges: [] }`. Tipos de nó (cada um com cor/ícone próprios):

| Node `type` | Origem | `label` | Metadados |
|---|---|---|---|
| `domain` | Domain | `domain` | riskScore, riskLevel, authorized |
| `subdomain` | DomainAsset (subdomain/web) | `value` | alive, statusCode, title |
| `ip` | DomainAsset.ips[] (deduplicado) | o IP | quantos hosts resolvem nele |
| `tech` | DomainAsset.tech[] (deduplicado) | ex. "Apache", "React" | contagem de uso |
| `webserver` | DomainAsset.webServer | ex. "nginx" | — |
| `exposure` | DomainAsset(type=exposure) | label da exposição | severity |
| `vuln` | Finding | title | severity, cvss, state |
| `stealer_family` | LeakDomain.agg.families / LeakedCredential.stealerFamily | ex. "RedLine" | contagem |
| `leaked_account` | LeakedCredential (category=malware) | account mascarado | sourceUrl |
| `breach` | LeakedCredential (category=breach) | breachName | breachDate |

Arestas (`{ source, target, type }`):

- `domain` → `subdomain` (`has_subdomain`)
- `subdomain` → `ip` (`resolves_to`)  ← **IPs compartilhados viram hubs**: quando vários subdomínios apontam pro mesmo IP, o grafo mostra o cluster naturalmente.
- `subdomain` → `tech` (`runs`)
- `subdomain` → `webserver` (`served_by`)
- `subdomain`/`domain` → `exposure` (`exposes`)
- `subdomain`/`domain` → `vuln` (`vulnerable_to`)
- `domain` → `leaked_account` (`leaked`) ; `leaked_account` → `stealer_family` (`via`)
- `domain` → `breach` (`appears_in`)

**Por que isso é poderoso:** o mesmo IP/tech/stealer_family conectando domínios diferentes revela relações que uma tabela esconde (ex.: dois fornecedores no mesmo host, ou a mesma stack vulnerável repetida). É o valor central do mapa.

---

## 3. Backend — endpoint a criar

Criar `backend/src/api/graph.js` (montar em `server.js` como os outros: `app.use('/api/graph', graphRouter)` **antes** do 404, com `router.use(requireAuth())`). Seguir o padrão de `backend/src/api/domains.js`.

Dois modos:

```
GET /api/graph/domain/:id      → grafo de UM domínio (subdomínios, IPs, techs, exposições, vulns, leaks daquele domínio)
GET /api/graph                 → grafo GLOBAL (todos os domínios + os hubs compartilhados de IP/tech/stealer)
```

Resposta:
```json
{
  "nodes": [{ "id": "dom:porttus.com", "type": "domain", "label": "porttus.com", "meta": { "riskScore": 4, "riskLevel": "low" } }],
  "edges": [{ "source": "dom:porttus.com", "target": "sub:softwaregrc.porttus.com", "type": "has_subdomain" }],
  "stats": { "domains": 1, "subdomains": 8, "ips": 6, "techs": 12, "vulns": 3, "leaks": 0 }
}
```

Regras de montagem:
- `id` prefixado por tipo pra deduplicar (`ip:34.149.87.45`, `tech:apache`, `family:redline`) — um IP/tech aparece **uma vez** e recebe várias arestas.
- Deduplicar techs por lowercase; IPs por string.
- Cap de segurança: limitar nós (ex. top 2000) e **logar** o que truncou (não truncar em silêncio).
- Reusar `lib/severity` (cores) no back só se precisar; a cor real é aplicada no front.
- Nada de senha/segredo no payload — `leaked_account` usa o `account` já mascarado do model.

---

## 4. Frontend — visualização

**Rota:** `frontend/app/(app)/mapa/page.tsx` (grafo global) e, opcionalmente, uma aba/botão "Ver no mapa" na página do domínio (`frontend/app/(app)/dominios/[id]/page.tsx`) abrindo `/mapa?domain=<id>`.

**Nav:** adicionar item em `frontend/components/ui/Sidebar.tsx` (array `NAV_ALL` + um ícone novo no objeto `Ico`, ex. `share2`/`git-fork`) e em `PAGE_NAMES` de `frontend/app/(app)/layout.tsx`. Ver como `Domínios`/`Vazamentos` foram adicionados.

**Biblioteca de grafo (recomendação):** `react-force-graph-2d` (força dirigida, canvas, performático até milhares de nós, zero backend). Alternativas: `cytoscape.js` (mais controle de layout, melhor pra grafos grandes/hierárquicos) ou `@react-sigma`. **Recomendo `react-force-graph-2d`** pelo encaixe rápido com o visual "mapa mental" e canvas leve.
- Instalar no workspace do front: `npm i react-force-graph-2d --workspace=frontend`.
- Client component (`'use client'`), carregar com `next/dynamic` `ssr:false` (usa canvas/window).

**API client:** adicionar namespace em `frontend/lib/api.ts` (padrão dos outros): `api.graph.get()` e `api.graph.domain(id)`, com interfaces `GraphNode`/`GraphEdge`/`GraphResponse`.

---

## 5. Interações / UX

- **Cor por tipo de nó** + **tamanho por importância** (grau de conexão, ou riskScore pro domínio, severity pra vuln/exposure). Vulns/exposições `critical/high` em vermelho/laranja (usar `SEV_COLOR` de `frontend/lib/severity.ts`).
- **Filtro por tipo** (chips liga/desliga: domínios, IPs, techs, vulns, leaks) — reaproveitar o padrão de chips de `frontend/app/(app)/findings/page.tsx`.
- **Clique no nó** → painel lateral com detalhes (o metadado do nó) + botão de ir pra origem (`/dominios/:id`, `/vazamentos/:domain`).
- **Busca** (input) que centraliza/destaca um nó.
- **Hover** realça vizinhos (dim no resto).
- **Zoom/pan** nativos da lib; botão "reset".
- Empty state quando não há dados ("rode um scan em Domínios primeiro").

**Design:** paleta escura do Rift — fundo `--bg` (#080810), nós/arestas em tons de `--purple`/`--purple-light`, texto `--text`/`--muted`, severidades de `lib/severity`. Ver tokens em `frontend/app/globals.css` (`:root`). Estilo inline com `var(--*)` como o resto do app (Tailwind quase não é usado).

---

## 6. Fases de construção

1. **Backend do grafo por domínio** — `GET /api/graph/domain/:id` montando nodes/edges de DomainAsset (subdomínios→IP/tech/webserver/exposure). Já entrega valor com o que o ASM coleta hoje.
2. **Frontend base** — rota `/mapa`, `react-force-graph-2d`, cores por tipo, zoom/pan, clique→painel. Consumindo a fase 1.
3. **Vulns + leaks no grafo** — cruzar Findings (por `engagement.target`) e LeakedCredential/`agg.families` (por string de domínio). Nós `vuln`, `stealer_family`, `leaked_account`, `breach`.
4. **Grafo global + hubs compartilhados** — `GET /api/graph`, deduplicando IP/tech/família entre domínios (o pulo do gato: ver relações entre fornecedores).
5. **Polimento** — filtros por tipo, busca, realce de vizinhos, tamanho por importância, empty state, performance (cap + truncation logada).

---

## 7. Critérios de aceite

- [ ] `/mapa` renderiza um grafo navegável (zoom/pan/drag) com os dados reais do Mongo.
- [ ] Um domínio já escaneado (ex. porttus.com) mostra seus subdomínios ligados aos IPs, e IPs compartilhados aparecem como hubs.
- [ ] Clicar num nó abre detalhe e permite navegar pro módulo de origem.
- [ ] Filtros por tipo de nó funcionam.
- [ ] Vulns e exposições `critical/high` destacadas por cor.
- [ ] Nenhum segredo/senha no payload; contas de leak já mascaradas.
- [ ] Nav (Sidebar + breadcrumb) atualizada; segue a paleta escura.
- [ ] Truncamento (se houver) é logado, não silencioso.

---

## 8. Riscos / decisões abertas

- **Escala:** grafo global pode ficar denso. Mitigar com cap + filtros + colapsar clusters de IP. Se passar de ~2-3k nós, considerar `cytoscape.js` com layout `fcose`.
- **Casamento Finding↔Domain:** hoje Findings vivem por `engagementId`; o link com `Domain` é por `engagement.target` ≈ `domain`. Pode não bater 100% (subdomínio vs apex) — normalizar para o apex ao casar.
- **Tempo real (opcional):** o Rift já tem WebSocket (`hooks/useEngagementWS.ts`, notifier em `server.js`). Fase futura: empurrar novos nós ao vivo conforme o scan descobre. **Não** obrigatório no MVP — começar com fetch/polling.

---

*Gerado pelo agente do Rift como spec de handoff. O receptor deve ler os models/rotas citados antes de codar e reutilizar os padrões existentes (rota `requireAuth`, paleta `globals.css`/`lib/severity`, cliente `lib/api.ts`, nav `Sidebar.tsx`).*
