// Catálogo de remediação da rede interna — mapeia cada ACHADO gerado pelo
// analyze.js (backend) numa RECOMENDAÇÃO acionável: por que importa + o que fazer.
//
// Fonte dos rótulos (chaves): backend/src/internal/analyze.js → RULES[].label
// (+ 'Dispositivo não identificado', de analyzeHost). Se um rótulo mudar lá,
// atualize a chave aqui — o fallback (remediationFor) degrada pra um texto
// genérico em vez de quebrar, mas perde a recomendação específica.
import type { RiskLevel } from '@/lib/api'

export interface Remediation {
  severity: RiskLevel
  why: string // por que importa (1 linha)
  fix: string // a ação recomendada
}

export const REMEDIATION: Record<string, Remediation> = {
  'Telnet exposto (texto claro)': {
    severity: 'high',
    why: 'Login e comandos trafegam em texto claro — qualquer um no mesmo segmento captura as credenciais.',
    fix: 'Desative o Telnet (porta 23) e use SSH no lugar.',
  },
  'SMBv1 habilitado': {
    severity: 'high',
    why: 'Protocolo obsoleto e vetor do WannaCry/EternalBlue; não tem correção segura.',
    fix: 'Desabilite o SMBv1 (Windows: Set-SmbServerConfiguration -EnableSMB1Protocol $false) e mantenha só SMBv2/3.',
  },
  'SLP exposto em hypervisor (vetor ESXiArgs/CVE-2021-21974)': {
    severity: 'high',
    why: 'Vetor do ransomware ESXiArgs, que cifrou milhares de hosts ESXi sem autenticação.',
    fix: 'Desabilite o serviço SLP no ESXi e aplique o patch da CVE-2021-21974.',
  },
  'Interface de gerência de hypervisor exposta na rede': {
    severity: 'medium',
    why: 'O painel do hypervisor é a chave-mestra da virtualização — comprometê-lo derruba todas as VMs.',
    fix: 'Restrinja as portas de gerência (443/5480/8006/9443) a uma VLAN de management dedicada.',
  },
  'CIM/gerência de hardware exposta (5989)': {
    severity: 'medium',
    why: 'Gerência de hardware fora de banda acessível na rede amplia a superfície de ataque.',
    fix: 'Restrinja a porta 5989 à rede de management e desative se não estiver em uso.',
  },
  'rlogin/rsh/rexec exposto': {
    severity: 'high',
    why: 'Serviços "r" autenticam por confiança de host e trafegam em texto claro — trivial de sequestrar.',
    fix: 'Desabilite rlogin/rsh/rexec (512/513/514) e use SSH.',
  },
  'FTP exposto (texto claro)': {
    severity: 'medium',
    why: 'Credenciais e arquivos trafegam sem criptografia.',
    fix: 'Substitua o FTP por SFTP ou FTPS.',
  },
  'RDP exposto': {
    severity: 'medium',
    why: 'Alvo nº 1 de brute-force e ransomware quando alcançável na rede.',
    fix: 'Restrinja o RDP (3389) por firewall/VLAN, exija NLA e MFA; nunca exponha à internet.',
  },
  'VNC exposto': {
    severity: 'medium',
    why: 'Muitas instalações ficam sem senha ou sem criptografia — acesso remoto total ao host.',
    fix: 'Restrinja o VNC (5900-5902), exija senha forte e acesse só por túnel/VPN.',
  },
  'SNMP exposto': {
    severity: 'medium',
    why: 'Community strings padrão ("public") vazam topologia e às vezes credenciais.',
    fix: 'Desative SNMP v1/v2c, migre para v3 com autenticação e troque as community strings.',
  },
  'Compartilhamento SMB/NetBIOS exposto': {
    severity: 'medium',
    why: 'Principal via de movimentação lateral e ransomware dentro da rede.',
    fix: 'Restrinja SMB (445/139) ao necessário, desative NetBIOS e aplique least-privilege nos compartilhamentos.',
  },
  'Banco de dados exposto na rede': {
    severity: 'medium',
    why: 'Banco alcançável na LAN permite exfiltração direta se uma credencial vazar.',
    fix: 'Faça bind na interface interna/localhost, isole por firewall/VLAN e exija autenticação forte.',
  },
  'HTTP sem TLS': {
    severity: 'low',
    why: 'Tráfego — inclusive credenciais e cookies de sessão — trafega em texto claro.',
    fix: 'Habilite HTTPS/TLS e redirecione a porta 80 para 443.',
  },
  'TFTP exposto': {
    severity: 'low',
    why: 'Sem autenticação — usado para exfiltrar ou injetar arquivos de configuração.',
    fix: 'Desabilite o TFTP (porta 69) se não for estritamente necessário.',
  },
  'Dispositivo não identificado': {
    severity: 'low',
    why: 'Ativo não catalogado pode ser shadow-IT ou um dispositivo rogue conectado à rede.',
    fix: 'Identifique e classifique o dispositivo; se não for reconhecido, investigue e desconecte.',
  },
}

// Lookup com fallback: um achado sem entrada no catálogo ainda vira uma
// recomendação (genérica) em vez de sumir da tela.
export function remediationFor(label: string): Remediation {
  return REMEDIATION[label] || {
    severity: 'medium',
    why: 'Exposição que amplia a superfície de ataque na rede interna.',
    fix: 'Revise a necessidade deste serviço e restrinja o acesso por firewall/VLAN.',
  }
}
