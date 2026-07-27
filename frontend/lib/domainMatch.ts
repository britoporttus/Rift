// Mesmo critério de casamento host↔domínio do grafo de superfície
// (backend/src/graph/build.js normHost/hostMatchesDomain), replicado no client
// pra ligar engagements a Domínios sem precisar de um campo novo no banco —
// engagement.target é sempre um host "bare" (sem protocolo), então basta
// comparar sufixo contra Domain.domain.
export function normHost(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0].replace(/^www\./, '')
}

export function engagementMatchesDomain(target: string, domain: string): boolean {
  const h = normHost(target)
  const d = normHost(domain)
  return h === d || h.endsWith('.' + d)
}
