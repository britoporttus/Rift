// Detecção de subdomain takeover — PURA (sem DNS/DB), estilo asm/ports.js.
//
// Takeover = um subdomínio tem CNAME para um serviço de terceiro que foi
// desprovisionado (bucket S3 apagado, GitHub Pages removido, app Heroku morto…)
// e ficou "pendente" (dangling). Quem registrar aquele recurso de volta passa a
// servir conteúdo NAQUELE subdomínio do alvo → sequestro completo do host.
//
// Duas confirmações se somam no scanner:
//   • PASSIVO (sempre): heurística de CNAME pendente — este módulo. Zero pacote ao
//     alvo, só olha o que o DNS já devolveu (cname + se o host resolve).
//   • ATIVO (só autorizado): nuclei -tags takeover casa a impressão digital do
//     corpo HTTP ("There isn't a GitHub Pages site here" etc.) — confirmação forte.

// Sufixos de CNAME de serviços conhecidamente sujeitos a takeover (subconjunto
// curado de can-i-take-over-xyz / templates de takeover do nuclei). O rótulo é o
// nome do serviço mostrado no achado.
const FINGERPRINTS = [
  { service: 'GitHub Pages',        suffixes: ['github.io'] },
  { service: 'Heroku',              suffixes: ['herokuapp.com', 'herokudns.com', 'herokussl.com'] },
  { service: 'AWS S3',              suffixes: ['s3.amazonaws.com', 's3-website', 's3.dualstack', 'amazonaws.com'] },
  { service: 'AWS Elastic Beanstalk', suffixes: ['elasticbeanstalk.com'] },
  { service: 'Azure',               suffixes: ['azurewebsites.net', 'cloudapp.net', 'cloudapp.azure.com', 'trafficmanager.net', 'blob.core.windows.net', 'azure-api.net', 'azureedge.net', 'azurefd.net'] },
  { service: 'Fastly',              suffixes: ['fastly.net'] },
  { service: 'Shopify',             suffixes: ['myshopify.com'] },
  { service: 'Zendesk',             suffixes: ['zendesk.com'] },
  { service: 'Tumblr',              suffixes: ['domains.tumblr.com'] },
  { service: 'WordPress',           suffixes: ['wordpress.com'] },
  { service: 'Ghost',               suffixes: ['ghost.io'] },
  { service: 'Surge.sh',            suffixes: ['surge.sh'] },
  { service: 'Bitbucket',           suffixes: ['bitbucket.io'] },
  { service: 'Webflow',             suffixes: ['proxy.webflow.com', 'proxy-ssl.webflow.com', 'website.webflow.com'] },
  { service: 'Netlify',             suffixes: ['netlify.app', 'netlify.com'] },
  { service: 'Pantheon',            suffixes: ['pantheonsite.io'] },
  { service: 'Cargo',               suffixes: ['cargocollective.com'] },
  { service: 'Unbounce',            suffixes: ['unbouncepages.com'] },
  { service: 'Helpjuice',           suffixes: ['helpjuice.com'] },
  { service: 'Help Scout',          suffixes: ['helpscoutdocs.com'] },
  { service: 'Readme.io',           suffixes: ['readme.io'] },
  { service: 'Statuspage',          suffixes: ['statuspage.io'] },
  { service: 'Wufoo',               suffixes: ['wufoo.com'] },
  { service: 'Desk.com',            suffixes: ['desk.com'] },
  { service: 'Campaign Monitor',    suffixes: ['createsend.com'] },
  { service: 'Acquia',              suffixes: ['acquia-sites.com'] },
  { service: 'Fly.io',              suffixes: ['fly.dev'] },
  { service: 'Render',              suffixes: ['onrender.com'] },
  { service: 'Vercel',              suffixes: ['vercel-dns.com', 'vercel.app'] },
  { service: 'AWS CloudFront',      suffixes: ['cloudfront.net'] },
]

// Normaliza um hostname de CNAME: minúsculas, sem ponto final.
function normCname(cname) {
  if (!cname || typeof cname !== 'string') return null
  const c = cname.trim().toLowerCase().replace(/\.$/, '')
  return c || null
}

// Serviço conhecido para o CNAME, ou null. Casa por sufixo de host (…foo.github.io).
function matchService(cname) {
  const c = normCname(cname)
  if (!c) return null
  for (const fp of FINGERPRINTS) {
    for (const suf of fp.suffixes) {
      if (c === suf || c.endsWith('.' + suf) || c.includes(suf)) return fp.service
    }
  }
  return null
}

// detectTakeover({ host, cname, ips, nxdomain }) → achado ou null.
//
// Regra (falso-positivo baixo de propósito — só sinaliza o padrão clássico):
//   • host NÃO resolve (NXDOMAIN) MAS tem CNAME → CNAME pendente. É o primitivo #1
//     de takeover: a cadeia termina num nome não registrado. medium.
//       - se o CNAME casa um serviço conhecido, o rótulo nomeia o serviço.
//   • host resolve normalmente → NÃO sinaliza aqui (muitos CNAMEs legítimos
//     apontam pra github.io/netlify e estão vivos). A confirmação por corpo HTTP
//     fica pro nuclei (ativo). Evita ruído no passivo.
//
// `nxdomain` = a resolução A do host falhou com "não existe" (ENOTFOUND/NXDOMAIN),
// não um erro transitório — o chamador (stageDns) distingue pelo código do erro.
function detectTakeover({ host, cname, ips = [], nxdomain = false } = {}) {
  const c = normCname(cname)
  if (!c) return null
  if (ips && ips.length > 0) return null   // resolve → saudável no passivo
  if (!nxdomain) return null               // falha transitória, não dangling confirmado

  const service = matchService(c)
  return {
    host,
    cname: c,
    service,
    severity: 'medium',
    label: service
      ? `Possível subdomain takeover — CNAME → ${service} sem registro (host NXDOMAIN)`
      : `CNAME pendente (dangling) — aponta para ${c}, que não resolve`,
  }
}

module.exports = { FINGERPRINTS, normCname, matchService, detectTakeover }
