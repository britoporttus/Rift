'use strict'
// P1-12 (auditoria 2026-07-20): extraído de server.js para ser testável sem os
// efeitos colaterais de boot do servidor (dotenv, Mongo connect, listen). Ver
// docs/ROADMAP-AUDITORIA-2026-07-20.md.
//
// `*.trycloudflare.com` é o domínio de "Quick Tunnels" anônimos/gratuitos da
// Cloudflare — qualquer atacante consegue um subdomínio em segundos. Com
// `credentials:true` no CORS, aceitar QUALQUER subdomínio desses por padrão é
// frágil (mitigado hoje só pelo cookie `SameSite=Lax`, uma defesa implícita).
// Fica atrás de opt-in explícito — em produção, prefira `ALLOWED_ORIGINS` com o
// hostname fixo do túnel nomeado real.
function isAllowedOrigin(origin, { origins, allowCfWildcard }) {
  if (!origin || origins.includes(origin)) return true
  if (allowCfWildcard && (/\.trycloudflare\.com$/.test(origin) || /\.cloudflareaccess\.com$/.test(origin))) return true
  return false
}

module.exports = { isAllowedOrigin }
