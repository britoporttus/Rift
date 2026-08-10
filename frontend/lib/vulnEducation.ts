import type { Finding } from '@/lib/api'

/**
 * Camada educativa dos findings (feature "Entenda a vulnerabilidade").
 *
 * Base curada por classe (CWE/OWASP) — determinística, sem custo de token e
 * precisa. O texto de "por quê / onde / impacto" é de NÍVEL DE CLASSE; o
 * componente mescla com os campos reais do finding (location, impact, severity)
 * para o específico. "Quando corrigir" sai da severidade (política de SLA).
 */

export interface VulnLesson {
  /** identificador estável da classe — chave da história em `lib/attackStory` */
  id: string
  title: string
  /** por que a vulnerabilidade acontece (causa raiz / mecanismo) */
  why: string
  /** onde tipicamente ocorre (contexto de classe) */
  where: string
  /** consequência real se explorada */
  impact: string
  /** true = casou numa classe específica; false = fallback genérico */
  matched: boolean
}

interface KbEntry {
  id: string
  title: string
  cwe?: string[]     // números, ex.: ['79']
  owasp?: string[]   // categoria, ex.: ['3'] para A03
  keywords: string[] // substrings (lowercase) casadas no título/tipo
  why: string
  where: string
  impact: string
}

/** Prazo sugerido de correção por severidade (guidance, não contratual). */
export const REMEDIATION_SLA: Record<string, string> = {
  critical: 'Corrigir imediatamente — janela de 24 a 72 horas.',
  high: 'Corrigir com prioridade — até 1 semana.',
  medium: 'Planejar no ciclo atual — até 30 dias.',
  low: 'Corrigir no próximo ciclo de manutenção.',
  info: 'Sem prazo — tratar como hardening/melhoria.',
}

const KB: KbEntry[] = [
  {
    id: 'xss', title: 'Cross-Site Scripting (XSS)', cwe: ['79'], owasp: ['3'],
    keywords: ['xss', 'cross-site scripting', 'cross site scripting'],
    why: 'A aplicação insere dados controlados pelo usuário numa página sem escapar/sanitizar, então o navegador da vítima executa scripts do atacante como se fossem do próprio site.',
    where: 'Valores refletidos na resposta (busca, erros, parâmetros de URL) ou conteúdo armazenado que volta para outros usuários (comentários, perfis).',
    impact: 'Roubo de sessão e cookies, ações em nome da vítima, captura de credenciais e desfiguração — na prática, rodar código no navegador de qualquer usuário.',
  },
  {
    id: 'sqli', title: 'SQL Injection', cwe: ['89'], owasp: ['3'],
    keywords: ['sql injection', 'sqli', 'injeção de sql'],
    why: 'Entradas do usuário são concatenadas direto na query SQL, permitindo alterar a lógica da consulta em vez de fornecer apenas dados.',
    where: 'Qualquer parâmetro que alimenta o banco — login, filtros, busca, ordenação, endpoints de API.',
    impact: 'Leitura, alteração ou exclusão de dados, bypass de autenticação e, em muitos casos, execução de comando no servidor de banco.',
  },
  {
    id: 'cors', title: 'Configuração incorreta de CORS', cwe: ['942'], owasp: ['5'],
    keywords: ['cors', 'cross-origin', 'access-control-allow-origin'],
    why: 'A política de CORS aceita/espelha qualquer origem (inclusive com credenciais), permitindo que sites de terceiros leiam respostas autenticadas.',
    where: 'Cabeçalhos de resposta de APIs e endpoints autenticados.',
    impact: 'Um site malicioso faz requisições autenticadas em nome da vítima e lê dados sensíveis do usuário logado.',
  },
  {
    id: 'exposed-interface', title: 'Interface sensível exposta', cwe: ['200', '538'], owasp: ['5', '1'],
    keywords: ['swagger', 'openapi', 'api docs', 'actuator', 'admin', 'phpmyadmin', 'painel', 'console', 'graphql playground', '.git'],
    why: 'Uma interface administrativa, de documentação ou de debug ficou acessível publicamente, sem autenticação ou restrição de rede.',
    where: 'Rotas como /swagger, /actuator, /admin, /phpmyadmin, /.git, /graphql e consoles de infra.',
    impact: 'Mapeamento da superfície interna, vazamento de rotas e segredos e, muitas vezes, acesso direto a funções administrativas ou dados.',
  },
  {
    id: 'missing-headers', title: 'Cabeçalhos de segurança ausentes', cwe: ['693'], owasp: ['5'],
    keywords: ['security header', 'header ausente', 'cabeçalho', 'hsts', 'content-security-policy', 'csp', 'x-frame-options'],
    why: 'O servidor não envia cabeçalhos de defesa (CSP, HSTS, X-Frame-Options…), deixando o navegador sem instruções para bloquear ataques comuns.',
    where: 'Respostas HTTP de toda a aplicação (configuração do servidor ou do web app).',
    impact: 'Amplia outras falhas: facilita XSS (sem CSP), sequestro de sessão por downgrade (sem HSTS) e clickjacking (sem X-Frame-Options).',
  },
  {
    id: 'subdomain-takeover', title: 'Subdomain takeover', owasp: ['5'],
    keywords: ['subdomain takeover', 'takeover', 'dangling', 'cname órfão'],
    why: 'Um registro DNS (CNAME) aponta para um serviço de terceiro já desprovisionado, permitindo ao atacante reivindicar o recurso e servir conteúdo no seu subdomínio.',
    where: 'Subdomínios com CNAME para provedores (Azure, S3, GitHub Pages, Heroku…) sem o recurso ativo.',
    impact: 'Controle total do subdomínio: phishing convincente na sua marca, roubo de cookies do domínio e abuso da confiança dos usuários.',
  },
  {
    id: 'exposed-service', title: 'Serviço/porta exposta', owasp: ['5'],
    keywords: ['porta aberta', 'open port', 'exposed service', 'serviço exposto', 'rdp', 'redis', 'mongodb', 'elasticsearch', 'database exposed', 'banco exposto'],
    why: 'Um serviço que deveria ser interno (banco, gerência, RDP) está acessível pela internet, normalmente por falta de firewall ou segmentação.',
    where: 'IPs públicos com portas de serviços sensíveis abertas (3389, 22, 3306, 6379, 9200…).',
    impact: 'Superfície direta para brute force, exploração de CVEs do serviço e acesso a dados/infra sem passar pela aplicação.',
  },
  {
    id: 'weak-tls', title: 'Fraqueza de TLS/SSL', cwe: ['326', '327'], owasp: ['2'],
    keywords: ['tls', 'ssl', 'cipher', 'cifra', 'certificate', 'certificado', 'protocolo obsoleto'],
    why: 'O serviço aceita protocolos/cifras obsoletas (SSLv3, TLS 1.0, RC4) ou tem certificado inválido/expirado, enfraquecendo a criptografia do canal.',
    where: 'Configuração TLS de servidores web, e-mail e APIs.',
    impact: 'Interceptação e adulteração do tráfego (man-in-the-middle) e captura de dados sensíveis em trânsito.',
  },
  {
    id: 'info-disclosure', title: 'Vazamento de informação', cwe: ['200'], owasp: ['5', '1'],
    keywords: ['information disclosure', 'vazamento', 'stack trace', 'verbose error', 'banner', 'server header', 'versão exposta', 'debug'],
    why: 'A aplicação ou o servidor revela detalhes internos — versões, caminhos, stack traces, tecnologias — em respostas ou erros.',
    where: 'Cabeçalhos de resposta, páginas de erro, comentários no HTML e mensagens de debug.',
    impact: 'Dá ao atacante o mapa do ambiente para escolher exploits precisos, acelerando e direcionando os próximos ataques.',
  },
  {
    id: 'default-creds', title: 'Credenciais padrão ou fracas', cwe: ['521', '1392'], owasp: ['7'],
    keywords: ['default credential', 'senha padrão', 'credencial fraca', 'weak password', 'admin:admin', 'força bruta', 'brute force'],
    why: 'Contas usam senhas de fábrica ou fáceis de adivinhar e o serviço não limita tentativas.',
    where: 'Painéis de admin, dispositivos de rede, bancos e serviços internos recém-instalados.',
    impact: 'Acesso administrativo imediato por login trivial ou brute force — em geral o caminho mais curto para o comprometimento total.',
  },
  {
    id: 'ssrf', title: 'Server-Side Request Forgery (SSRF)', cwe: ['918'], owasp: ['10'],
    keywords: ['ssrf', 'server-side request forgery', 'requisição do servidor'],
    why: 'A aplicação faz requisições para URLs fornecidas pelo usuário sem validar o destino, deixando o atacante mirar a rede interna a partir do servidor.',
    where: 'Funções de "buscar URL", webhooks, importadores, geradores de preview/thumbnail e integrações.',
    impact: 'Acesso a serviços internos, metadados de nuvem (credenciais IAM) e pivô para dentro da infraestrutura.',
  },
  {
    id: 'idor', title: 'Controle de acesso quebrado (IDOR)', cwe: ['639', '284'], owasp: ['1'],
    keywords: ['idor', 'broken access control', 'controle de acesso', 'autorização', 'privilege', 'privilégio'],
    why: 'A aplicação confia num identificador vindo do cliente (ID na URL) sem verificar se o usuário logado tem permissão sobre aquele recurso.',
    where: 'Endpoints com IDs (/conta/123, /pedido/456), APIs REST e funções administrativas.',
    impact: 'Acesso e alteração de dados de outros usuários, escalonamento de privilégio e exposição de informação em massa.',
  },
  {
    id: 'outdated-component', title: 'Componente desatualizado (CVE conhecido)', cwe: ['1104', '937'], owasp: ['6'],
    keywords: ['cve', 'outdated', 'desatualizado', 'vulnerable version', 'versão vulnerável', 'end of life', 'biblioteca vulnerável'],
    why: 'A aplicação usa uma versão de software/biblioteca com vulnerabilidade pública conhecida e exploit disponível.',
    where: 'Servidores web, frameworks, bibliotecas de front/back e dependências transitivas.',
    impact: 'Exploração com ferramentas prontas — de vazamento de dados a execução remota de código, conforme o CVE.',
  },
  {
    id: 'dir-listing', title: 'Listagem de diretórios', cwe: ['548'], owasp: ['5'],
    keywords: ['directory listing', 'listagem de diretório', 'index of', 'autoindex'],
    why: 'O servidor mostra o conteúdo de pastas quando não há arquivo índice, expondo arquivos que não deveriam ser navegáveis.',
    where: 'Diretórios estáticos, pastas de upload e backups em servidores com autoindex ligado.',
    impact: 'Descoberta de backups, código-fonte, credenciais e arquivos sensíveis deixados no servidor.',
  },
  {
    id: 'secret-exposure', title: 'Exposição de segredo', cwe: ['540', '312'], owasp: ['2'],
    keywords: ['secret', 'api key', 'chave de api', 'token exposto', '.env', 'credential leak', 'hardcoded', 'segredo'],
    why: 'Uma chave, token ou credencial ficou acessível em arquivo público, código-fonte, repositório ou resposta.',
    where: 'Arquivos .env e .git, bundles JS, comentários, respostas de API e repositórios.',
    impact: 'Uso direto da credencial para acessar serviços, nuvem ou dados — muitas vezes sem deixar rastro de "invasão".',
  },
  {
    id: 'open-redirect', title: 'Redirecionamento aberto', cwe: ['601'], owasp: ['1'],
    keywords: ['open redirect', 'redirecionamento aberto', 'url redirect'],
    why: 'A aplicação redireciona para uma URL informada pelo usuário sem validar o destino.',
    where: 'Parâmetros de retorno pós-login/logout (?next=, ?url=, ?redirect=).',
    impact: 'Phishing com a credibilidade do seu domínio e apoio a roubo de tokens em fluxos OAuth.',
  },
  {
    id: 'clickjacking', title: 'Clickjacking', cwe: ['1021'], owasp: ['5'],
    keywords: ['clickjacking', 'x-frame', 'frame-ancestors', 'iframe'],
    why: 'A página pode ser embutida num iframe de terceiros (sem X-Frame-Options/CSP frame-ancestors), permitindo sobrepor a UI e capturar o clique da vítima.',
    where: 'Páginas com ações sensíveis sem proteção anti-frame.',
    impact: 'A vítima executa ações (transações, mudanças de config) achando que clica em outra coisa.',
  },
]

const GENERIC: Omit<VulnLesson, 'matched'> = {
  id: 'generic',
  title: 'Contexto de segurança',
  why: 'Esta condição enfraquece a postura de segurança do alvo, criando uma oportunidade que um atacante pode encadear com outras falhas.',
  where: 'No ativo/endpoint indicado neste achado.',
  impact: 'Conforme o encadeamento, pode levar a acesso indevido, vazamento de dados ou interrupção do serviço.',
}

/** Resolve a lição para um finding. Prioridade: CWE > palavra-chave > OWASP > genérico. */
export function lessonFor(finding: Pick<Finding, 'title' | 'type' | 'cwe' | 'owasp'>): VulnLesson {
  const toLesson = (e: KbEntry): VulnLesson => ({ id: e.id, title: e.title, why: e.why, where: e.where, impact: e.impact, matched: true })
  const cweNum = (finding.cwe || '').match(/\d+/)?.[0] || null
  const owaspNum = (finding.owasp || '').match(/a\s*0*(\d{1,2})/i)?.[1] || null
  const hay = `${finding.title || ''} ${finding.type || ''}`.toLowerCase()

  if (cweNum) {
    const e = KB.find((k) => k.cwe?.includes(cweNum))
    if (e) return toLesson(e)
  }
  const byKeyword = KB.find((k) => k.keywords.some((kw) => hay.includes(kw)))
  if (byKeyword) return toLesson(byKeyword)
  if (owaspNum) {
    const e = KB.find((k) => k.owasp?.includes(owaspNum))
    if (e) return toLesson(e)
  }
  return { ...GENERIC, matched: false }
}
