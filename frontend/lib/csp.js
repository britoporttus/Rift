'use strict'
// P0-4 (auditoria 2026-07-20): a aplicação subia sem NENHUM security header —
// sem CSP, sem X-Frame-Options, embutível em <iframe> de terceiro
// (clickjacking sobre a tela de login), e sem defesa em profundidade contra
// XSS caso um vetor apareça.
//
// `script-src` PRECISA manter 'unsafe-inline': testado empiricamente (build de
// produção + curl) que o App Router (Next 14.2.3) injeta `<script>` inline sem
// nonce para streaming de RSC (`self.__next_f.push(...)`) — tentativa de CSP
// estrita com nonce via middleware.ts NÃO fez esses scripts internos ganharem
// o atributo `nonce` (nem em request nem em response header), então
// `script-src 'self' 'nonce-x'` sem 'unsafe-inline' quebrava a hidratação da
// aplicação inteira (nenhum botão/WS/chat funcionaria). Ficou documentado
// como limitação conhecida — ver P3 de acessibilidade a strict-CSP no roadmap
// de auditoria; endurecer isso exige migrar para `next start` puro (sem
// custom server) e revalidar com um browser real antes de reativar nonce.
//
// Extraído de next.config.js (era anexado ao módulo exportado pra ser
// testável, mas o validador de config do Next passou a acusar a chave extra
// "buildCsp" como opção desconhecida — ver docs/ROADMAP-AUDITORIA-2026-07-20.md).
function buildCsp() {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    // 'self' já cobre o WS same-origin (proxiado por server.js). cavalier.hudsonrock.com
    // é chamado DIRETO do browser em vazamentos/[domain]/page.tsx (o IP de
    // datacenter do backend é bloqueado pela Hudson Rock; o operador consulta
    // do próprio navegador e cola o resultado).
    "connect-src 'self' https://cavalier.hudsonrock.com",
    // Preview de relatório usa `<iframe src={URL.createObjectURL(blob)}>`
    // (engagement/[id]/page.tsx, reports/page.tsx) — precisa de `blob:`
    // explícito em frame-src (nem todo browser trata blob: como 'self' por
    // padrão para fins de CSP).
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

module.exports = { buildCsp }
