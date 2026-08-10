import { Radar, Globe, Cloud, Network, Boxes, Building2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Os módulos que a órbita da home apresenta.
 *
 * Fonte da verdade: `app/(app)/novo-pentest/page.tsx` (os tiles reais do funil)
 * + o módulo de Domínios/ASM, que não está no funil porque é a home do produto.
 * Se um tile mudar de nome, de escopo ou sair do "em construção", ESTE arquivo
 * precisa acompanhar — vender módulo que não existe quebra na primeira demo.
 */
export type LandingModule = {
  id: string
  title: string
  icon: LucideIcon
  /** como o módulo opera — aparece em mono ao lado do selo */
  mode: string
  /** false = ainda não entregue; vira selo "em breve" e não some da órbita */
  live: boolean
  desc: string
  /** o que a varredura cobre — chips curtos, sem frase */
  covers: string[]
  /** módulos que se combinam com este (ids desta mesma lista) */
  pairs: string[]
  /** frase de uma linha para o menu suspenso */
  tagline: string
  /** como o módulo opera, na ordem */
  how: string[]
  /** o que precisamos de você para rodar — honestidade sobre o custo de entrada */
  needs: string[]
}

export const MODULES: LandingModule[] = [
  {
    id: 'asm',
    title: 'Superfície',
    icon: Radar,
    mode: 'passivo · sem tocar no alvo',
    live: true,
    desc: 'Mapeia tudo o que já está exposto na internet sob um domínio — seu ou de um fornecedor. Roda sem autorização do alvo porque não sonda nada: só lê o que é público.',
    covers: ['subdomínios', 'DNS', 'portas', 'stack e WAF', 'takeover', 'score de risco'],
    pairs: ['web', 'lan'],
    tagline: 'O que já está exposto, sem tocar no alvo',
    how: [
      'Coleta fontes públicas (DNS, certificados, buscadores) para achar subdomínios',
      'Confere quais respondem, com que stack e atrás de qual WAF',
      'Calcula um score de segurança e destaca o que exige atenção',
    ],
    needs: [
      'Só o domínio. Nada mais.',
    ],
  },
  {
    id: 'web',
    title: 'Web / API',
    icon: Globe,
    mode: 'black-box ou autenticado',
    live: true,
    desc: 'Recon e checagens de uma aplicação web ou API. Externo por padrão; com credenciais, cobre também a área autenticada.',
    covers: ['swagger exposto', '.git / .env', 'CORS', 'endpoint sem auth', 'CVE do stack', 'bypass simples'],
    pairs: ['asm', 'cloud'],
    tagline: 'Recon e checagens de aplicação, externo ou autenticado',
    how: [
      'Mapeia rotas, tecnologias e superfície de entrada',
      'Testa as classes de alta confiança — exposição direta, auth ausente, CORS',
      'Reproduz cada suspeita antes de reportar; sem reprodução, vira "provável"',
    ],
    needs: [
      'A URL do alvo',
      'Autorização registrada',
      'Opcional: credenciais para a área logada',
    ],
  },
  {
    id: 'cloud',
    title: 'Cloud / Azure',
    icon: Cloud,
    mode: 'autenticado · service principal',
    live: true,
    desc: 'Pentest autenticado de nuvem com um Service Principal de leitura. As credenciais ficam apenas em memória durante a execução.',
    covers: ['identidades', 'storage público', 'políticas', 'rede virtual', 'segredos expostos'],
    pairs: ['web', 'ad'],
    tagline: 'Postura da sua nuvem, com credencial de leitura',
    how: [
      'Você cria um Service Principal somente-leitura',
      'O Rift inventaria identidades, storage, políticas e rede',
      'A credencial é usada em memória e descartada ao fim da execução',
    ],
    needs: [
      'Um Service Principal com permissão de leitura',
      'O ID do tenant e da assinatura',
    ],
  },
  {
    id: 'lan',
    title: 'Rede Interna',
    icon: Network,
    mode: 'agente local · LAN',
    live: true,
    desc: 'Um agente roda numa máquina de dentro e mapeia hosts, portas e serviços da rede. A plataforma consolida e pontua o risco.',
    covers: ['hosts vivos', 'portas e serviços', 'SMB e compartilhamentos', 'serviços legados', 'topologia'],
    pairs: ['ad', 'asm'],
    tagline: 'O que existe na sua rede interna, mapeado de dentro',
    how: [
      'Um agente roda numa máquina de dentro da rede',
      'Descobre hosts vivos, portas abertas e serviços expostos',
      'A plataforma consolida a topologia e pontua o risco de cada host',
    ],
    needs: [
      'Uma máquina na rede para rodar o agente',
      'Janela de execução acordada',
    ],
  },
  {
    id: 'ad',
    title: 'AD / on-prem',
    icon: Building2,
    mode: 'runner interno',
    live: false,
    desc: 'Active Directory e infraestrutura on-premises — caminhos de escalonamento, delegações e contas de serviço.',
    covers: ['BloodHound', 'NetExec', 'kerberoasting', 'ACL abusáveis'],
    pairs: ['lan', 'cloud'],
    tagline: 'Caminhos de escalonamento no Active Directory',
    how: [
      'Coleta o grafo do domínio a partir de um host associado',
      'Procura caminhos de escalonamento até contas privilegiadas',
      'Aponta a aresta mais barata de quebrar, não a lista inteira',
    ],
    needs: [
      'Runner interno (em construção)',
      'Conta de domínio de baixo privilégio',
    ],
  },
  {
    id: 'sap',
    title: 'SAP',
    icon: Boxes,
    mode: 'runner interno',
    live: false,
    desc: 'Avaliação de ambiente SAP — perfis, autorizações e serviços expostos do lado da aplicação.',
    covers: ['perfis e roles', 'RFC exposto', 'usuários padrão', 'notas de segurança'],
    pairs: ['ad'],
    tagline: 'Perfis, autorizações e serviços expostos do SAP',
    how: [
      'Inventaria perfis, roles e usuários padrão',
      'Verifica serviços RFC e web expostos',
      'Cruza com as notas de segurança aplicáveis à versão',
    ],
    needs: [
      'Runner interno (em construção)',
      'Usuário de auditoria no ambiente',
    ],
  },
]

export const MODULE_LABEL: Record<string, string> = MODULES.reduce(
  (acc, m) => { acc[m.id] = m.title; return acc },
  {} as Record<string, string>,
)
