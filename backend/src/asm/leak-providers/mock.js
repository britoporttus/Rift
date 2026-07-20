// Provider de DEMONSTRAÇÃO — dados sintéticos, determinísticos por domínio, ricos
// o bastante para exercitar TODAS as seções do módulo Vazamentos (estilo QuimeraX):
// credenciais de infostealer (malware) com URL/stealer/data + aparições em breaches.
// Nunca representa dados reais; a UI o rotula como "demo".
const id = 'mock'
const label = 'Demo (sintético)'

function hash(str) { let n = 0; for (let i = 0; i < str.length; i++) n = (n * 31 + str.charCodeAt(i)) >>> 0; return n }
// PRNG determinístico (mulberry32) — mesma seed (domínio) → mesmo resultado.
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function pick(r, arr) { return arr[Math.floor(r() * arr.length)] }

const STEALERS = ['Redline', 'Redline', 'Redline', 'Redline', 'Redline', 'Stealc', 'Stealc', 'Risepro', 'Nexus', 'Metastealer', 'Lumma', 'Unknown']
const LOGINS = ['vc', 'rm', 'op', 'go', 'ad', 'ti', 'fi', 'jo', 'ma', 'su']
const SAAS = ['https://app.kenoby.com', 'https://authentication.logmeininc.com/***', 'https://accounts.google.com/***', 'https://login.microsoftonline.com/***']

const BREACHES = [
  { breachName: 'Collection1', breachTitle: 'Collection #1', breachDate: '2019-01-07', dataClasses: ['Email addresses', 'Passwords'], hasPassword: true, pwnCount: 772904991 },
  { breachName: 'LinkedIn', breachTitle: 'LinkedIn', breachDate: '2021-06-22', dataClasses: ['Email addresses', 'Passwords'], hasPassword: true, pwnCount: 164611595 },
  { breachName: 'DemandScience', breachTitle: 'DemandScience by Pure Incubation', breachDate: '2024-11-04', dataClasses: ['Email addresses', 'Names', 'Job titles'], hasPassword: false, pwnCount: 121796165 },
  { breachName: 'AlienTxtbase', breachTitle: 'ALIEN TXTBASE', breachDate: '2025-02-01', dataClasses: ['Email addresses', 'Passwords'], hasPassword: true, pwnCount: 23000000000 },
  { breachName: 'Dropbox', breachTitle: 'Dropbox', breachDate: '2012-07-01', dataClasses: ['Email addresses', 'Passwords'], hasPassword: true, pwnCount: 68648009 },
]

// Datas espalhadas 2022→2026 para a timeline mensal.
function seenDate(r) {
  const year = pick(r, [2022, 2022, 2023, 2023, 2023, 2024, 2024, 2025, 2026])
  const month = 1 + Math.floor(r() * 12)
  const day = 1 + Math.floor(r() * 27)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function search(domain) {
  const r = rng(hash(domain) || 1)
  const breaches = []

  // 1) Credenciais de infostealer (malware) — o "prato principal" do QuimeraX.
  const nMalware = 12 + Math.floor(r() * 40)   // 12..51
  const hosts = ['corp', 'painel-barracuda', 'clientes', 'meet', 'webmail', 'vpn', 'portal', 'intranet', 'rdp']
  for (let i = 0; i < nMalware; i++) {
    const useSaas = r() < 0.25
    const url = useSaas ? pick(r, SAAS) : `https://${pick(r, hosts)}.${domain}${r() < 0.5 ? '/***' : ''}`
    breaches.push({
      category: 'malware',
      account: `${pick(r, LOGINS)}***@${domain}`,
      sourceUrl: url,
      stealerFamily: pick(r, STEALERS),
      seenDate: seenDate(r),
      hasPassword: true,
      dataClasses: ['Email addresses', 'Passwords'],
      description: 'Credencial corporativa capturada em log de infostealer (demo).',
    })
  }

  // 2) Aparições em breaches de base de dados.
  const nBreach = 2 + Math.floor(r() * 4)
  for (let i = 0; i < nBreach; i++) {
    const b = BREACHES[(Math.floor(r() * 997) + i) % BREACHES.length]
    breaches.push({
      category: 'breach',
      account: `${pick(r, LOGINS)}***@${domain}`,
      seenDate: b.breachDate,
      ...b,
      description: 'Aparição em vazamento de base de dados (demo).',
    })
  }

  return { available: true, breaches }
}

module.exports = { id, label, needsKey: false, search }
